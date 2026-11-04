const assert = require("node:assert/strict");
const { test } = require("node:test");
const { generateProviderResponse, providerConfig } = require("./ai-providers.js");

const config = {
  GROQ_API_KEY: "test-groq-key",
  GROQ_MODEL: "test-groq-model",
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_MODEL: "test-gemini-model",
  OPENROUTER_API_KEY: "test-openrouter-key",
  OPENROUTER_MODEL: "test/openrouter-model",
  OPENROUTER_SOSHUM_MODEL: "nvidia/nemotron-3-ultra-550b-a55b:free",
  OPENROUTER_SOSHUM_TIMEOUT_MS: 600_000,
  OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS: 8192,
  OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS: 60000,
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
    assert.equal(request.options.headers.Authorization.startsWith("Bearer "), true);
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

test("OpenRouter soshum uses the shared key, dedicated model, and humanities prompt", async () => {
  assert.equal(providerConfig("openrouter-soshum", config).timeoutMs, 600_000);
  assert.equal(providerConfig("openrouter-soshum", config).maxOutputTokens, 8192);
  assert.equal(providerConfig("openrouter-soshum", config).maxResponseChars, 60000);
  let request;
  const answer = await generateProviderResponse("openrouter-soshum", "Analisis urbanisasi", config, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: "Analisis sosial." } }] }),
    };
  });

  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(request.options.headers.Authorization.startsWith("Bearer "), true);
  assert.equal(body.model, "nvidia/nemotron-3-ultra-550b-a55b:free");
  assert.equal(body.max_tokens, 8192);
  assert.match(body.messages[0].content, /sosial-humaniora/);
  assert.equal(body.messages[1].content, "Analisis urbanisasi");
  assert.equal(answer, "Analisis sosial.");
});

test("OpenRouter soshum keeps answers longer than the previous 12000-character limit", async () => {
  const longAnswer = "Penjelasan sosial-humaniora yang lengkap. ".repeat(400).trimEnd();
  const answer = await generateProviderResponse("openrouter-soshum", "Analisis", config, async () => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { content: longAnswer } }] }),
  }));
  assert.equal(answer, longAnswer);
  assert.ok(answer.length > 12000);
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
