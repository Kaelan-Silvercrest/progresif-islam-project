/*
 * Progresif Islam Project - WhatsApp Verification & Moderation Bot
 * Copyright (C) 2026 Ronan Calloway / Kaelan Silvercrest
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

function normalizeText(value, config) {
  let normalized = String(value ?? "");
  if (config.MODERATION_NORMALIZE_UNICODE !== false) normalized = normalized.normalize("NFKC");
  if (config.MODERATION_STRIP_ZERO_WIDTH !== false) {
    normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, "");
  }
  if (config.MODERATION_ACCENT_FOLDING !== false) {
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  normalized = normalized.toLowerCase();

  if (config.MODERATION_MAP_LEETSPEAK !== false) {
    const leetspeakMap = config.MODERATION_LEETSPEAK_MAP || {};
    normalized = normalized.replace(/[0-9@$]/g, (character) => leetspeakMap[character] || character);
  }
  if (config.MODERATION_COLLAPSE_REPEATED_CHARS !== false) {
    const repeatLimit = Math.max(1, Number(config.MODERATION_REPEAT_CHAR_LIMIT) || 1);
    normalized = normalized.replace(/(.)\1+/g, (sequence, character) =>
      character.repeat(Math.min(repeatLimit, sequence.length))
    );
  }
  if (config.MODERATION_PUNCTUATION_AS_SEPARATOR !== false) {
    normalized = normalized.replace(/[^a-z0-9]+/g, " ");
  }
  return normalized.trim();
}

function withinEditDistance(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > limit) return false;
    previous = current;
  }

  return previous[right.length] <= limit;
}

function matchToken(token, keyword, config, allowFuzzy) {
  if (token === keyword) return { matched: true, fuzzy: false };

  const suffixLimit = Math.max(0, Number(config.MODERATION_PREFIX_VARIANT_MAX_EXTRA) || 0);
  if (
    allowFuzzy &&
    config.MODERATION_MATCH_PREFIX_VARIANTS !== false &&
    keyword.length >= 3 &&
    token.startsWith(keyword) &&
    token.length - keyword.length <= suffixLimit
  ) {
    return { matched: true, fuzzy: true };
  }

  const minimumLength = Math.max(1, Number(config.MODERATION_FUZZY_MIN_TOKEN_LENGTH) || 1);
  const editLimit = Math.max(0, Number(config.MODERATION_FUZZY_MAX_EDIT_DISTANCE) || 0);
  if (
    allowFuzzy &&
    Math.min(token.length, keyword.length) >= minimumLength &&
    withinEditDistance(token, keyword, editLimit)
  ) {
    return { matched: true, fuzzy: true };
  }
  return null;
}

function findKeywordSignals(normalizedText, keywords, config, allowFuzzy = true) {
  const textTokens = normalizedText.split(/\s+/).filter(Boolean);
  const matches = new Map();

  for (const keyword of keywords || []) {
    const keywordTokens = normalizeText(keyword, config).split(/\s+/).filter(Boolean);
    if (!keywordTokens.length) continue;

    for (let start = 0; start <= textTokens.length - keywordTokens.length; start += 1) {
      let fuzzy = false;
      let matched = true;
      for (let offset = 0; offset < keywordTokens.length; offset += 1) {
        const tokenMatch = matchToken(
          textTokens[start + offset],
          keywordTokens[offset],
          config,
          allowFuzzy
        );
        if (!tokenMatch) {
          matched = false;
          break;
        }
        fuzzy ||= tokenMatch.fuzzy;
      }
      if (matched) {
        const span = `${start}:${start + keywordTokens.length}`;
        const previous = matches.get(span);
        if (!previous || (previous.fuzzy && !fuzzy)) matches.set(span, { fuzzy });
      }
    }
  }

  const maximumSignals = Math.max(1, Number(config.MODERATION_MAX_SIGNALS_PER_CATEGORY) || 1);
  const signals = [...matches.values()].slice(0, maximumSignals);
  return {
    count: signals.length,
    fuzzyCount: signals.filter((signal) => signal.fuzzy).length,
    matched: signals.length > 0,
  };
}

function hasSeparatedLgbtAcronym(normalizedText, config) {
  if (config.MODERATION_MATCH_SEPARATED_ACRONYMS === false) return false;
  const tokens = normalizedText.split(/\s+/).filter(Boolean);
  for (let index = 0; index <= tokens.length - 4; index += 1) {
    if (tokens.slice(index, index + 4).join("") === "lgbt") return true;
  }
  return false;
}

function hasMockeryEmoji(text, config) {
  return config.MODERATION_MATCH_MOCKERY_EMOJI !== false &&
    (config.MODERATION_MOCKERY_EMOJIS || []).some((emoji) => text.includes(emoji));
}

function matchModerationKeywords(text, config) {
  const normalizedText = normalizeText(text, config);
  const blockedPhrases = findKeywordSignals(
    normalizedText,
    config.MODERATION_BLOCKED_PHRASES,
    config,
    false
  );
  const exactIdentity = findKeywordSignals(
    normalizedText,
    config.MODERATION_IDENTITY_KEYWORDS,
    config,
    false
  );
  const fuzzyIdentity = config.MODERATION_FUZZY_IDENTITY_MATCHING === false
    ? { count: 0, fuzzyCount: 0, matched: false }
    : findKeywordSignals(
      normalizedText,
      config.MODERATION_FUZZY_IDENTITY_KEYWORDS || config.MODERATION_IDENTITY_KEYWORDS,
      config,
      true
    );
  const identity = {
    count: Math.max(exactIdentity.count, fuzzyIdentity.count),
    fuzzyCount: fuzzyIdentity.fuzzyCount,
    matched: exactIdentity.matched || fuzzyIdentity.matched,
  };
  const separatedAcronym = hasSeparatedLgbtAcronym(normalizedText, config);
  const insults = findKeywordSignals(
    normalizedText,
    config.MODERATION_INSULT_KEYWORDS,
    config,
    config.MODERATION_FUZZY_INSULT_MATCHING !== false
  );
  const attacks = findKeywordSignals(
    normalizedText,
    config.MODERATION_ATTACK_KEYWORDS,
    config,
    config.MODERATION_FUZZY_ATTACK_MATCHING !== false
  );
  const mockery = findKeywordSignals(
    normalizedText,
    config.MODERATION_MOCKERY_KEYWORDS,
    config,
    config.MODERATION_FUZZY_MOCKERY_MATCHING !== false
  );
  const directSlurs = findKeywordSignals(
    normalizedText,
    config.MODERATION_DIRECT_IDENTITY_SLURS,
    config,
    config.MODERATION_FUZZY_IDENTITY_MATCHING !== false
  );
  const emojiMockery = hasMockeryEmoji(text, config);

  let score = blockedPhrases.count * (Number(config.MODERATION_BLOCKED_PHRASE_SCORE) || 0);
  score += identity.count * (Number(config.MODERATION_SCORE_IDENTITY) || 0);
  score += identity.fuzzyCount * (Number(config.MODERATION_SCORE_FUZZY_IDENTITY) || 0);
  score += separatedAcronym ? Number(config.MODERATION_SCORE_SEPARATED_ACRONYM) || 0 : 0;
  score += insults.count * (Number(config.MODERATION_SCORE_INSULT) || 0);
  score += insults.fuzzyCount * (Number(config.MODERATION_SCORE_FUZZY_INSULT) || 0);
  score += attacks.count * (Number(config.MODERATION_SCORE_ATTACK) || 0);
  score += attacks.fuzzyCount * (Number(config.MODERATION_SCORE_FUZZY_ATTACK) || 0);
  score += mockery.count * (Number(config.MODERATION_SCORE_MOCKERY) || 0);
  score += mockery.fuzzyCount * (Number(config.MODERATION_SCORE_FUZZY_MOCKERY) || 0);
  score += directSlurs.count * (Number(config.MODERATION_SCORE_DIRECT_SLUR) || 0);
  score += emojiMockery ? Number(config.MODERATION_SCORE_MOCKERY) || 0 : 0;

  const hasIdentityEvidence = identity.matched || separatedAcronym || directSlurs.matched;
  if (!hasIdentityEvidence) return null;

  const threshold = Math.max(1, Number(config.MODERATION_MATCH_THRESHOLD) || 1);
  if (score < threshold) return null;

  const reason = blockedPhrases.matched
    ? "frasa yang masuk daftar moderasi"
    : attacks.matched
      ? "serangan terhadap kelompok identitas"
    : insults.matched
      ? "penghinaan berbasis identitas"
      : directSlurs.matched
        ? "istilah penghinaan berbasis identitas"
         : mockery.matched || separatedAcronym || emojiMockery
          ? "ejekan atau pelesetan terhadap identitas"
          : "variasi istilah identitas yang terdeteksi";
  return config.MODERATION_LOG_MATCH_SCORE === false
    ? reason
    : `${reason} (skor ${score}/${threshold})`;
}

module.exports = { matchModerationKeywords };