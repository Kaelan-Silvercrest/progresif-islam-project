const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateProviderResponse } = require("./ai-providers.js");

const config = {
  GROQ_API_KEY: "test-groq-key",
  GROQ_MODEL: "test-groq-model",
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_MODEL: "test-gemini-model",
  OPENROUTER_API_KEY: "test-openrouter-key",
  OPENROUTER_MODEL: "test/openrouter-model",
  CEREBRAS_API_KEY: "test-cerebras-key",
  CEREBRAS_MODEL: "test-cerebras-model",
  AI_PROVIDER_TIMEOUT_MS: 5000,
  AI_PROVIDER_MAX_OUTPUT_TOKENS: 64,
  OLLAMA_CHAT_MAX_PROMPT_CHARS: 1200,
  OLLAMA_CHAT_MAX_RESPONSE_CHARS: 1800,
};

test("OpenAI-compatible providers use their API endpoint and keep the key in headers", async () => {
  for (const [provider, endpoint] of [
    ["groq", "https://api.groq.com/openai/v1/chat/completions"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions"],
    ["cerebras", "https://api.cerebras.ai/v1/chat/completions"],
  ]) {
    let request;
    const answer = await generateProviderResponse(provider, "Halo", config, async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        text: async () => JSON.stringify({ choices: [{ message: { content: `Jawaban ${provider}` } }] }),
      };
    });

    assert.equal(request.url, endpoint);
    assert.equal(request.options.headers.Authorization, `Bearer ${config[`${provider.toUpperCase()}_API_KEY`]}`);
    assert.equal(JSON.parse(request.options.body).messages[1].content, "Halo");
    assert.equal(answer, `Jawaban ${provider}`);
  }
});

test("Gemini uses the generateContent endpoint and x-goog-api-key header", async () => {
  let request;
  const answer = await generateProviderResponse("gemini", "Halo", config, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Jawaban " }, { text: "Gemini" }] } }],
      }),
    };
  });

  assert.equal(
    request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/test-gemini-model:generateContent"
  );
  assert.equal(request.options.headers["x-goog-api-key"], config.GEMINI_API_KEY);
  assert.equal(JSON.parse(request.options.body).contents[0].parts[0].text, "Halo");
  assert.equal(answer, "Jawaban Gemini");
});

test("providers report missing keys without making a network request", async () => {
  let requestCount = 0;
  await assert.rejects(
    generateProviderResponse("groq", "Halo", { ...config, GROQ_API_KEY: "" }, async () => {
      requestCount += 1;
    }),
    /API key belum diatur/
  );
  assert.equal(requestCount, 0);
});

test("provider errors include a safe, useful message without echoing API keys", async () => {
  await assert.rejects(
    generateProviderResponse("groq", "Halo", config, async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({
        error: {
          message: `The model is unavailable; received ${config.GROQ_API_KEY}`,
        },
      }),
    })),
    (error) => {
      assert.match(error.message, /groq HTTP 404/i);
      assert.match(error.message, /The model is unavailable/);
      assert.doesNotMatch(error.message, new RegExp(config.GROQ_API_KEY));
      return true;
    }
  );
});
