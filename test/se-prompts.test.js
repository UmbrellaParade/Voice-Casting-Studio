import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSePromptOutputs,
  normalizeSePromptDraft
} from "../src/lib/se-prompts.js";
import {
  ELEVENLABS_PROMPT_MAX_LENGTH,
  countElevenLabsPromptCharacters
} from "../src/lib/elevenlabs.js";

test("builds Codex and ElevenLabs prompts from one SE setup", () => {
  const material = {
    title: "激しい雨と遠くの雷",
    searchQuery: "雨 雷 無料素材",
    chapterTitle: "第三章"
  };
  const draft = normalizeSePromptDraft({
    mode: "loop",
    durationSeconds: 12,
    distance: "far",
    space: "outdoor",
    intensity: "strong",
    style: "cinematic",
    detail: "3秒後に雷を一度だけ鳴らす"
  }, material);
  const output = buildSePromptOutputs(material, draft, [{ chapterTitle: "第三章", sceneTitle: "Scene 2" }]);

  assert.match(output.codexPrompt, /激しい雨と遠くの雷/u);
  assert.match(output.codexPrompt, /第三章 \/ Scene 2/u);
  assert.match(output.codexPrompt, /12秒/u);
  assert.match(output.codexPrompt, /44\.1kHz \/ 24bit PCM \/ モノラル WAV/u);
  assert.match(output.codexPrompt, /継ぎ目のないループ/u);
  assert.match(output.elevenLabsPrompt, /rain ambience, thunder rumble/u);
  assert.match(output.elevenLabsPrompt, /Seamless loop/u);
  assert.match(output.elevenLabsPrompt, /Duration: 12 seconds/u);
  assert.match(output.elevenLabsPrompt, /3秒後に雷を一度だけ鳴らす/u);
});

test("infers sensible defaults and clamps ElevenLabs duration limits", () => {
  const material = { title: "遠くでかすかな風と雨" };
  const inferred = normalizeSePromptDraft({}, material);
  const clamped = normalizeSePromptDraft({ durationSeconds: 120 }, material);

  assert.equal(inferred.mode, "ambience");
  assert.equal(inferred.distance, "far");
  assert.equal(inferred.space, "outdoor");
  assert.equal(inferred.promptInfluence, 0.3);
  assert.equal(clamped.durationSeconds, 30);
  assert.equal(normalizeSePromptDraft({ durationSeconds: 0.1 }, material).durationSeconds, 0.5);
});

test("keeps manually edited prompt text when normalizing saved data", () => {
  const normalized = normalizeSePromptDraft({
    codexPrompt: "手直ししたCodex指示",
    elevenLabsPrompt: "Edited ElevenLabs prompt",
    fireflyPrompt: "Edited Adobe Firefly prompt"
  }, { title: "重い扉" });

  assert.equal(normalized.codexPrompt, "手直ししたCodex指示");
  assert.equal(normalized.elevenLabsPrompt, "Edited ElevenLabs prompt");
  assert.equal(normalized.fireflyPrompt, "Edited Adobe Firefly prompt");
});

test("keeps long generated and saved ElevenLabs prompts within 450 characters", () => {
  const material = { title: `巨大な機械音${"と金属の衝突".repeat(80)}` };
  const output = buildSePromptOutputs(material, {
    detail: `最初は遠く、その後急接近する${"非常に細かな追加指示".repeat(80)}`
  });
  const saved = normalizeSePromptDraft({ elevenLabsPrompt: "A".repeat(700) }, material);

  assert.ok(countElevenLabsPromptCharacters(output.elevenLabsPrompt) <= ELEVENLABS_PROMPT_MAX_LENGTH);
  assert.match(output.elevenLabsPrompt, /No speech, voices, music/u);
  assert.equal(countElevenLabsPromptCharacters(saved.elevenLabsPrompt), ELEVENLABS_PROMPT_MAX_LENGTH);
});
