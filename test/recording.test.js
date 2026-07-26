import assert from "node:assert/strict";
import test from "node:test";

import { makeGoogleDrivePreviewUrl, makePlayableEmbedUrl, migrateData } from "../src/lib/core.js";

import {
  archiveScriptVersion,
  getCharacterDialogueCounts,
  getCharacterImageCropStyle,
  getCharacterScriptName,
  getFilteredRecordingLines,
  getRecordingDisplayProject,
  getRecordingProgress,
  getShareableRecordingProject,
  getScriptHierarchyRepairPlan,
  getScriptImportPlan,
  normalizeRecordingProject,
  patchRecordingLineProgress,
  parseGoogleDocsScript,
  parseManualChapterBody,
  partitionCharactersByScript,
  reorderProductionCharacters,
  reorderProductionMaterials,
  reorderProductionRecordingFolders,
  reorderProductionSharedLinks,
  renameProductionCharacter,
  repairScriptHierarchy,
  restoreScriptSnapshot
} from "../src/lib/recording.js";

test("builds an embeddable Google Drive audio preview URL", () => {
  const sharedUrl = "https://drive.google.com/file/d/abc_DEF-123/view?usp=sharing";
  const previewUrl = "https://drive.google.com/file/d/abc_DEF-123/preview";
  assert.equal(makeGoogleDrivePreviewUrl(sharedUrl), previewUrl);
  assert.equal(makePlayableEmbedUrl(sharedUrl), previewUrl);
});

test("adds a global Umbrella Parade concept to older workspace data", () => {
  const migrated = migrateData({ recordingProjects: [] });
  assert.deepEqual(migrated.studioConcept, {
    title: "Umbrella Parade",
    tagline: "",
    body: "",
    principles: ""
  });
});

test("reorders production materials without changing their contents", () => {
  const materials = [
    { id: "theme", title: "主題歌" },
    { id: "se", title: "SE" },
    { id: "complete", title: "完成音源" }
  ];
  const reordered = reorderProductionMaterials(materials, "complete", "theme");
  assert.deepEqual(reordered.map((material) => material.id), ["complete", "theme", "se"]);
  assert.equal(reordered[0], materials[2]);
  assert.deepEqual(materials.map((material) => material.id), ["theme", "se", "complete"]);
});

test("reorders recording folders independently from character order", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル" },
      { id: "amamori", name: "アマモリ" },
      { id: "kara", name: "カーラ" }
    ],
    recordingFolderOrder: ["amamori", "vel"]
  });

  assert.deepEqual(project.recordingFolderOrder, ["amamori", "vel", "kara"]);
  const reordered = reorderProductionRecordingFolders(project.recordingFolderOrder, "kara", "amamori");
  assert.deepEqual(reordered, ["kara", "amamori", "vel"]);
  assert.deepEqual(project.characters.map((character) => character.id), ["vel", "amamori", "kara"]);
});

test("reorders characters without changing ids used by the script", () => {
  const characters = [
    { id: "vel", name: "ヴェル" },
    { id: "amamori", name: "アマモリ" },
    { id: "narration", name: "ナレーション" }
  ];
  const reordered = reorderProductionCharacters(characters, "narration", "vel");
  assert.deepEqual(reordered.map((character) => character.id), ["narration", "vel", "amamori"]);
  assert.deepEqual(characters.map((character) => character.id), ["vel", "amamori", "narration"]);
});

test("reorders shared links without changing their contents", () => {
  const links = [
    { id: "line", title: "LINEオープンチャット" },
    { id: "guide", title: "共有資料" },
    { id: "reference", title: "参考URL" }
  ];
  const reordered = reorderProductionSharedLinks(links, "reference", "line");
  assert.deepEqual(reordered.map((link) => link.id), ["reference", "line", "guide"]);
  assert.equal(reordered[0], links[2]);
  assert.deepEqual(links.map((link) => link.id), ["line", "guide", "reference"]);
});

test("keeps a bounded number of script snapshots for WordPress saves", () => {
  const project = normalizeRecordingProject({
    scriptSnapshots: Array.from({ length: 12 }, (_, index) => ({
      id: `snapshot_${index}`,
      label: `保存版 ${index}`,
      lines: [{ id: `line_${index}`, text: `台本 ${index}` }]
    }))
  });
  assert.equal(project.scriptSnapshots.length, 8);
  assert.equal(project.scriptSnapshots[0].id, "snapshot_0");
  assert.equal(project.scriptSnapshots[7].id, "snapshot_7");
});

test("normalizes and preserves character image positions", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル", imagePositionX: -12, imagePositionY: 132, imageScale: 4 },
      { id: "amamori", name: "アマモリ" }
    ]
  });

  assert.equal(project.characters[0].imagePositionX, 0);
  assert.equal(project.characters[0].imagePositionY, 100);
  assert.equal(project.characters[0].imageScale, 2.4);
  assert.equal(project.characters[1].imagePositionX, 50);
  assert.equal(project.characters[1].imagePositionY, 50);
  assert.equal(project.characters[1].imageScale, 1.12);
  assert.equal(archiveScriptVersion(project).scriptSnapshots[0].characters[0].imagePositionY, 100);
  assert.equal(archiveScriptVersion(project).scriptSnapshots[0].characters[0].imageScale, 2.4);
  assert.deepEqual(getCharacterImageCropStyle(project.characters[1]), {
    width: "112%",
    height: "112%",
    left: "-6%",
    top: "-6%",
    objectPosition: "50% 50%"
  });
});

test("normalizes freely configurable shared URLs", () => {
  const project = normalizeRecordingProject({
    sharedLinks: [{ id: "line", label: "LINEオープンチャット", url: "https://line.me/example", description: "全体連絡" }]
  });

  assert.deepEqual(project.sharedLinks, [{
    id: "line",
    title: "LINEオープンチャット",
    url: "https://line.me/example",
    notes: "全体連絡"
  }]);
});

test("assigns a different color whenever character colors overlap", () => {
  const characters = Array.from({ length: 40 }, (_, index) => ({
    id: `character_${index}`,
    name: `登場人物${index + 1}`,
    color: "#168b9a"
  }));
  const project = normalizeRecordingProject({ characters });
  const colors = project.characters.map((character) => character.color);

  assert.equal(colors[0], "#168b9a");
  assert.equal(new Set(colors).size, characters.length);
  assert.deepEqual(normalizeRecordingProject(project).characters.map((character) => character.color), colors);
});

test("merges alternate performance labels into their canonical characters", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel_monitor", name: "ヴェルイヤモニ", color: "#168b9a", recordingFolderUrl: "https://drive.example/vel" },
      { id: "vel", name: "ヴェル", color: "#168b9a", imageUrl: "vel.png" },
      { id: "vel_inner", name: "心の声", color: "#168b9a", profile: "ヴェルの内面" },
      { id: "amamori_narrator", name: "アマモリのナレーター", color: "#168b9a" },
      { id: "amamori", name: "アマモリ", color: "#168b9a" },
      { id: "amamori_narration", name: "アマモリ／ナレーション", color: "#168b9a" },
      { id: "kara", name: "カーラ", color: "#168b9a" },
      { id: "kara_inner", name: "カーラ（心の声）", color: "#168b9a" }
    ],
    castMembers: [{ id: "cast_one", actorName: "声優さん", characterIds: ["vel_monitor", "vel", "amamori_narrator"] }],
    questions: [{ id: "question_one", characterId: "amamori_narration", body: "読み方について" }],
    lines: [
      { id: "line_monitor", characterId: "vel_monitor", text: "聞こえるか。", actorStatus: "収録済み", reviewStatus: "OK" },
      { id: "line_inner", characterId: "vel_inner", text: "まだ終われない。" },
      { id: "line_narrator", characterId: "amamori_narrator", text: "雨が降っていました。" },
      { id: "line_narration", characterId: "amamori_narration", text: "彼は歩き出しました。" },
      { id: "line_kara_inner", characterId: "kara_inner", text: "ヴェル、待っていて。" }
    ]
  });

  assert.deepEqual(project.characters.map((character) => character.name), ["ヴェル", "アマモリ", "カーラ"]);
  assert.equal(project.characters[0].id, "vel");
  assert.equal(project.characters[0].recordingFolderUrl, "https://drive.example/vel");
  assert.equal(project.characters[0].profile, "ヴェルの内面");
  assert.equal(new Set(project.characters.map((character) => character.color)).size, 3);
  assert.deepEqual(project.lines.map((line) => line.characterId), ["vel", "vel", "amamori", "amamori", "kara"]);
  assert.equal(project.lines[0].actorStatus, "収録済み");
  assert.equal(project.lines[0].reviewStatus, "OK");
  assert.deepEqual(
    project.lines.map((line) => line.performanceType),
    ["イヤモニ", "心の声", "ナレーション", "ナレーション", "心の声"]
  );
  assert.deepEqual(project.castMembers[0].characterIds, ["vel", "amamori"]);
  assert.equal(project.questions[0].characterId, "amamori");
});

test("uses canonical character names while parsing performance labels", () => {
  const rows = parseGoogleDocsScript(`ヴェルイヤモニ
「聞こえるか。」
心の声
「まだ終われない。」
アマモリのナレーター
「彼は歩き出しました。」
カーラ（心の声）
「ヴェル、待っていて。」`, ["ヴェル", "アマモリ", "カーラ"]);

  assert.deepEqual(rows.map((row) => row.speaker), ["ヴェル", "ヴェル", "アマモリ", "カーラ"]);
  assert.deepEqual(rows.map((row) => row.performanceType), ["イヤモニ", "心の声", "ナレーション", "心の声"]);
});

test("counts dialogue inside manually pasted chapter bodies without replacing the original text", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル" },
      { id: "amamori", name: "アマモリ" }
    ],
    lines: [
      { id: "structured", characterId: "amamori", kind: "dialogue", text: "構造化済みのセリフ" },
      {
        id: "manual",
        kind: "direction",
        manualBody: true,
        text: `アマモリ「一つ目。」\nアマモリのナレーター\n「二つ目。」\nヴェル「返事。」`
      }
    ]
  });

  assert.deepEqual(getCharacterDialogueCounts(project), { vel: 1, amamori: 3 });
  assert.equal(project.lines[1].manualBody, true);
  assert.match(project.lines[1].text, /アマモリのナレーター/);
});

test("keeps pasted script dialogue linked when a character display name changes", () => {
  const original = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: "ヴェル「行こう。」"
    }]
  });

  const renamed = normalizeRecordingProject(renameProductionCharacter(original, "vel", "ベル"));
  const display = getRecordingDisplayProject(renamed);

  assert.equal(renamed.characters[0].name, "ベル");
  assert.equal(getCharacterScriptName(renamed.characters[0]), "ベル");
  assert.deepEqual(renamed.characters[0].scriptAliases, ["ヴェル"]);
  assert.equal(getCharacterDialogueCounts(renamed).vel, 1);
  assert.equal(display.lines.find((line) => line.kind === "dialogue")?.characterId, "vel");
  assert.deepEqual(partitionCharactersByScript(renamed).linkedCharacters.map((character) => character.id), ["vel"]);
});

test("keeps the short script name linked when a character is changed to a formal name", () => {
  const original = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: "ヴェル「行こう。」\nヴェルの心の声「まだ迷っている。」"
    }]
  });

  const renamed = normalizeRecordingProject(renameProductionCharacter(original, "vel", "ヴェル13世"));
  const display = getRecordingDisplayProject(renamed);

  assert.equal(renamed.characters[0].name, "ヴェル13世");
  assert.equal(getCharacterScriptName(renamed.characters[0]), "ヴェル");
  assert.deepEqual(renamed.characters[0].scriptAliases, ["ヴェル"]);
  assert.equal(getCharacterDialogueCounts(renamed).vel, 2);
  assert.deepEqual(display.lines.filter((line) => line.kind === "dialogue").map((line) => line.characterId), ["vel", "vel"]);
  assert.deepEqual(partitionCharactersByScript(renamed).linkedCharacters.map((character) => character.id), ["vel"]);
});

test("infers short script names from formal names already saved in older data", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel_monitor", name: "ヴェルイヤモニ" },
      { id: "vel", name: "ヴェル13世" },
      { id: "kara", name: "カーラ・マンソン" },
      { id: "oldis", name: "オルディス・グランベル" },
      { id: "lazaro", name: "ラザロ・ストール" }
    ],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: "ヴェル「始めよう。」\nカーラ「了解。」\nオルディス「任せてくれ。」"
    }]
  });

  assert.deepEqual(project.characters.map(getCharacterScriptName), ["ヴェル", "カーラ", "オルディス", "ラザロ"]);
  assert.equal(project.characters[0].id, "vel");
  assert.equal(project.characters[0].name, "ヴェル13世");
  assert.equal(project.characters.some((character) => character.id === "vel_monitor"), false);
  assert.deepEqual(getCharacterDialogueCounts(project), { vel: 1, kara: 1, oldis: 1, lazaro: 0 });
  assert.deepEqual(partitionCharactersByScript(project).linkedCharacters.map((character) => character.id), ["vel", "kara", "oldis"]);
  assert.deepEqual(partitionCharactersByScript(project).unlinkedCharacters.map((character) => character.id), ["lazaro"]);
});

test("separates characters removed from the current script without deleting their settings", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル", imageUrl: "vel.png" },
      { id: "candidate", name: "候補者", recordingFolderUrl: "https://drive.example/candidate" }
    ],
    lines: [{ id: "vel_line", characterId: "vel", kind: "dialogue", text: "行こう。" }]
  });

  const groups = partitionCharactersByScript(project);

  assert.deepEqual(groups.linkedCharacters.map((character) => character.id), ["vel"]);
  assert.deepEqual(groups.unlinkedCharacters.map((character) => character.id), ["candidate"]);
  assert.equal(groups.unlinkedCharacters[0].recordingFolderUrl, "https://drive.example/candidate");
  assert.equal(project.characters.length, 2);
});

test("builds filterable display lines from a manually pasted chapter without changing stored lines", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル" },
      { id: "amamori", name: "アマモリ" }
    ],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: `## 雨上がり\nヴェルイヤモニ「聞こえるか。」\nアマモリのナレーター\n「雨が止みました。」`
    }]
  });

  const displayProject = getRecordingDisplayProject(project);
  const dialogue = displayProject.lines.filter((line) => line.kind === "dialogue");

  assert.deepEqual(dialogue.map((line) => line.characterId), ["vel", "amamori"]);
  assert.deepEqual(dialogue.map((line) => line.performanceType), ["イヤモニ", "ナレーション"]);
  assert.ok(dialogue.every((line) => line.derivedFromManualBody));
  assert.equal(project.lines.length, 1);
  assert.equal(project.lines[0].manualBody, true);
  assert.match(project.lines[0].text, /ヴェルイヤモニ/);
});

test("selecting a character includes every performance type for that character", () => {
  const project = getRecordingDisplayProject(normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル" },
      { id: "amamori", name: "アマモリ" }
    ],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: `ヴェル「通常の声。」
ヴェルの心の声「心の声。」
ヴェルイヤモニ「イヤモニの声。」
アマモリのナレーター「雨が降っていた。」`
    }]
  }));

  const filtered = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["vel"],
    includeContext: false
  });

  assert.deepEqual(filtered.map((line) => line.characterId), ["vel", "vel", "vel"]);
  assert.deepEqual(filtered.map((line) => line.performanceType), ["通常", "心の声", "イヤモニ"]);
});

test("keeps derived recording progress when unrelated chapter text is edited", () => {
  const base = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: `ヴェル「行こう。」
ヴェルの心の声「まだ終われない。」`
    }]
  });
  const firstDisplay = getRecordingDisplayProject(base);
  const innerLine = firstDisplay.lines.find((line) => line.performanceType === "心の声");
  const recorded = patchRecordingLineProgress(base, innerLine.id, {
    actorStatus: "収録済み",
    updatedAt: "2026-07-26T12:00:00+09:00"
  }, innerLine);
  const edited = normalizeRecordingProject({
    ...recorded,
    lines: recorded.lines.map((line) => line.id === "chapter_body"
      ? { ...line, text: `ヴェル「新しく追加したセリフ。」
ヴェル「行こう。」
ヴェルの心の声「まだ終われない。」` }
      : line)
  });
  const secondDisplay = getRecordingDisplayProject(edited);
  const preserved = secondDisplay.lines.find((line) => line.text === "まだ終われない。");

  assert.equal(preserved.id, innerLine.id);
  assert.equal(preserved.actorStatus, "収録済み");
  assert.equal(getRecordingProgress(edited).recorded, 1);
  assert.equal(getRecordingProgress(edited).total, 3);
});

test("splits a manually pasted chapter only at heading 2 markers", () => {
  const rows = parseManualChapterBody(`章の導入文です。\n\n## 雨上がり\nヴェル「行こう。」\nアマモリ「待って。」\n\n## 出発\n駅へ向かう。`, "第一章");

  assert.deepEqual(rows.map((row) => row.sceneTitle), ["章の本文", "雨上がり", "出発"]);
  assert.equal(rows[1].text, "ヴェル「行こう。」\nアマモリ「待って。」");
  assert.equal(rows[2].manualBody, true);
  assert.ok(rows.every((row) => row.sourceKind === "direction" && row.chapterTitle === "第一章"));
});

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
