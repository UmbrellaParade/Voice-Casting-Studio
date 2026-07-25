import assert from "node:assert/strict";
import test from "node:test";

import {
  getRecordingProgress,
  getScriptImportPlan,
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

test("separates chapters that reuse the same scene name", () => {
  const rows = parseGoogleDocsScript(`第一章
シーン1
ヴェル「行こう。」

第二章
シーン1
ヴェル「ただいま。」`);

  assert.deepEqual(rows.map((row) => row.chapterTitle), ["第一章", "第二章"]);
  assert.deepEqual(rows.map((row) => row.sceneTitle), ["シーン1", "シーン1"]);

  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: rows.map((row, index) => ({
      ...row,
      id: `line_${index}`,
      chapterId: "chapter_duplicate",
      sceneId: "scene_01",
      characterId: "character_vel"
    }))
  });

  assert.notEqual(project.lines[0].chapterId, project.lines[1].chapterId);
  assert.notEqual(project.lines[0].sceneId, project.lines[1].sceneId);
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

test("keeps recording progress for unchanged lines when a script is re-imported", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      {
        id: "line_kept",
        sceneId: "scene_01",
        sceneTitle: "第一章",
        characterId: "character_vel",
        text: "もう｜決めた《きめた》んだ。",
        actorStatus: "収録済み",
        reviewStatus: "OK"
      },
      {
        id: "line_changed",
        sceneId: "scene_01",
        sceneTitle: "第一章",
        characterId: "character_vel",
        text: "古いセリフ"
      }
    ]
  });

  const plan = getScriptImportPlan(project, [
    { sceneTitle: "第二章", speaker: "ヴェル", text: "もう決めたんだ。", sourceKind: "dialogue" },
    { sceneTitle: "第二章", speaker: "ヴェル", text: "新しいセリフ", sourceKind: "dialogue" }
  ]);

  assert.equal(plan.retained, 1);
  assert.equal(plan.added, 1);
  assert.equal(plan.removed, 1);
  assert.equal(plan.matches[0].id, "line_kept");
  assert.equal(plan.matches[1], null);
});

test("matches duplicate dialogue one line at a time", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      { id: "line_one", characterId: "character_vel", text: "はい。" },
      { id: "line_two", characterId: "character_vel", text: "はい。" }
    ]
  });

  const plan = getScriptImportPlan(project, [
    { speaker: "ヴェル", text: "はい。" },
    { speaker: "ヴェル", text: "はい。" },
    { speaker: "ヴェル", text: "はい。" }
  ]);

  assert.deepEqual(plan.matches.map((line) => line?.id || null), ["line_one", "line_two", null]);
  assert.deepEqual({ retained: plan.retained, added: plan.added, removed: plan.removed }, { retained: 2, added: 1, removed: 0 });
});

test("matches duplicate dialogue to the same chapter and scene first", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      { id: "line_chapter_one", chapterId: "chapter_01", chapterTitle: "第一章", sceneId: "chapter_01_scene_01", sceneTitle: "シーン1", characterId: "character_vel", text: "はい。" },
      { id: "line_chapter_two", chapterId: "chapter_02", chapterTitle: "第二章", sceneId: "chapter_02_scene_01", sceneTitle: "シーン1", characterId: "character_vel", text: "はい。" }
    ]
  });

  const plan = getScriptImportPlan(project, [
    { chapterTitle: "第二章", sceneTitle: "シーン1", speaker: "ヴェル", text: "はい。" },
    { chapterTitle: "第一章", sceneTitle: "シーン1", speaker: "ヴェル", text: "はい。" }
  ]);

  assert.deepEqual(plan.matches.map((line) => line.id), ["line_chapter_two", "line_chapter_one"]);
});

test("keeps the WordPress user id attached to private questions", () => {
  const project = normalizeRecordingProject({
    questions: [{ id: "question_private", authorName: "声優A", wpUserId: 42, body: "確認です。" }]
  });

  assert.equal(project.questions[0].wpUserId, 42);
});
