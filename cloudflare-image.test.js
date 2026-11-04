const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateCloudflareImage } = require("./cloudflare-image.js");

const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const config = {
  CLOUDFLARE_ACCOUNT_ID: "test-account",
  CLOUDFLARE_API_TOKEN: "test-secret-token",
  CLOUDFLARE_IMAGE_MODEL: "@cf/black-forest-labs/flux-1-schnell",
  CLOUDFLARE_IMAGE_TIMEOUT_MS: 5000,
};

test("Cloudflare Workers AI generates an image with the configured model and bearer token", async () => {
  let request;
  const result = await generateCloudflareImage("Kucing astronot", config, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => imageBytes,
    };
  });

  assert.equal(
    request.url,
    "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/black-forest-labs/flux-1-schnell"
  );
  assert.equal(request.options.headers.Authorization, "Bearer test-secret-token");
  assert.deepEqual(JSON.parse(request.options.body), { prompt: "Kucing astronot" });
  assert.equal(result.mimetype, "image/png");
  assert.deepEqual(result.buffer, imageBytes);
});

test("Cloudflare Workers AI JSON image responses are decoded", async () => {
  const result = await generateCloudflareImage("Lanskap", config, async () => ({
    ok: true,
    headers: { get: () => "application/json" },
    arrayBuffer: async () => Buffer.from(JSON.stringify({
      result: { image: imageBytes.toString("base64") },
    })),
  }));
  assert.deepEqual(result.buffer, imageBytes);
});

test("Cloudflare Workers AI validates credentials, prompt length, and image content", async () => {
  await assert.rejects(
    generateCloudflareImage("Gambar", { ...config, CLOUDFLARE_API_TOKEN: "" }, async () => {
      assert.fail("Should not send a request without credentials");
    }),
    /belum diatur/
  );
  await assert.rejects(
    generateCloudflareImage("x".repeat(1001), config, async () => {
      assert.fail("Should not send an oversized prompt");
    }),
    /maksimal 1000 karakter/
  );
  await assert.rejects(
    generateCloudflareImage("Gambar", config, async () => ({
      ok: true,
      headers: { get: () => "application/octet-stream" },
      arrayBuffer: async () => Buffer.from("not an image"),
    })),
    /bukan file gambar/
  );
});

test("Cloudflare API errors are useful and redact the API token", async () => {
  await assert.rejects(
    generateCloudflareImage("Gambar", config, async () => ({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      arrayBuffer: async () => Buffer.from(JSON.stringify({
        errors: [{ message: `Invalid token ${config.CLOUDFLARE_API_TOKEN}` }],
      })),
    })),
    (error) => {
      assert.match(error.message, /Cloudflare Workers AI HTTP 401/);
      assert.doesNotMatch(error.message, new RegExp(config.CLOUDFLARE_API_TOKEN));
      return true;
    }
  );
});
