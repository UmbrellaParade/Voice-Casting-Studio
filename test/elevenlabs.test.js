import assert from "node:assert/strict";
import test from "node:test";

import {
  ELEVENLABS_PROMPT_MAX_LENGTH,
  ELEVENLABS_STARTER_GENERATION_GUIDE,
  countElevenLabsPromptCharacters,
  getElevenLabsUsageView,
  makeElevenLabsAudioDataUrl,
  makeElevenLabsDownloadName,
  normalizeElevenLabsGenerationOptions
} from "../src/lib/elevenlabs.js";

test("normalizes ElevenLabs generation settings to the supported limits", () => {
  const normalized = normalizeElevenLabsGenerationOptions({
    prompt: "  heavy metal door slam  ",
    durationSeconds: 90,
    promptInfluence: -2,
    loop: true
  });

  assert.equal(normalized.prompt, "heavy metal door slam");
  assert.equal(normalized.durationSeconds, 30);
  assert.equal(normalized.promptInfluence, 0);
  assert.equal(normalized.loop, true);
  assert.equal(normalized.outputFormat, "mp3_44100_128");
});

test("limits generated requests to ElevenLabs' 450 character prompt maximum", () => {
  const normalized = normalizeElevenLabsGenerationOptions({ prompt: "音".repeat(700) });

  assert.equal(countElevenLabsPromptCharacters(normalized.prompt), ELEVENLABS_PROMPT_MAX_LENGTH);
});

test("creates a safe Japanese MP3 download name", () => {
  assert.equal(
    makeElevenLabsDownloadName({ title: "第三章 / 雷鳴：遠く" }),
    "第三章_雷鳴_遠く_ElevenLabs.mp3"
  );
});

test("builds a playable data URL only when generated audio exists", () => {
  assert.equal(makeElevenLabsAudioDataUrl({}), "");
  assert.equal(
    makeElevenLabsAudioDataUrl({ audioBase64: "YWJj", mimeType: "audio/mpeg" }),
    "data:audio/mpeg;base64,YWJj"
  );
});

test("summarizes plan usage and this tool generation count", () => {
  const usage = getElevenLabsUsageView({
    creditsUsed: 7500,
    creditLimit: 30000,
    toolGenerationCount: 18
  });

  assert.equal(usage.remainingCredits, 22500);
  assert.equal(usage.percent, 25);
  assert.equal(usage.starterGuideRemaining, ELEVENLABS_STARTER_GENERATION_GUIDE - 18);
});
