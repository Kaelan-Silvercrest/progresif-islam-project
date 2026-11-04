/*
 * Progresif Islam Project - WhatsApp Verification & Moderation Bot
 * Copyright (C) 2026 Ronan Calloway / Kaelan Silvercrest
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

function ollamaUrl(config, path) {
  return `${config.OLLAMA_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function timeoutSignal(config) {
  return AbortSignal.timeout(Math.max(500, Number(config.OLLAMA_TIMEOUT_MS) || 7000));
}

function modelIsInstalled(models, modelName) {
  const requestedName = String(modelName || "").replace(/:latest$/, "");
  return models.some((model) =>
    String(model.name || "").replace(/:latest$/, "") === requestedName
  );
}

async function getOllamaStatus(
  config,
  fetchImpl = globalThis.fetch,
  modelName = config.OLLAMA_MODERATION_MODEL || config.OLLAMA_MODEL
) {
  try {
    const response = await fetchImpl(ollamaUrl(config, "/api/tags"), {
      signal: timeoutSignal(config),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const installedModels = models.map((model) => model.name);
    return {
      available: true,
      modelInstalled: modelIsInstalled(models, modelName),
      mathModelInstalled: modelIsInstalled(models, config.OLLAMA_MODEL),
      modelName,
      models: installedModels,
    };
  } catch (error) {
    return {
      available: false,
      modelInstalled: false,
      mathModelInstalled: false,
      modelName,
      models: [],
      error: error?.message || "Ollama tidak tersedia",
    };
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
      model: config.OLLAMA_MODERATION_MODEL || config.OLLAMA_MODEL,
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

function removeReasoningBlock(content) {
  const text = String(content || "");
  const closingTag = text.lastIndexOf("</think>");
  if (closingTag >= 0) return text.slice(closingTag + "</think>".length).trim();
  return text.replace(/<think>[\s\S]*$/i, "").trim();
}

async function generateMathResponse(prompt, config, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(ollamaUrl(config, "/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(Math.max(1000, Number(config.OLLAMA_MATHAI_TIMEOUT_MS) || 120_000)),
    body: JSON.stringify({
      model: config.OLLAMA_MODEL,
      stream: false,
      options: {
        temperature: 0.6,
        top_p: 0.95,
        num_predict: config.OLLAMA_MATHAI_MAX_OUTPUT_TOKENS || 2048,
      },
      messages: [
        {
          role: "system",
          content:
            "Kamu adalah asisten matematika Ronan Calloway Bot. Selesaikan soal dengan teliti, " +
            "periksa kembali perhitungan dan jawaban akhir. Tampilkan langkah penyelesaian " +
            "yang ringkas dan mudah diikuti, rumus penting, lalu jawaban akhir dengan jelas. " +
            "Jangan mengarang asumsi; jika soal ambigu, jelaskan bagian yang perlu diperjelas. " +
            "Jangan tampilkan tag <think> atau penalaran internal; berikan hanya penjelasan " +
            "solusi yang relevan untuk pengguna. Untuk rumus, gunakan LaTeX yang valid dan " +
            "bungkus rumus display dengan \\[...\\], rumus inline dengan \\(...\\). Pisahkan " +
            "langkah-langkah dengan baris baru. Tulis uraian dalam Markdown sederhana; hindari " +
            "tabel dan jangan masukkan uraian bahasa ke dalam lingkungan matematika.",
        },
        { role: "user", content: String(prompt).slice(0, config.OLLAMA_MATHAI_MAX_PROMPT_CHARS || 6000) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  const answer = removeReasoningBlock(payload?.message?.content);
  if (!answer) throw new Error("DeepScaleR tidak mengembalikan solusi yang dapat ditampilkan");
  return answer.slice(0, config.OLLAMA_MATHAI_MAX_RESPONSE_CHARS || 6000);
}

module.exports = {
  classifyTargetedAbuse,
  generateMathResponse,
  getOllamaStatus,
  parseDecision,
  removeReasoningBlock,
};