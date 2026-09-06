const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const ELEVENLABS_STARTER_GENERATION_GUIDE = 150;
export const ELEVENLABS_PROMPT_MAX_LENGTH = 450;

export const countElevenLabsPromptCharacters = (value = "") => Array.from(String(value || "")).length;

export const limitElevenLabsPrompt = (value = "", maxLength = ELEVENLABS_PROMPT_MAX_LENGTH) => {
  const safeMaxLength = Math.max(0, Math.trunc(Number(maxLength) || 0));
  return Array.from(String(value || "")).slice(0, safeMaxLength).join("");
};

export const normalizeElevenLabsGenerationOptions = (value = {}) => {
  const duration = Number(value.durationSeconds);
  const promptInfluence = Number(value.promptInfluence);
  return {
    prompt: limitElevenLabsPrompt(String(value.prompt || "").trim()),
    durationSeconds: Number.isFinite(duration)
      ? clamp(Math.round(duration * 10) / 10, 0.5, 30)
      : 4,
    promptInfluence: Number.isFinite(promptInfluence)
      ? clamp(Math.round(promptInfluence * 100) / 100, 0, 1)
      : 0.3,
    loop: Boolean(value.loop),
    outputFormat: "mp3_44100_128"
  };
};

export const makeElevenLabsDownloadName = (material = {}) => {
  const raw = String(material.title || material.searchQuery || "sound-effect")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/[.。]+$/gu, "")
    .slice(0, 72);
  return `${raw || "sound-effect"}_ElevenLabs.mp3`;
};

export const makeElevenLabsAudioDataUrl = (result = {}) => {
  const base64 = String(result.audioBase64 || "").trim();
  if (!base64) return "";
  const mimeType = String(result.mimeType || "audio/mpeg").replace(/[^a-z0-9.+/-]/giu, "") || "audio/mpeg";
  return `data:${mimeType};base64,${base64}`;
};

export const getElevenLabsUsageView = (settings = {}) => {
  const used = Math.max(0, Number(settings.creditsUsed) || 0);
  const limit = Math.max(0, Number(settings.creditLimit) || 0);
  const toolGenerations = Math.max(0, Number(settings.toolGenerationCount) || 0);
  const remainingCredits = limit > 0 ? Math.max(0, limit - used) : null;
  return {
    used,
    limit,
    remainingCredits,
    toolGenerations,
    starterGuideRemaining: Math.max(0, ELEVENLABS_STARTER_GENERATION_GUIDE - toolGenerations),
    percent: limit > 0 ? clamp(Math.round((used / limit) * 100), 0, 100) : 0
  };
};
