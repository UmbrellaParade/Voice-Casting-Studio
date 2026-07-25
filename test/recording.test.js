import assert from "node:assert/strict";
import test from "node:test";

import {
  getRecordingProgress,
  normalizeRecordingProject,
  parseGoogleDocsScript
} from "../src/lib/recording.js";

test("parses a Google Docs voice drama script without losing ruby or stage directions", () => {
  const rows = parseGoogleDocsScript(`〇雨上がり
アマモリ「本当に行くつもりなの？」
ヴェル
「うん。もう｜決めた《きめた》んだ。」
（静かな決意で）
雨が止む。`, ["アマモリ", "ヴェル"]);

  assert.deepEqual(rows.map((row) => row.speaker), ["アマモリ", "ヴェル", "ト書き"]);
  assert.equal(rows[0].sceneTitle, "〇雨上がり");
  assert.equal(rows[1].text, "うん。もう｜決めた《きめた》んだ。");
  assert.equal(rows[1].direction, "静かな決意で");
  assert.equal(rows[2].sourceKind, "direction");
});

test("accepts bracket, colon, and multi-line dialogue forms", () => {
  const rows = parseGoogleDocsScript(`Scene 02 出発
【ヴェル】行こう。
アマモリ：待って
ヴェル「これは
二行のセリフ」`);

  assert.deepEqual(rows.map((row) => row.speaker), ["ヴェル", "アマモリ", "ヴェル"]);
  assert.equal(rows[2].text, "これは\n二行のセリフ");
});

test("excludes stage directions from recording progress", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      {
        id: "line_dialogue",
        characterId: "character_vel",
        kind: "dialogue",
        actorStatus: "収録済み",
        reviewStatus: "OK"
      },
      {
        id: "line_direction",
        characterId: "character_vel",
        kind: "direction",
        actorStatus: "未収録",
        reviewStatus: "未確認"
      }
    ]
  });

  assert.deepEqual(getRecordingProgress(project), {
    total: 1,
    recorded: 1,
    approved: 1,
    retakes: 0,
    recordedPercent: 100,
    approvedPercent: 100
  });
});
