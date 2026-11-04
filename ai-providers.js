const CHAT_SYSTEM_PROMPT =
  "Kamu Ronan Calloway Bot, chatbot komunitas yang ramah, inklusif, dan membantu. " +
  "Jawab dalam bahasa yang dipakai pengguna, utamakan Bahasa Indonesia. " +
  "Jawab ringkas dan jelas, maksimal beberapa paragraf. Jangan mengarang sumber " +
  "atau mengaku melakukan tindakan di luar chat.";

const SOSHUM_SYSTEM_PROMPT =
  "Kamu adalah asisten akademik sosial-humaniora yang kritis, adil, dan mudah dipahami. " +
  "Jawab terutama dalam Bahasa Indonesia. Bantu menjelaskan konsep, menganalisis " +
  "argumen, membandingkan perspektif, dan menyusun jawaban ilmu sosial, sejarah, " +
  "filsafat, budaya, politik, ekonomi, serta pendidikan. Berikan konteks dan bedakan " +
  "fakta, interpretasi, dan opini. Hindari generalisasi dan sudut pandang tunggal " +
  "untuk topik yang diperdebatkan. Jangan mengarang fakta, kutipan, atau sumber; " +
  "jika tidak yakin, nyatakan keterbatasannya dan sarankan cara memverifikasi. " +
  "Jawab terstruktur dan sesuai tingkat kedalaman pertanyaan. Untuk pertanyaan " +
  "analisis atau esai, berikan jawaban lengkap dengan tesis, uraian faktor atau " +
  "argumen utama, konteks/contoh yang relevan, dan kesimpulan. Jangan berhenti di " +
  "tengah kalimat atau memangkas jawaban; utamakan jawaban tuntas dan cukup rinci.";

const PROVIDERS = {
  groq: {
    keyField: "GROQ_API_KEY",
    modelField: "GROQ_MODEL",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    protocol: "openai",
  },
  gemini: {
    keyField: "GEMINI_API_KEY",
    modelField: "GEMINI_MODEL",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/",
    protocol: "gemini",
  },
  openrouter: {
    keyField: "OPENROUTER_API_KEY",
    modelField: "OPENROUTER_MODEL",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    protocol: "openai",
  },
  "openrouter-soshum": {
    keyField: "OPENROUTER_API_KEY",
    modelField: "OPENROUTER_SOSHUM_MODEL",
    timeoutField: "OPENROUTER_SOSHUM_TIMEOUT_MS",
    responseCharsField: "OPENROUTER_SOSHUM_MAX_RESPONSE_CHARS",
    outputTokensField: "OPENROUTER_SOSHUM_MAX_OUTPUT_TOKENS",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    protocol: "openai",
    systemPrompt: SOSHUM_SYSTEM_PROMPT,
  },
  cerebras: {
    keyField: "CEREBRAS_API_KEY",
    modelField: "CEREBRAS_MODEL",
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    protocol: "openai",
  },
};

function providerConfig(provider, config) {
  const definition = PROVIDERS[provider];
  if (!definition) throw new Error(`Provider AI tidak dikenal: ${provider}`);
  return {
    ...definition,
    apiKey: config[definition.keyField],
    model: config[definition.modelField],
    timeoutMs: config[definition.timeoutField] || config.AI_PROVIDER_TIMEOUT_MS,
    maxPromptChars: config.OLLAMA_CHAT_MAX_PROMPT_CHARS,
    maxResponseChars: config[definition.responseCharsField] || config.OLLAMA_CHAT_MAX_RESPONSE_CHARS,
    maxOutputTokens: config[definition.outputTokensField] || config.AI_PROVIDER_MAX_OUTPUT_TOKENS,
  };
}

function sanitizeProviderMessage(message, apiKey) {
  return String(message || "")
    .replaceAll(apiKey, "[REDACTED]")
    .replace(/gsk_[A-Za-z0-9_-]+|sk-or-v1-[A-Za-z0-9]+|AIza[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

async function requestJson(fetchImpl, url, options, provider, apiKey) {
  const response = await fetchImpl(url, options);
  const responseText = await response.text();
  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || responseText;
    throw new Error(
      `${provider} HTTP ${response.status}${message ? `: ${sanitizeProviderMessage(message, apiKey)}` : ""}`
    );
  }
  if (!payload) throw new Error(`${provider} mengembalikan respons JSON yang tidak valid.`);
  return payload;
}

async function generateProviderResponse(provider, prompt, config, fetchImpl = globalThis.fetch) {
  const settings = providerConfig(provider, config);
  if (!settings.apiKey) throw new Error("API key belum diatur pada environment.");
  if (!settings.model) throw new Error("Model belum dikonfigurasi.");

  const text = String(prompt).slice(0, settings.maxPromptChars || 1200);
  const signal = AbortSignal.timeout(Math.max(1000, Number(settings.timeoutMs) || 20_000));
  let answer;

  if (settings.protocol === "gemini") {
    const url = `${settings.endpoint}${encodeURIComponent(settings.model)}:generateContent`;
    const payload = await requestJson(fetchImpl, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.apiKey,
      },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CHAT_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: settings.maxOutputTokens || 384 },
      }),
    }, "Gemini", settings.apiKey);
    answer = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
  } else {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://github.com/Kaelan-Silvercrest/progresif-islam-project";
      headers["X-Title"] = "Ronan Calloway Bot";
    }

    const payload = await requestJson(fetchImpl, settings.endpoint, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: settings.systemPrompt || CHAT_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        temperature: 0.4,
        max_tokens: settings.maxOutputTokens || 384,
      }),
    }, provider, settings.apiKey);
    answer = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(answer)) {
      answer = answer.map((part) => part.text || "").join("");
    }
    answer = String(answer || "").trim();
  }

  if (!answer) throw new Error(`${provider} mengembalikan jawaban kosong.`);
  return answer.slice(0, settings.maxResponseChars || 1800);
}

module.exports = { generateProviderResponse, providerConfig };
