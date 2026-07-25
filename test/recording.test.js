import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveScriptVersion,
  getRecordingProgress,
  getShareableRecordingProject,
  getScriptHierarchyRepairPlan,
  getScriptImportPlan,
  normalizeRecordingProject,
  parseGoogleDocsScript,
  repairScriptHierarchy,
  restoreScriptSnapshot
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

test("skips cast lists and keeps later structure after an unclosed quote", () => {
  const rows = parseGoogleDocsScript(`ボイスドラマ脚本
『Umbrella Parade：雨を晴らせない男の復活劇』
第1章「宣告」
【登場人物】
ヴェル
アマモリ
SCENE 01 試験会場
ヴェル「まだ閉じていない

第2章「残響」
【登場人物】
ヴェル
アマモリ
SCENE 01 路地裏
アマモリ「ここは第二章です。」`, ["ヴェル", "アマモリ"]);

  assert.deepEqual(rows.map((row) => row.speaker), ["ヴェル", "アマモリ"]);
  assert.equal(rows[0].chapterTitle, "第1章 宣告");
  assert.equal(rows[0].sceneTitle, "SCENE 01 試験会場");
  assert.equal(rows[1].chapterTitle, "第2章 残響");
  assert.equal(rows[1].sceneTitle, "SCENE 01 路地裏");
});

test("repairs lines that an older import placed back in the first chapter", () => {
  const project = normalizeRecordingProject({
    scriptVersion: "初稿",
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      { id: "chapter_one_intro", order: 1, chapterTitle: "第一章", sceneTitle: "章の冒頭", kind: "direction", text: "ヴェル", characterId: "character_vel" },
      { id: "chapter_one_line", order: 2, chapterTitle: "第一章", sceneTitle: "SCENE 01", text: "第一章です。", characterId: "character_vel" },
      { id: "chapter_two_intro", order: 3, chapterTitle: "第2章 残響", sceneTitle: "章の冒頭", kind: "direction", text: "ヴェル", characterId: "character_vel" },
      { id: "chapter_two_line", order: 4, chapterTitle: "第一章", sceneTitle: "SCENE 01", text: "第二章です。", characterId: "character_vel", actorStatus: "収録済み", reviewStatus: "OK" },
      { id: "chapter_three_intro", order: 5, chapterTitle: "第3章 逆鱗", sceneTitle: "章の冒頭", kind: "direction", text: "ヴェル", characterId: "character_vel" },
      { id: "chapter_three_line", order: 6, chapterTitle: "第一章", sceneTitle: "SCENE 01", text: "第三章です。", characterId: "character_vel" }
    ]
  });

  const plan = getScriptHierarchyRepairPlan(project);
  assert.equal(plan.changed, 5);
  assert.equal(plan.moved, 2);
  assert.equal(plan.removed, 3);
  assert.equal(plan.chapters, 3);

  const repaired = repairScriptHierarchy(project);
  assert.equal(repaired.lines.length, 3);
  assert.deepEqual(
    repaired.lines.filter((line) => line.id.endsWith("_line")).map((line) => line.chapterTitle),
    ["第一章", "第2章 残響", "第3章 逆鱗"]
  );
  assert.equal(repaired.lines.find((line) => line.id === "chapter_two_line").actorStatus, "収録済み");
  assert.equal(repaired.lines.find((line) => line.id === "chapter_two_line").reviewStatus, "OK");
  assert.equal(repaired.scriptSnapshots.length, 1);
});

test("keeps script metadata and audio cues out of the character list", () => {
  const rows = parseGoogleDocsScript(`ボイスドラマ脚本
脚本：Umbrella Parade
【第一章】
【シーン1】
SE：扉が開く
ヴェル
「入ってもいい？」`);

  assert.deepEqual(rows.map((row) => row.speaker), ["ト書き", "ヴェル"]);
  assert.deepEqual(rows.map((row) => row.sourceKind), ["direction", "dialogue"]);
  assert.equal(rows[0].text, "SE：扉が開く");
  assert.equal(rows[1].chapterTitle, "第一章");
  assert.equal(rows[1].sceneTitle, "シーン1");
});

test("normalizes decorated and numeric chapter variants into one hierarchy", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [
      { id: "line_one", chapterId: "chapter_a", chapterTitle: "【第一章】", sceneId: "scene_a", sceneTitle: "シーン１", characterId: "character_vel", text: "最初。" },
      { id: "line_two", chapterId: "chapter_b", chapterTitle: "第1章 はじまり", sceneId: "scene_b", sceneTitle: "Scene 01", characterId: "character_vel", text: "次。" }
    ]
  });

  assert.equal(project.lines[0].chapterId, project.lines[1].chapterId);
  assert.equal(project.lines[0].sceneId, project.lines[1].sceneId);
});

test("repairs high-confidence script labels that were previously stored as characters", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "character_chapter", name: "第一章" },
      { id: "character_episode", name: "第1話" },
      { id: "character_episode_kanji", name: "第六話" },
      { id: "character_music", name: "M" },
      { id: "character_se", name: "SE" },
      { id: "character_script", name: "脚本全文" },
      { id: "character_vel", name: "ヴェル" }
    ],
    castMembers: [{ id: "cast_one", characterIds: ["character_chapter", "character_episode", "character_music", "character_vel"] }],
    lines: [
      { id: "line_chapter", characterId: "character_chapter", text: "章見出し" },
      { id: "line_episode", characterId: "character_episode", text: "話数見出し" },
      { id: "line_episode_kanji", characterId: "character_episode_kanji", text: "話数見出し" },
      { id: "line_music", characterId: "character_music", text: "音楽開始" },
      { id: "line_se", characterId: "character_se", text: "扉が開く" },
      { id: "line_script", characterId: "character_script", text: "作品タイトル" },
      { id: "line_vel", characterId: "character_vel", text: "入ってもいい？" }
    ]
  });

  assert.deepEqual(project.characters.map((character) => character.name), ["ヴェル"]);
  assert.deepEqual(project.lines.map((line) => line.kind), ["direction", "direction", "direction", "direction", "direction", "direction", "dialogue"]);
  assert.deepEqual(project.castMembers[0].characterIds, ["character_vel"]);
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

test("archives the imported source and recording progress before a destructive edit", () => {
  const project = normalizeRecordingProject({
    scriptVersion: "第二稿",
    sourceScriptText: "第一章\nヴェル「行こう。」",
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [{
      id: "line_to_delete",
      characterId: "character_vel",
      text: "行こう。",
      actorStatus: "収録済み",
      reviewStatus: "OK",
      recordingUrl: "https://drive.google.com/file/d/example/view"
    }]
  });

  const archived = archiveScriptVersion(project, { reason: "削除する直前" });
  const snapshot = archived.scriptSnapshots[0];

  assert.equal(snapshot.scriptVersion, "第二稿");
  assert.equal(snapshot.sourceScriptText, "第一章\nヴェル「行こう。」");
  assert.equal(snapshot.lines[0].actorStatus, "収録済み");
  assert.equal(snapshot.lines[0].reviewStatus, "OK");
  assert.equal(snapshot.lines[0].recordingUrl, "https://drive.google.com/file/d/example/view");
});

test("restores a deleted line and keeps the pre-restore state as another version", () => {
  const original = normalizeRecordingProject({
    scriptVersion: "初稿",
    sourceScriptText: "ヴェル「戻して。」",
    characters: [{ id: "character_vel", name: "ヴェル" }],
    lines: [{ id: "line_original", characterId: "character_vel", text: "戻して。", actorStatus: "収録済み", reviewStatus: "OK" }]
  });
  const archived = archiveScriptVersion(original, { reason: "削除する直前" });
  const snapshotId = archived.scriptSnapshots[0].id;
  const afterDelete = normalizeRecordingProject({
    ...archived,
    lines: [],
    sourceScriptText: "",
    characters: archived.characters.map((character) => ({ ...character, profile: "復元時点の最新設定" }))
  });
  const restored = restoreScriptSnapshot(afterDelete, snapshotId);

  assert.equal(restored.lines.length, 1);
  assert.equal(restored.lines[0].id, "line_original");
  assert.equal(restored.lines[0].actorStatus, "収録済み");
  assert.equal(restored.lines[0].reviewStatus, "OK");
  assert.equal(restored.sourceScriptText, "ヴェル「戻して。」");
  assert.equal(restored.characters[0].profile, "復元時点の最新設定");
  assert.equal(restored.scriptSnapshots[0].reason.includes("復元する直前"), true);
});

test("adds empty script history fields when older projects are normalized", () => {
  const project = normalizeRecordingProject({ title: "旧データ" });

  assert.equal(project.sourceScriptText, "");
  assert.deepEqual(project.scriptSnapshots, []);
});

test("omits private script history from actor share payloads", () => {
  const project = normalizeRecordingProject({
    sourceScriptText: "非公開の取り込み原文",
    scriptSnapshots: [{ id: "private_version", lines: [{ id: "old_line", recordingUrl: "https://drive.google.com/file/d/private/view" }] }],
    lines: [{ id: "current_line", text: "現在の台本" }]
  });
  const shared = getShareableRecordingProject(project);

  assert.equal("sourceScriptText" in shared, false);
  assert.equal("scriptSnapshots" in shared, false);
  assert.equal(shared.lines[0].text, "現在の台本");
});
