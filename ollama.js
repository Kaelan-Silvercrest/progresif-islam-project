function ollamaUrl(config, path) {
  return `${config.OLLAMA_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function timeoutSignal(config) {
  return AbortSignal.timeout(Math.max(500, Number(config.OLLAMA_TIMEOUT_MS) || 7000));
}

async function getOllamaStatus(config, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl(ollamaUrl(config, "/api/tags"), {
      signal: timeoutSignal(config),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    return {
      available: true,
      modelInstalled: models.some((model) => model.name === config.OLLAMA_MODEL),
      models: models.map((model) => model.name),
    };
  } catch (error) {
    return { available: false, modelInstalled: false, models: [], error: error?.message || "Ollama tidak tersedia" };
  }
}

function parseDecision(content) {
  const text = String(content || "").trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("Respons model bukan JSON");

  const parsed = JSON.parse(jsonText);
  if (typeof parsed.targeted_abuse !== "boolean") {
    throw new Error("Respons model tidak memiliki targeted_abuse boolean");
  }
  const confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) throw new Error("Confidence model tidak valid");

  return {
    targetedAbuse: parsed.targeted_abuse,
    confidence: Math.min(1, Math.max(0, confidence)),
    category: String(parsed.category || "unknown").slice(0, 40),
  };
}

async function classifyTargetedAbuse(text, config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(ollamaUrl(config, "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: timeoutSignal(config),
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content:
            "Kamu classifier moderasi untuk komunitas inklusif. Nilai hanya apakah teks menyerang, menghina, mengejek, mengancam, atau mendorong pengucilan terhadap identitas seseorang/kelompok, terutama LGBT. Penyebutan netral, suportif, edukatif, atau laporan yang mengkritik ujaran kebencian bukan serangan. Jangan menulis ulang atau menambah hinaan. Balas JSON saja: {\"targeted_abuse\":boolean,\"confidence\":number 0..1,\"category\":\"insult|mockery|threat|exclusion|neutral\"}.",
        },
        { role: "user", content: `Teks untuk dinilai:\n${String(text).slice(0, 2000)}` },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  return parseDecision(payload?.message?.content);
}

async function generateChatResponse(prompt, config, fetchImpl = globalThis.fetch) {
  const timeoutMs = Math.max(1000, Number(config.OLLAMA_CHAT_TIMEOUT_MS) || 15_000);
  const response = await fetchImpl(ollamaUrl(config, "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      stream: false,
      options: { temperature: 0.4, num_predict: 384 },
      messages: [
        {
          role: "system",
          content: "Kamu Ronan Collaway Bot, chatbot komunitas yang ramah, inklusif, dan membantu. Jawab dalam bahasa yang dipakai pengguna, utamakan Bahasa Indonesia. Jawab ringkas dan jelas, maksimal beberapa paragraf. Jangan mengarang sumber atau mengaku melakukan tindakan di luar chat.",
        },
        { role: "user", content: String(prompt).slice(0, config.OLLAMA_CHAT_MAX_PROMPT_CHARS || 1200) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  const answer = String(payload?.message?.content || "").trim();
  if (!answer) throw new Error("Ollama mengembalikan jawaban kosong");
  return answer.slice(0, config.OLLAMA_CHAT_MAX_RESPONSE_CHARS || 1800);
}

module.exports = { classifyTargetedAbuse, generateChatResponse, getOllamaStatus, parseDecision };