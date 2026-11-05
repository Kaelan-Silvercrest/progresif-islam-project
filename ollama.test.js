const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  classifyTargetedAbuse,
  generateMathResponse,
  getOllamaStatus,
  removeReasoningBlock,
  parseDecision,
} = require("./ollama.js");

const config = {
  OLLAMA_BASE_URL: "http://127.0.0.1:11434",
  OLLAMA_MODEL: "deepscaler",
  OLLAMA_MODERATION_MODEL: "llama-guard3:1b",
  OLLAMA_MATHAI_TIMEOUT_MS: 300_000,
  OLLAMA_MATHAI_MAX_PROMPT_CHARS: 12000,
  OLLAMA_MATHAI_MAX_RESPONSE_CHARS: 16000,
  OLLAMA_MATHAI_MAX_OUTPUT_TOKENS: 4096,
  OLLAMA_TIMEOUT_MS: 7000,
};

test("math response uses DeepScaleR with math-focused prompt and strips reasoning tags", async () => {
  let requestUrl;
  let requestBody;
  const answer = await generateMathResponse("Hitung 2 + 2", config, async (url, options) => {
    requestUrl = url;
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: "<think>Perhitungan internal</think>Langkah: \\(2 + 2 = 4\\).\n\\[\\boxed{4}\\]",
        },
      }),
    };
  });

  assert.equal(requestUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(requestBody.model, "deepscaler");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.options.num_predict, 4096);
  assert.match(requestBody.messages[0].content, /asisten matematika/i);
  assert.match(requestBody.messages[0].content, /LaTeX yang valid/);
  assert.equal(answer, "Langkah: \\(2 + 2 = 4\\).\n\\[\\boxed{4}\\]");
});

test("reasoning tags are removed from model output", () => {
  assert.equal(
    removeReasoningBlock("<think>private reasoning</think>Final result"),
    "Final result"
  );
  assert.equal(removeReasoningBlock("Visible answer"), "Visible answer");
  assert.equal(removeReasoningBlock("<think>unfinished reasoning"), "");
});

test("moderation parser accepts Llama Guard SAFE and UNSAFE categories", () => {
  assert.deepEqual(parseDecision("SAFE"), {
    violation: false,
    confidence: 1,
    category: "safe",
  });
  assert.deepEqual(parseDecision("UNSAFE\nS3, S4"), {
    violation: true,
    confidence: 1,
    category: "s3,s4",
  });
  assert.deepEqual(parseDecision(
    '{"violation":true,"confidence":0.92,"category":"racism"}'
  ), {
    violation: true,
    confidence: 0.92,
    category: "racism",
  });
});

test("moderation classification uses the configured local Llama Guard model and broad policy", async () => {
  let requestUrl;
  let requestBody;
  const result = await classifyTargetedAbuse(
    "Ancaman rasis kepada anggota",
    config,
    async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: { content: "UNSAFE\nS1, S3" } }),
      };
    }
  );

  assert.equal(requestUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(requestBody.model, "llama-guard3:1b");
  assert.equal(requestBody.stream, false);
  assert.equal(Object.hasOwn(requestBody, "format"), false);
  assert.match(requestBody.messages[0].content, /rasisme/);
  assert.match(requestBody.messages[0].content, /kata-kata kasar/);
  assert.match(requestBody.messages[0].content, /doxxing/);
  assert.match(requestBody.messages[1].content, /<BEGIN CONVERSATION>/);
  assert.deepEqual(result, { violation: true, confidence: 1, category: "s1,s3" });
});

test("Ollama status recognizes a latest-tag alias and reports moderation separately", async () => {
  const status = await getOllamaStatus(config, async () => ({
    ok: true,
    json: async () => ({
      models: [{ name: "deepscaler:latest" }, { name: "llama-guard3:1b" }],
    }),
  }));

  assert.equal(status.available, true);
  assert.equal(status.modelInstalled, true);
  assert.equal(status.mathModelInstalled, true);
});
