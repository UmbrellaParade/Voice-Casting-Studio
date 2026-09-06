import assert from "node:assert/strict";
import test from "node:test";

import { makeGoogleDrivePreviewUrl, makePlayableEmbedUrl, migrateData } from "../src/lib/core.js";

import {
  addProductionAuditionStartSchedule,
  addProductionCharacterFromScriptSpeaker,
  applyRecordingProjectUpdate,
  applyProductionContactDialogueCountNotice,
  applyProductionSocialRoleSelection,
  archiveScriptVersion,
  assignProductionAuditionApplicant,
  assignProductionActorName,
  buildMaterialSourceSearchUrl,
  buildProductionContactMessage,
  buildProductionRetakeList,
  buildProductionSocialMessage,
  buildProductionQuestionThreads,
  canResolveProductionQuestion,
  getCharacterDialogueCounts,
  getCharacterImageCropStyle,
  getCharacterScriptName,
  getActorContactName,
  getActorContactHonorific,
  getDismissedProductionRequiredMaterials,
  getFilteredRecordingLines,
  groupProductionAuditionApplicantsByRole,
  getProductionRequiredMaterialChapterGroups,
  getProductionRequiredMaterials,
  getProductionCharacterAppearanceLabel,
  getProductionCharacterRetakes,
  getRecordingDisplayProject,
  getRecordingProgress,
  getShareableRecordingProject,
  getScriptHierarchyRepairPlan,
  getScriptImportPlan,
  getUnassignedProductionCharacters,
  getUnregisteredScriptSpeakers,
  isOtherRoleRequestContactTemplate,
  isRetakeRequestContactTemplate,
  mergeMissingProductionRetakesIntoDraft,
  mergeProductionAuditionApplicants,
  extractScriptRequiredMaterials,
  normalizeRecordingProject,
  normalizeXProfileUrl,
  patchRecordingChapterActorStatus,
  patchRecordingChapterReviewStatus,
  patchRecordingCharacterActorStatus,
  patchRecordingCharacterReviewStatus,
  patchRecordingLineProgress,
  parseGoogleDocsScript,
  parseManualChapterBody,
  partitionCharactersByScript,
  reorderProductionCharacters,
  reorderProductionMaterialSourceSites,
  reorderProductionMaterials,
  reorderProductionRecordingFolders,
  reorderProductionSharedLinks,
  reorderProductionTemplates,
  renameProductionCharacter,
  repairScriptHierarchy,
  restoreScriptSnapshot,
  sortProductionTasks,
  sortProductionScheduleItems
} from "../src/lib/recording.js";

test("updates recording fields without rebuilding unchanged project collections", () => {
  const project = normalizeRecordingProject({
    id: "project_fast_input",
    title: "入力前",
    characters: [{ id: "character_a", name: "役A" }],
    lines: [{ id: "line_a", characterId: "character_a", text: "セリフ", kind: "dialogue" }],
    contactMessageDrafts: []
  });
  const updated = applyRecordingProjectUpdate(project, (current) => ({
    ...current,
    contactMessageDrafts: [{
      id: "draft_a",
      templateId: "template_a",
      characterId: "character_a",
      body: "入力中"
    }]
  }), "2026-08-31T00:00:00.000Z");

  assert.notStrictEqual(updated, project);
  assert.strictEqual(updated.characters, project.characters);
  assert.strictEqual(updated.lines, project.lines);
  assert.equal(updated.contactMessageDrafts[0].body, "入力中");
  assert.equal(updated.updatedAt, "2026-08-31T00:00:00.000Z");
  assert.strictEqual(applyRecordingProjectUpdate(project, () => project), project);
});

test("keeps unassigned role tasks in sync with actor assignments", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "role_a", name: "役A" },
      { id: "role_b", name: "役B" },
      { id: "old_role", name: "旧台本の役" }
    ],
    castMembers: [{ id: "actor_a", actorName: "声優A", characterIds: ["role_a"] }],
    auditionRoleProgress: [{
      characterId: "role_b",
      formCreated: true,
      recruitmentStarted: true,
      imageAudit: { passed: true }
    }],
    lines: [
      { id: "line_a", characterId: "role_a", text: "Aのセリフ", kind: "dialogue" },
      { id: "line_b", characterId: "role_b", text: "Bのセリフ", kind: "dialogue" }
    ]
  });

  assert.deepEqual(getUnassignedProductionCharacters(project).map((character) => character.name), ["役B"]);

  const assigned = normalizeRecordingProject(assignProductionActorName(project, "role_b", "声優B"));
  assert.deepEqual(getUnassignedProductionCharacters(assigned), []);
  assert.deepEqual(assigned.auditionRoleProgress[0], {
    characterId: "role_b",
    formCreated: true,
    formStructureVerified: false,
    formValidation: {},
    headerApplied: false,
    uploadVerified: false,
    recruitmentStarted: true,
    formEditUrl: "",
    formResponderUrl: "",
    headerImageUrl: "",
    socialImageUrl: "",
    imageAudit: { passed: true },
    auditionRoleSummary: "",
    auditionAcceptsFemaleApplicants: true,
    auditionAcceptsMaleApplicants: true,
    auditionLines: "",
    auditionDeadline: "",
    socialPostText: "",
    socialPostUpdatedAt: "",
    pcFinishStatus: "",
    pcFinishMessage: "",
    pcFinishedAt: "",
    createdAt: "",
    updatedAt: ""
  });

  const cleared = normalizeRecordingProject(assignProductionActorName(assigned, "role_b", ""));
  assert.deepEqual(getUnassignedProductionCharacters(cleared).map((character) => character.name), ["役B"]);
  assert.equal(cleared.auditionRoleProgress[0].recruitmentStarted, true);
});

test("normalizes and sorts manual production tasks", () => {
  const project = normalizeRecordingProject({
    auditionFormUrl: "https://docs.google.com/forms/d/example/viewform",
    auditionRoleProgress: {
      role_b: { formCreated: 1, recruitmentStarted: false }
    },
    tasks: [
      { id: "done", title: "完了済み", completed: true, dueDate: "2026-07-20" },
      { id: "later", title: "通常", dueDate: "2026-08-10" },
      { id: "important", title: "重要", priority: "重要", dueDate: "2026-08-20" }
    ]
  });

  assert.equal(project.auditionFormsFolderUrl, "https://docs.google.com/forms/d/example/viewform");
  assert.equal(project.auditionManagementSheetUrl, "https://docs.google.com/spreadsheets/d/19O9_lkivbomT5WiTRv-wsU5KKPLBx_lngZI4CclIXbY/edit?gid=1808011708#gid=1808011708");
  assert.deepEqual(project.auditionRoleProgress, [{
    characterId: "role_b",
    formCreated: true,
    formStructureVerified: false,
    formValidation: {},
    headerApplied: false,
    uploadVerified: false,
    recruitmentStarted: false,
    formEditUrl: "",
    formResponderUrl: "",
    headerImageUrl: "",
    socialImageUrl: "",
    imageAudit: {},
    auditionRoleSummary: "",
    auditionAcceptsFemaleApplicants: true,
    auditionAcceptsMaleApplicants: true,
    auditionLines: "",
    auditionDeadline: "",
    socialPostText: "",
    socialPostUpdatedAt: "",
    pcFinishStatus: "",
    pcFinishMessage: "",
    pcFinishedAt: "",
    createdAt: "",
    updatedAt: ""
  }]);
  assert.deepEqual(sortProductionTasks(project.tasks).map((task) => task.id), ["important", "later", "done"]);
});

test("infers a legacy applicant gender restriction from the saved role summary", () => {
  const project = normalizeRecordingProject({
    auditionRoleProgress: [{
      characterId: "ordis",
      auditionRoleSummary: "老齢の男性の役になります（女性の応募はご遠慮ください）。"
    }]
  });

  assert.equal(project.auditionRoleProgress[0].auditionAcceptsFemaleApplicants, false);
  assert.equal(project.auditionRoleProgress[0].auditionAcceptsMaleApplicants, true);
});

test("keeps an explicit applicant gender selection after reloading a project", () => {
  const saved = normalizeRecordingProject({
    auditionRoleProgress: [{
      characterId: "female_role",
      auditionAcceptsFemaleApplicants: true,
      auditionAcceptsMaleApplicants: false
    }]
  });
  const reloaded = normalizeRecordingProject(JSON.parse(JSON.stringify(saved)));

  assert.equal(reloaded.auditionRoleProgress[0].auditionAcceptsFemaleApplicants, true);
  assert.equal(reloaded.auditionRoleProgress[0].auditionAcceptsMaleApplicants, false);
});

test("offers only unregistered dialogue speakers from manually pasted script bodies", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "candidate_a", name: "候補者A", color: "#168b9a" }],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_4",
      chapterTitle: "第4章",
      sceneId: "scene_1",
      sceneTitle: "SCENE 01 試験会場",
      kind: "direction",
      manualBody: true,
      text: `候補者A
「先に行くよ。」

SE：拍手。

候補者C
「す、すごい……。」`
    }]
  });

  assert.deepEqual(getUnregisteredScriptSpeakers(project), [{
    name: "候補者C",
    count: 1,
    locations: [{ chapterTitle: "第4章", sceneTitle: "SCENE 01 試験会場" }]
  }]);
});

test("adds a confirmed script speaker as a character and immediately links their dialogue", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "candidate_a", name: "候補者A", color: "#168b9a" }],
    lines: [{
      id: "chapter_body",
      chapterTitle: "第4章",
      sceneTitle: "SCENE 01 試験会場",
      kind: "direction",
      manualBody: true,
      text: "候補者C\n「す、すごい……。」"
    }]
  });

  const updated = addProductionCharacterFromScriptSpeaker(project, "候補者C");
  const added = updated.characters.find((character) => character.name === "候補者C");
  const displayLine = getRecordingDisplayProject(updated).lines.find((line) => line.text === "す、すごい……。");

  assert.ok(added);
  assert.notEqual(added.color, updated.characters[0].color);
  assert.equal(displayLine.characterId, added.id);
  assert.equal(displayLine.kind, "dialogue");
  assert.equal(getCharacterDialogueCounts(updated)[added.id], 1);
  assert.deepEqual(getUnregisteredScriptSpeakers(updated), []);
});

test("keeps actor SNS and share credentials when correcting a single-role actor name", () => {
  const project = {
    castMembers: [{
      id: "cast_vel",
      actorName: "声優さん",
      contact: "連絡済み",
      socialUrl: "https://x.com/example",
      characterIds: ["vel"],
      wpUserId: 12,
      accessKey: "existing-key"
    }]
  };

  const updated = assignProductionActorName(project, "vel", "声優さん（正式名）");

  assert.deepEqual(updated.castMembers, [{
    ...project.castMembers[0],
    actorName: "声優さん（正式名）"
  }]);
});

test("reuses an existing actor without dropping their SNS when assigning another role", () => {
  const project = {
    castMembers: [
      { id: "cast_a", actorName: "Aさん", socialUrl: "https://x.com/a", characterIds: ["vel"] },
      { id: "cast_b", actorName: "Bさん", socialUrl: "https://x.com/b", characterIds: ["carla"] }
    ]
  };

  const updated = assignProductionActorName(project, "vel", "Ｂさん");

  assert.deepEqual(updated.castMembers[0].characterIds, []);
  assert.equal(updated.castMembers[1].socialUrl, "https://x.com/b");
  assert.deepEqual(updated.castMembers[1].characterIds, ["carla", "vel"]);
});

test("keeps the previous actor record when a role is reassigned to a different person", () => {
  const project = {
    castMembers: [{
      id: "cast_previous",
      actorName: "前任さん",
      socialUrl: "https://x.com/previous",
      characterIds: ["vel"],
      accessKey: "previous-key"
    }]
  };

  const updated = assignProductionActorName(project, "vel", "新任さん");

  assert.equal(updated.castMembers[0].socialUrl, "https://x.com/previous");
  assert.deepEqual(updated.castMembers[0].characterIds, []);
  assert.equal(updated.castMembers[1].actorName, "新任さん");
  assert.equal(updated.castMembers[1].socialUrl, "");
  assert.deepEqual(updated.castMembers[1].characterIds, ["vel"]);
});

test("only lets the questioner resolve an answered question", () => {
  const answered = { wpUserId: 11, answer: "こちらでお願いします。", status: "回答済み" };
  assert.equal(canResolveProductionQuestion(answered, 11), true);
  assert.equal(canResolveProductionQuestion(answered, 12), false);
  assert.equal(canResolveProductionQuestion({ ...answered, answer: "" }, 11), false);
  assert.equal(canResolveProductionQuestion({ ...answered, status: "未回答" }, 11), false);
  assert.equal(canResolveProductionQuestion({ ...answered, status: "解決済み" }, 11), false);
  assert.equal(canResolveProductionQuestion({ ...answered, wpUserId: 0, castMemberId: "cast_vel" }, 0, "cast_vel"), true);
  assert.equal(canResolveProductionQuestion({ ...answered, wpUserId: 0, castMemberId: "cast_vel" }, 0, "cast_other"), false);
});

test("keeps follow-up questions directly below their parent", () => {
  const parent = { id: "question_parent", parentQuestionId: "", body: "最初の質問" };
  const child = { id: "question_child", parentQuestionId: "question_parent", body: "追加の質問" };
  const other = { id: "question_other", parentQuestionId: "", body: "別の質問" };
  const threads = buildProductionQuestionThreads([child, other, parent]);

  assert.deepEqual(threads.map(({ question, depth }) => [question.id, depth]), [
    ["question_other", 0],
    ["question_parent", 0],
    ["question_child", 1]
  ]);
});

test("merges legacy character backgrounds and keeps actor social links", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル", profile: "人物像", background: "これまでの経歴" }],
    castMembers: [{ id: "cast_vel", actorName: "声優さん", snsUrl: "https://x.com/example", characterIds: ["vel"] }]
  });

  assert.equal(project.characters[0].profile, "人物像\n\nこれまでの経歴");
  assert.equal(project.characters[0].background, "");
  assert.equal(project.castMembers[0].socialUrl, "https://x.com/example");
});

test("keeps detailed production deadlines in date and time order", () => {
  const project = normalizeRecordingProject({
    recordingDeadline: "2026-08-31",
    recordingDeadlineTime: "18:00",
    releaseDate: "2026-10-01",
    releaseTime: "20:00",
    scheduleItems: [
      { id: "evening", title: "夕方確認", date: "2026-08-20", time: "18:30" },
      { id: "morning", title: "朝確認", date: "2026-08-20T09:15:00" }
    ],
    deadlineItems: [
      { id: "retake", title: "リテイク提出期限", type: "リテイク締切", date: "2026-08-25", time: "20:00" }
    ]
  });

  assert.equal(project.recordingDeadlineTime, "18:00");
  assert.equal(project.releaseTime, "20:00");
  assert.deepEqual(sortProductionScheduleItems(project.scheduleItems).map((item) => [item.id, item.date, item.time]), [
    ["morning", "2026-08-20", "09:15"],
    ["evening", "2026-08-20", "18:30"]
  ]);
  assert.deepEqual(project.deadlineItems.map((item) => [item.id, item.title, item.date, item.time]), [
    ["retake", "リテイク提出期限", "2026-08-25", "20:00"]
  ]);
});

test("adds one schedule item when an audition starts", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "vargas", name: "バルガス・ロウ" }],
    scheduleItems: []
  });
  const startedAt = new Date(2026, 7, 10, 14, 5);
  const started = addProductionAuditionStartSchedule(project, "vargas", startedAt);
  const repeated = addProductionAuditionStartSchedule(started, "vargas", startedAt);

  assert.equal(started.scheduleItems.length, 1);
  assert.deepEqual({
    type: started.scheduleItems[0].type,
    title: started.scheduleItems[0].title,
    date: started.scheduleItems[0].date,
    time: started.scheduleItems[0].time,
    status: started.scheduleItems[0].status,
    sourceKey: started.scheduleItems[0].sourceKey
  }, {
    type: "オーディション",
    title: "「バルガス・ロウ」オーディション募集開始",
    date: "2026-08-10",
    time: "14:05",
    status: "進行中",
    sourceKey: "audition-recruitment-start:vargas"
  });
  assert.equal(repeated.scheduleItems.length, 1);
  assert.equal(normalizeRecordingProject(started).scheduleItems[0].sourceKey, "audition-recruitment-start:vargas");
});

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
    vision: "",
    principles: ""
  });

  const withVision = migrateData({ studioConcept: { vision: "物語と声が長く残る場所をつくる。" }, recordingProjects: [] });
  assert.equal(withVision.studioConcept.vision, "物語と声が長く残る場所をつくる。");
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

test("reorders SE distribution sites without changing their saved details", () => {
  const sites = [
    { id: "site_a", name: "サイトA", homeUrl: "https://a.example" },
    { id: "site_b", name: "サイトB", homeUrl: "https://b.example" },
    { id: "site_c", name: "サイトC", homeUrl: "https://c.example" }
  ];
  const reordered = reorderProductionMaterialSourceSites(sites, "site_c", "site_a");

  assert.deepEqual(reordered.map((site) => site.id), ["site_c", "site_a", "site_b"]);
  assert.equal(reordered[0], sites[2]);
  assert.deepEqual(sites.map((site) => site.id), ["site_a", "site_b", "site_c"]);
});

test("reorders production templates without changing their contents", () => {
  const templates = [
    { id: "accepted", name: "合格連絡" },
    { id: "other", name: "別役打診" },
    { id: "rejected", name: "不合格連絡" }
  ];
  const reordered = reorderProductionTemplates(templates, "rejected", "accepted");

  assert.deepEqual(reordered.map((template) => template.id), ["rejected", "accepted", "other"]);
  assert.equal(reordered[0], templates[2]);
  assert.deepEqual(templates.map((template) => template.id), ["accepted", "other", "rejected"]);
});

test("extracts required SE cues from script markers without treating ordinary SE text as a cue", () => {
  const project = normalizeRecordingProject({
    lines: [
      { id: "rain_a", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", kind: "direction", text: "SE：激しい雨。" },
      { id: "rain_b", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", text: "（SE: 激しい雨。）" },
      { id: "not_se", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "dialogue", text: "これはSE：という説明です。" },
      { id: "music", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", text: "BGM：主題歌。" }
    ]
  });
  const required = extractScriptRequiredMaterials(project);

  assert.equal(required.length, 1);
  assert.equal(required[0].title, "激しい雨。");
  assert.equal(required[0].occurrenceCount, 2);
  assert.equal(required[0].locations.length, 2);
});

test("keeps manual required materials and remembers script cues dismissed by the owner", () => {
  const base = normalizeRecordingProject({
    lines: [{ id: "door", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", kind: "direction", text: "SE：重い扉が閉まる音" }],
    requiredMaterials: [{ id: "manual_wind", source: "manual", category: "SE", title: "遠くの風音", searchQuery: "風音" }]
  });
  const automatic = extractScriptRequiredMaterials(base)[0];
  const dismissed = normalizeRecordingProject({ ...base, dismissedRequiredMaterialKeys: [automatic.cueKey] });

  assert.deepEqual(getProductionRequiredMaterials(dismissed).map((material) => material.id), ["manual_wind"]);
  assert.deepEqual(getDismissedProductionRequiredMaterials(dismissed).map((material) => material.cueKey), [automatic.cueKey]);
});

test("groups automatic and manual required materials by script chapter", () => {
  const project = normalizeRecordingProject({
    lines: [
      { id: "rain_1", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", kind: "direction", text: "SE：激しい雨" },
      { id: "rain_2", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", text: "SE：激しい雨" },
      { id: "bell_2", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_3", sceneTitle: "Scene 3", kind: "direction", text: "SE：遠くの鐘" },
      { id: "dialogue_3", chapterId: "chapter_3", chapterTitle: "第三章", sceneId: "scene_4", sceneTitle: "Scene 4", kind: "dialogue", text: "静かになったね" }
    ],
    requiredMaterials: [
      { id: "manual_first", source: "manual", chapterId: "chapter_1", chapterTitle: "第一章", category: "SE", title: "足音" },
      { id: "manual_unassigned", source: "manual", category: "SE", title: "予備の環境音" }
    ]
  });
  const materials = getProductionRequiredMaterials(project);
  const groups = getProductionRequiredMaterialChapterGroups(project, materials);

  assert.deepEqual(groups.map((group) => [group.title, group.materials.length]), [
    ["第一章", 2],
    ["第二章", 2],
    ["第三章", 0],
    ["章未設定", 1]
  ]);
  assert.deepEqual(groups[0].materials.map((material) => material.title), ["激しい雨", "足音"]);
  assert.deepEqual(groups[1].materials.map((material) => material.title), ["激しい雨", "遠くの鐘"]);
  assert.equal(groups.at(-1).unassigned, true);
  assert.equal(project.requiredMaterials[0].chapterId, "chapter_1");
});

test("keeps the parent and chapter folders used to store generated SE files", () => {
  const project = normalizeRecordingProject({
    requiredMaterialFolderUrl: "https://drive.google.com/drive/folders/parent",
    requiredMaterialChapterFolders: [
      {
        chapterId: "chapter_1",
        chapterTitle: "第一章",
        folderUrl: "https://drive.google.com/drive/folders/chapter-1"
      },
      {
        chapterId: "chapter_2",
        chapterTitle: "第二章",
        url: "https://drive.google.com/drive/folders/chapter-2"
      }
    ]
  });

  assert.equal(project.requiredMaterialFolderUrl, "https://drive.google.com/drive/folders/parent");
  assert.deepEqual(project.requiredMaterialChapterFolders, [
    {
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      url: "https://drive.google.com/drive/folders/chapter-1"
    },
    {
      chapterId: "chapter_2",
      chapterTitle: "第二章",
      url: "https://drive.google.com/drive/folders/chapter-2"
    }
  ]);
});

test("builds a registered SE site search URL from its query template", () => {
  assert.equal(
    buildMaterialSourceSearchUrl({ searchUrlTemplate: "https://sounds.example/search?q={query}" }, "激しい 雨"),
    "https://sounds.example/search?q=%E6%BF%80%E3%81%97%E3%81%84%20%E9%9B%A8"
  );
  assert.equal(buildMaterialSourceSearchUrl({ searchUrlTemplate: "" }, "雨"), "");
});

test("keeps saved SE prompt settings and edited outputs", () => {
  const project = normalizeRecordingProject({
    requiredMaterials: [{
      id: "manual_thunder",
      source: "manual",
      title: "遠くの雷",
      commonSeName: "雷鳴ベース",
      sePrompt: {
        mode: "one-shot",
        durationSeconds: 6,
        distance: "far",
        space: "outdoor",
        intensity: "strong",
        style: "cinematic",
        detail: "余韻を長めにする",
        codexPrompt: "保存したCodex用プロンプト",
        elevenLabsPrompt: "Saved ElevenLabs prompt",
        fireflyPrompt: "Saved Adobe Firefly prompt"
      }
    }]
  });

  assert.equal(project.requiredMaterials[0].commonSeName, "雷鳴ベース");
  assert.deepEqual(project.requiredMaterials[0].sePrompt, {
    mode: "one-shot",
    durationSeconds: 6,
    promptInfluence: 0.3,
    distance: "far",
    space: "outdoor",
    intensity: "strong",
    style: "cinematic",
    detail: "余韻を長めにする",
    codexPrompt: "保存したCodex用プロンプト",
    elevenLabsPrompt: "Saved ElevenLabs prompt",
    fireflyPrompt: "Saved Adobe Firefly prompt"
  });
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
    sharedLinks: [
      { id: "line", label: "LINEオープンチャット", url: "https://line.me/example", description: "全体連絡" },
      { id: "drive", title: "共有資料", url: "https://drive.google.com/example" }
    ]
  });

  assert.deepEqual(project.sharedLinks, [
    {
      id: "line",
      title: "LINEオープンチャット",
      url: "https://line.me/example",
      notes: "全体連絡",
      color: "#168b9a"
    },
    {
      id: "drive",
      title: "共有資料",
      url: "https://drive.google.com/example",
      notes: "",
      color: "#b04f74"
    }
  ]);
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

test("includes only SE cues that mention the selected character", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル13世", scriptName: "ヴェル" },
      { id: "carla", name: "カーラ・マンソン", scriptName: "カーラ" }
    ],
    lines: [
      { id: "vel_line", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 1, characterId: "vel", kind: "dialogue", text: "まだ眠くないよ。" },
      { id: "vel_laugh", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 2, kind: "direction", text: "SE：ヴェルが小さく笑う。" },
      { id: "both_laugh", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 3, kind: "direction", text: "SE：ヴェルとカーラの二人が小さく笑う。" },
      { id: "thunder", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 4, kind: "direction", text: "SE：遠くで雷が鳴る。" },
      { id: "ordinary_direction", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 5, kind: "direction", text: "ヴェルが立ち上がる。" },
      { id: "carla_door", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 6, kind: "direction", text: "（SE: カーラが扉を閉める。）" },
      { id: "carla_line", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 7, characterId: "carla", kind: "dialogue", text: "静かにして。" }
    ]
  });

  const filtered = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["vel"],
    includeContext: false
  });

  assert.deepEqual(filtered.map((line) => line.id), ["vel_line", "vel_laugh", "both_laugh"]);
  assert.equal(filtered.find((line) => line.id === "vel_laugh").isContext, false);

  const carlaFiltered = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["carla"],
    includeContext: false
  });
  assert.deepEqual(carlaFiltered.map((line) => line.id), ["both_laugh", "carla_door", "carla_line"]);
});

test("shows the previous and next lines as context without crossing a scene boundary", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル" },
      { id: "carla", name: "カーラ" }
    ],
    lines: [
      { id: "before", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 1, characterId: "carla", text: "大丈夫？" },
      { id: "target", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 2, characterId: "vel", text: "ああ。" },
      { id: "after", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 3, characterId: "carla", text: "なら行こう。" },
      { id: "next_scene", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", order: 4, characterId: "carla", text: "次の場面。" }
    ]
  });

  const filtered = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["vel"],
    includeContext: true
  });

  assert.deepEqual(filtered.map((line) => [line.id, line.isContext]), [
    ["before", true],
    ["target", false],
    ["after", true]
  ]);
});

test("shows ordinary stage directions that mention the selected character as context", () => {
  const project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル13世", scriptName: "ヴェル" },
      { id: "carla", name: "カーラ・マンソン", scriptName: "カーラ" }
    ],
    lines: [
      { id: "carla_024", chapterId: "chapter_6", chapterTitle: "第6章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 24, characterId: "carla", text: "昔から体力配分が下手だったもんね。" },
      { id: "vel_025", chapterId: "chapter_6", chapterTitle: "第6章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 25, characterId: "vel", text: "うるせえ。" },
      { id: "carla_direction_026", chapterId: "chapter_6", chapterTitle: "第6章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 26, kind: "direction", text: "カーラが小さく笑う。" },
      { id: "audience_direction_027", chapterId: "chapter_6", chapterTitle: "第6章", sceneId: "scene_1", sceneTitle: "Scene 1", order: 27, kind: "direction", text: "観客の拍手がさらに広がる。" },
      { id: "other_scene", chapterId: "chapter_6", chapterTitle: "第6章", sceneId: "scene_2", sceneTitle: "Scene 2", order: 28, kind: "direction", text: "カーラが舞台袖へ移動する。" }
    ]
  });

  const withoutContext = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["carla"],
    includeContext: false
  });
  assert.deepEqual(withoutContext.map((line) => line.id), ["carla_024"]);

  const withContext = getFilteredRecordingLines({
    project,
    selectedCharacterIds: ["carla"],
    includeContext: true
  });
  assert.deepEqual(withContext.map((line) => [line.id, line.isContext]), [
    ["carla_024", false],
    ["vel_025", true],
    ["carla_direction_026", true]
  ]);
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

test("keeps retake markings separate from both stored and derived script text", () => {
  const stored = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }],
    lines: [{
      id: "stored_line",
      characterId: "vel",
      kind: "dialogue",
      text: "この泥雨を越える。",
      reviewStatus: "リテイク",
      retakeAnnotations: [{
        id: "mark_stored",
        quote: "泥雨",
        start: 0,
        end: 2,
        category: "アクセント",
        instruction: "二拍目の後で下げる",
        reading: "どろあめ",
        accentType: 2
      }]
    }]
  });

  assert.equal(stored.lines[0].text, "この泥雨を越える。");
  assert.equal(stored.lines[0].retakeAnnotations[0].start, 2);
  assert.equal(stored.lines[0].retakeAnnotations[0].accentType, 2);

  const manual = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }],
    lines: [{
      id: "chapter_body",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "章の本文",
      kind: "direction",
      manualBody: true,
      text: "ヴェル「この泥雨を越える。」"
    }]
  });
  const derivedLine = getRecordingDisplayProject(manual).lines.find((line) => line.kind === "dialogue");
  const patched = patchRecordingLineProgress(manual, derivedLine.id, {
    reviewStatus: "リテイク",
    retakeAnnotations: [{
      id: "mark_derived",
      quote: "泥雨",
      start: 2,
      end: 4,
      category: "読み方",
      instruction: "濁音を明瞭に"
    }]
  }, derivedLine);
  const displayedAgain = getRecordingDisplayProject(normalizeRecordingProject(patched))
    .lines.find((line) => line.id === derivedLine.id);

  assert.equal(displayedAgain.text, "この泥雨を越える。");
  assert.equal(displayedAgain.reviewStatus, "リテイク");
  assert.equal(displayedAgain.retakeAnnotations[0].quote, "泥雨");
  assert.equal(displayedAgain.retakeAnnotations[0].instruction, "濁音を明瞭に");
});

test("marks only the selected character's non-retake dialogue in one chapter as reviewed", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }, { id: "carla", name: "カーラ" }],
    lines: [
      { id: "stored", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "保存済みセリフ", actorStatus: "収録済み", reviewStatus: "未確認" },
      { id: "retake", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "録り直すセリフ", actorStatus: "収録済み", reviewStatus: "リテイク", directorNote: "語尾を強く" },
      { id: "carla", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "carla", kind: "dialogue", text: "別人物のセリフ", actorStatus: "収録済み", reviewStatus: "未確認" },
      { id: "manual", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", manualBody: true, text: "ヴェル「本文内のセリフ」" },
      { id: "direction", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", text: "雨が降る。" },
      { id: "other", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_3", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "別の章", actorStatus: "未収録", reviewStatus: "未確認" }
    ]
  });
  const before = getRecordingDisplayProject(project);
  const targetChapterId = before.lines.find((line) => line.id === "stored").chapterId;
  const updated = patchRecordingChapterReviewStatus(project, targetChapterId, "OK", "2026-08-09T12:00:00+09:00", ["vel"]);
  const after = getRecordingDisplayProject(updated);
  const targetDialogue = after.lines.filter((line) => line.chapterId === targetChapterId && line.characterId === "vel" && line.kind !== "direction" && line.id !== "retake");

  assert.ok(targetDialogue.length >= 2);
  assert.ok(targetDialogue.every((line) => line.reviewStatus === "OK"));
  assert.equal(after.lines.find((line) => line.id === "retake").reviewStatus, "リテイク");
  assert.equal(after.lines.find((line) => line.id === "retake").directorNote, "語尾を強く");
  assert.equal(after.lines.find((line) => line.id === "stored").actorStatus, "収録済み");
  assert.equal(after.lines.find((line) => line.id === "carla").reviewStatus, "未確認");
  assert.equal(after.lines.find((line) => line.id === "other").reviewStatus, "未確認");
  assert.equal(after.lines.find((line) => line.id === "direction").reviewStatus, "未確認");

  const cleared = getRecordingDisplayProject(patchRecordingChapterReviewStatus(updated, targetChapterId, "未確認", "2026-08-09T12:05:00+09:00", ["vel"]));
  assert.ok(cleared.lines.filter((line) => line.chapterId === targetChapterId && line.characterId === "vel" && line.kind !== "direction" && line.id !== "retake").every((line) => line.reviewStatus === "未確認"));
  assert.equal(cleared.lines.find((line) => line.id === "retake").reviewStatus, "リテイク");
});

test("marks only the selected character's chapter dialogue as recorded and preserves resubmissions", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }, { id: "carla", name: "カーラ" }],
    lines: [
      { id: "stored", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "保存済みセリフ", actorStatus: "未収録", reviewStatus: "OK" },
      { id: "resubmitted", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "再提出したセリフ", actorStatus: "再提出済み", reviewStatus: "リテイク" },
      { id: "carla", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "carla", kind: "dialogue", text: "別人物のセリフ", actorStatus: "未収録", reviewStatus: "未確認" },
      { id: "manual", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "Scene 2", kind: "direction", manualBody: true, text: "ヴェル「本文内のセリフ」" },
      { id: "other", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_3", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "別の章", actorStatus: "未収録", reviewStatus: "未確認" }
    ]
  });
  const before = getRecordingDisplayProject(project);
  const targetChapterId = before.lines.find((line) => line.id === "stored").chapterId;
  const recorded = patchRecordingChapterActorStatus(project, targetChapterId, "収録済み", "2026-08-10T12:00:00+09:00", ["vel"]);
  const afterRecorded = getRecordingDisplayProject(recorded);
  const targetDialogue = afterRecorded.lines.filter((line) => line.chapterId === targetChapterId && line.characterId === "vel" && line.kind !== "direction");

  assert.ok(targetDialogue.length >= 3);
  assert.ok(targetDialogue.every((line) => line.actorStatus !== "未収録"));
  assert.equal(afterRecorded.lines.find((line) => line.id === "resubmitted").actorStatus, "再提出済み");
  assert.equal(afterRecorded.lines.find((line) => line.id === "stored").reviewStatus, "OK");
  assert.equal(afterRecorded.lines.find((line) => line.id === "carla").actorStatus, "未収録");
  assert.equal(afterRecorded.lines.find((line) => line.id === "other").actorStatus, "未収録");

  const cleared = getRecordingDisplayProject(patchRecordingChapterActorStatus(recorded, targetChapterId, "未収録", "2026-08-10T12:10:00+09:00", ["vel"]));
  assert.ok(cleared.lines.filter((line) => line.chapterId === targetChapterId && line.characterId === "vel" && line.kind !== "direction").every((line) => line.actorStatus === "未収録"));
  assert.equal(cleared.lines.find((line) => line.id === "carla").actorStatus, "未収録");
});

test("updates the selected character across every chapter without changing retakes or other characters", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "vel", name: "ヴェル" }, { id: "carla", name: "カーラ" }],
    lines: [
      { id: "vel_1", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "第一章", actorStatus: "未収録", reviewStatus: "未確認" },
      { id: "vel_2", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_2", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "第二章", actorStatus: "未収録", reviewStatus: "未確認" },
      { id: "vel_retake", chapterId: "chapter_3", chapterTitle: "第三章", sceneId: "scene_3", sceneTitle: "Scene 1", characterId: "vel", kind: "dialogue", text: "第三章", actorStatus: "再提出済み", reviewStatus: "リテイク" },
      { id: "carla_1", chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "Scene 1", characterId: "carla", kind: "dialogue", text: "別人物", actorStatus: "未収録", reviewStatus: "未確認" },
      { id: "direction", chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_2", sceneTitle: "Scene 1", kind: "direction", text: "ト書き" }
    ]
  });

  const recorded = patchRecordingCharacterActorStatus(project, "収録済み", "2026-08-17T18:00:00+09:00", ["vel"]);
  const reviewed = patchRecordingCharacterReviewStatus(recorded, "OK", "2026-08-17T18:05:00+09:00", ["vel"]);
  const displayed = getRecordingDisplayProject(reviewed);

  assert.equal(displayed.lines.find((line) => line.id === "vel_1").actorStatus, "収録済み");
  assert.equal(displayed.lines.find((line) => line.id === "vel_2").actorStatus, "収録済み");
  assert.equal(displayed.lines.find((line) => line.id === "vel_retake").actorStatus, "再提出済み");
  assert.equal(displayed.lines.find((line) => line.id === "vel_1").reviewStatus, "OK");
  assert.equal(displayed.lines.find((line) => line.id === "vel_2").reviewStatus, "OK");
  assert.equal(displayed.lines.find((line) => line.id === "vel_retake").reviewStatus, "リテイク");
  assert.equal(displayed.lines.find((line) => line.id === "carla_1").actorStatus, "未収録");
  assert.equal(displayed.lines.find((line) => line.id === "carla_1").reviewStatus, "未確認");
  assert.equal(displayed.lines.find((line) => line.id === "direction").reviewStatus, "未確認");

  const clearedReview = getRecordingDisplayProject(patchRecordingCharacterReviewStatus(reviewed, "未確認", "2026-08-17T18:10:00+09:00", ["vel"]));
  assert.equal(clearedReview.lines.find((line) => line.id === "vel_1").reviewStatus, "未確認");
  assert.equal(clearedReview.lines.find((line) => line.id === "vel_2").reviewStatus, "未確認");
  assert.equal(clearedReview.lines.find((line) => line.id === "vel_retake").reviewStatus, "リテイク");
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
    questions: [{ id: "question_private", authorName: "声優A", wpUserId: 42, castMemberId: "cast_a", parentQuestionId: "question_parent", body: "確認です。" }]
  });

  assert.equal(project.questions[0].wpUserId, 42);
  assert.equal(project.questions[0].castMemberId, "cast_a");
  assert.equal(project.questions[0].parentQuestionId, "question_parent");
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

test("omits private production data from actor share payloads", () => {
  const project = normalizeRecordingProject({
    sourceScriptText: "非公開の取り込み原文",
    scriptSnapshots: [{ id: "private_version", lines: [{ id: "old_line", recordingUrl: "https://drive.google.com/file/d/private/view" }] }],
    auditionFormsFolderUrl: "https://drive.google.com/drive/folders/private",
    auditionManagementSheetUrl: "https://docs.google.com/spreadsheets/d/private/edit",
    auditionSocialTemplate: { introductionText: "非公開の募集文テンプレート" },
    contactTemplateSheetUrl: "https://docs.google.com/spreadsheets/d/private-contact/edit",
    contactTemplates: [{ id: "template_private", category: "合格連絡", name: "合格", body: "〇〇さん", enabled: true }],
    contactMessageDrafts: [{ id: "draft_private", templateId: "template_private", characterId: "role_private", body: "非公開の個別文" }],
    manualContactRecipients: [{ id: "recipient_private", actorName: "応募者", socialUrl: "https://x.com/private" }],
    otherRoleContact: { contactName: "別役候補者", contactHonorific: "さん", socialUrl: "https://x.com/private-other" },
    socialTemplates: [{ id: "social_private", category: "お知らせ", name: "非公開", body: "非公開投稿" }],
    socialMessageDrafts: [{ id: "social_draft_private", templateId: "social_private", body: "書き換えた投稿" }],
    auditionApplicants: [{ id: "applicant_private", responseId: "response_private", name: "応募者", socialUrl: "https://x.com/private" }],
    auditionRoleProgress: [{
      characterId: "role_private",
      formCreated: true,
      formEditUrl: "https://docs.google.com/forms/d/private/edit",
      formResponderUrl: "https://docs.google.com/forms/d/private/viewform",
      headerImageUrl: "https://drive.google.com/file/d/header/view",
      socialImageUrl: "https://drive.google.com/file/d/social/view"
    }],
    lines: [{ id: "current_line", text: "現在の台本" }]
  });
  const shared = getShareableRecordingProject(project);

  assert.equal("sourceScriptText" in shared, false);
  assert.equal("scriptSnapshots" in shared, false);
  assert.equal("auditionFormsFolderUrl" in shared, false);
  assert.equal("auditionManagementSheetUrl" in shared, false);
  assert.equal("auditionSocialTemplate" in shared, false);
  assert.equal("contactTemplateSheetUrl" in shared, false);
  assert.equal("contactTemplates" in shared, false);
  assert.equal("contactMessageDrafts" in shared, false);
  assert.equal("manualContactRecipients" in shared, false);
  assert.equal("otherRoleContact" in shared, false);
  assert.equal("socialTemplates" in shared, false);
  assert.equal("socialMessageDrafts" in shared, false);
  assert.equal("auditionApplicants" in shared, false);
  assert.equal(shared.auditionRoleProgress[0].formCreated, true);
  assert.equal("formEditUrl" in shared.auditionRoleProgress[0], false);
  assert.equal("formResponderUrl" in shared.auditionRoleProgress[0], false);
  assert.equal("headerImageUrl" in shared.auditionRoleProgress[0], false);
  assert.equal("socialImageUrl" in shared.auditionRoleProgress[0], false);
  assert.equal(shared.lines[0].text, "現在の台本");
});

test("adds contact templates to older projects and preserves role-specific drafts", () => {
  const olderProject = normalizeRecordingProject({ title: "旧作品" });
  assert.match(olderProject.auditionSocialTemplate.introductionText, /\{\{作品名\}\}/u);
  assert.equal(olderProject.contactTemplates.length, 8);
  assert.equal(olderProject.contactTemplates.some((template) => template.name === "合格のお知らせ"), true);
  assert.equal(olderProject.contactTemplates.some((template) => template.name === "リテイクのお願い"), true);

  const project = normalizeRecordingProject({
    contactTemplates: [{ id: "accepted", category: "合格連絡", name: "合格", body: "〇〇さん、△△役です。" }],
    contactMessageDrafts: [{ templateId: "accepted", characterId: "character_a", body: "書き換えた個別文" }]
  });
  assert.equal(project.contactTemplates.length, 2);
  assert.equal(project.contactTemplates.some((template) => template.id === "contact_template_retake"), true);
  assert.equal(project.contactMessageDrafts[0].body, "書き換えた個別文");

  const afterDeletingRetakeTemplate = normalizeRecordingProject({
    contactTemplateSchemaVersion: 1,
    contactTemplates: [{ id: "accepted", category: "合格連絡", name: "合格", body: "〇〇さん" }]
  });
  assert.equal(afterDeletingRetakeTemplate.contactTemplates.length, 1);
});

test("keeps manually entered contact recipients across project reloads", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "role_a", name: "応募役A" }],
    manualContactRecipients: [{
      id: "manual_a",
      actorName: "青葉かなで",
      contactName: "青葉",
      contactHonorific: "さん",
      socialUrl: "@aobakanade",
      sourceCharacterId: "role_a",
      sourceRoleName: "応募役A"
    }]
  });

  assert.deepEqual(project.manualContactRecipients, [{
    id: "manual_a",
    actorName: "青葉かなで",
    contactName: "青葉",
    contactHonorific: "さん",
    socialUrl: "https://x.com/aobakanade",
    sourceCharacterId: "role_a",
    sourceRoleName: "応募役A"
  }]);
});

test("keeps another-role recipients separate from assigned cast members", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "role_original", name: "ヴェル13世" }],
    castMembers: [{
      id: "cast_vel",
      actorName: "決定済み声優",
      contactName: "決定済み声優",
      characterIds: ["role_original"]
    }],
    otherRoleContact: {
      contactName: "ざっきー",
      contactHonorific: "さん",
      socialUrl: "@zacky",
      sourceCharacterId: "role_original",
      sourceRoleName: "ヴェル13世"
    }
  });

  assert.deepEqual(project.otherRoleContact, {
    contactName: "ざっきー",
    contactHonorific: "さん",
    socialUrl: "https://x.com/zacky",
    sourceCharacterId: "role_original",
    sourceRoleName: "ヴェル13世"
  });
  assert.equal(project.castMembers[0].contactName, "決定済み声優");
});

test("migrates the recipient name from a legacy another-role draft", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "role_original", name: "ヴェル13世" }],
    contactMessageDrafts: [{
      templateId: "contact_template_other_role",
      characterId: "role_original",
      body: "ざっきーさん、初めてメッセージ送らせて頂きます＾＾\nべるぼと申します＾＾",
      updatedAt: "2026-08-17T00:00:00.000Z"
    }]
  });

  assert.equal(project.otherRoleContact.contactName, "ざっきー");
  assert.equal(project.otherRoleContact.contactHonorific, "さん");
  assert.equal(project.otherRoleContact.sourceCharacterId, "role_original");
  assert.equal(project.otherRoleContact.sourceRoleName, "ヴェル13世");
});

test("builds a contact message from the actor contact name and character role", () => {
  assert.equal(getActorContactName({ actorName: "山田太郎さん", contactName: "山田" }), "山田");
  assert.equal(getActorContactName({ actorName: "山田太郎様" }), "山田太郎");

  const message = buildProductionContactMessage({
    body: "〇〇さん、【作品名／役名】の△△役をお願いします。{{声優名}}／{{役名}}／{{作品名}}"
  }, {
    actorName: "山田",
    roleName: "ヴェル13世",
    projectTitle: "雨を晴らせない男の復活劇"
  });

  assert.equal(
    message,
    "山田さん、【雨を晴らせない男の復活劇／ヴェル13世】のヴェル13世役をお願いします。山田／ヴェル13世／雨を晴らせない男の復活劇"
  );
});

test("uses the special recipient form only for the other-role request template", () => {
  assert.equal(isOtherRoleRequestContactTemplate({ id: "contact_template_other_role", name: "名称変更済み" }), true);
  assert.equal(isOtherRoleRequestContactTemplate({ id: "custom", name: "別の役を依頼" }), true);
  assert.equal(isOtherRoleRequestContactTemplate({ id: "custom", name: "別の役のご快諾への返信" }), false);
  assert.equal(isOtherRoleRequestContactTemplate({ id: "contact_template_accepted", name: "合格のお知らせ" }), false);
});

test("builds a character-specific retake list for contact messages", () => {
  let project = normalizeRecordingProject({
    characters: [
      { id: "vel", name: "ヴェル13世" },
      { id: "carla", name: "カーラ・マンソン" }
    ],
    lines: [
      {
        id: "vel_retake",
        order: 25,
        chapterId: "chapter_1",
        chapterTitle: "第一章",
        sceneId: "scene_2",
        sceneTitle: "SCENE 02 雨の路地",
        characterId: "vel",
        text: "｜二十年前《にじゅうねんまえ》、同じ夢を見ていた。",
        reviewStatus: "リテイク",
        directorNote: "全体を少し静かにお願いします。",
        retakeAnnotations: [{
          quote: "二十年前",
          category: "アクセント",
          instruction: "語頭を急がず、下がり目を明確にしてください。",
          reading: "にじゅうねんまえ",
          accentType: 4,
          accentRiseAt: 2
        }]
      },
      {
        id: "carla_retake",
        order: 26,
        chapterId: "chapter_1",
        chapterTitle: "第一章",
        sceneId: "scene_2",
        sceneTitle: "SCENE 02 雨の路地",
        characterId: "carla",
        text: "別人物のセリフ",
        reviewStatus: "リテイク",
        directorNote: "対象外"
      },
      {
        id: "vel_manual_body",
        order: 30,
        chapterId: "chapter_1",
        chapterTitle: "第一章",
        sceneId: "scene_3",
        sceneTitle: "SCENE 03 制御室",
        kind: "direction",
        manualBody: true,
        text: "ヴェル「制御を戻せ！」"
      }
    ]
  });

  const derivedRetake = getRecordingDisplayProject(project).lines.find((line) => (
    line.derivedFromManualBody && line.characterId === "vel"
  ));
  project = patchRecordingLineProgress(project, derivedRetake.id, {
    reviewStatus: "リテイク",
    retakeAnnotations: [{
      quote: "制御を戻せ",
      category: "読み方",
      instruction: "言葉を明瞭にしてください。"
    }]
  }, derivedRetake);

  const retakes = getProductionCharacterRetakes(project, "vel");
  assert.equal(retakes.length, 2);
  assert.equal(retakes[0].text, "二十年前、同じ夢を見ていた。");
  assert.equal(retakes[1].text, "制御を戻せ！");

  const retakeList = buildProductionRetakeList(project, "vel");
  assert.match(retakeList, /^【1】セリフ番号：025\n\n/u);
  assert.match(retakeList, /セリフ番号：025/u);
  assert.match(retakeList, /・「二十年前」/u);
  assert.match(retakeList, /アクセント：.*＼/u);
  assert.match(retakeList, /・「二十年前」[\s\S]*\n\n語頭を急がず、下がり目を明確にしてください。/u);
  assert.match(retakeList, /全体を少し静かにお願いします。/u);
  assert.match(retakeList, /セリフ番号：030/u);
  assert.match(retakeList, /・「制御を戻せ」/u);
  assert.doesNotMatch(retakeList, /第一章|SCENE 02|SCENE 03/u);
  assert.doesNotMatch(retakeList, /元のセリフ/u);
  assert.doesNotMatch(retakeList, /［アクセント］|［読み方］/u);
  assert.doesNotMatch(retakeList, /直してほしい箇所：|修正：|お願い：/u);
  assert.doesNotMatch(retakeList, /別人物/u);

  const savedCustomDraft = `手書きで直した挨拶です。\n\n${retakeList.split("\n\n")[0]}\n\nお手数をおかけしますが、よろしくお願いいたします。`;
  const restoredDraft = mergeMissingProductionRetakesIntoDraft(savedCustomDraft, retakes);
  assert.match(restoredDraft, /^手書きで直した挨拶です。/u);
  assert.match(restoredDraft, /セリフ番号：030/u);
  assert.match(restoredDraft, /・「制御を戻せ」/u);
  assert.ok(restoredDraft.indexOf("セリフ番号：030") < restoredDraft.indexOf("お手数をおかけします"));
  assert.equal(mergeMissingProductionRetakesIntoDraft(restoredDraft, retakes), restoredDraft);

  const changedRetakes = retakes.map((retake) => retake.id === "vel_retake"
    ? {
      ...retake,
      instructions: retake.instructions.map((instruction) => ({
        ...instruction,
        instruction: "再リテイクでは語尾まで明瞭にしてください。"
      }))
    }
    : retake);
  const refreshedDraft = mergeMissingProductionRetakesIntoDraft(restoredDraft, changedRetakes);
  assert.match(refreshedDraft, /\n\n再リテイクでは語尾まで明瞭にしてください。/u);
  assert.doesNotMatch(refreshedDraft, /語頭を急がず、下がり目を明確にしてください。/u);
  assert.match(refreshedDraft, /^手書きで直した挨拶です。/u);
  assert.match(refreshedDraft, /お手数をおかけしますが、よろしくお願いいたします。$/u);

  const message = buildProductionContactMessage({
    id: "contact_template_retake",
    category: "確認依頼",
    name: "リテイクのお願い",
    body: "〇〇さん\n△△役です。\n\n{{リテイク一覧}}\n\n例：ファイル名_re1.wav\nさらにリテイクがある場合：ファイル名_re2.wav"
  }, {
    actorName: "青葉",
    actorHonorific: "さん",
    roleName: "ヴェル13世",
    retakeList
  });
  assert.match(message, /^青葉さん\nヴェル13世役です。/u);
  assert.match(message, /セリフ番号：025/u);
  assert.doesNotMatch(message, /さらにリテイクがある場合：ファイル名_re2\.wav/u);
  assert.equal(isRetakeRequestContactTemplate({ id: "contact_template_retake" }), true);
  assert.equal(isRetakeRequestContactTemplate({ name: "リテイクのお願い" }), true);
});

test("keeps non-recipient placeholders intact in announcement and confirmation templates", () => {
  const announcement = buildProductionContactMessage({
    category: "募集告知",
    body: "作品名：〇〇\n募集役：〇〇\n応募方法：〇〇"
  }, {
    actorName: "山田",
    roleName: "ヴェル13世",
    projectTitle: "雨を晴らせない男の復活劇"
  });
  assert.equal(announcement, "作品名：雨を晴らせない男の復活劇\n募集役：ヴェル13世\n応募方法：〇〇");

  const confirmation = buildProductionContactMessage({
    category: "確認依頼",
    body: "〇〇さん\n・〇〇\n・〇〇"
  }, { actorName: "山田", roleName: "ヴェル13世" });
  assert.equal(confirmation, "山田さん\n・〇〇\n・〇〇");
});

test("normalizes mixed X handles and legacy Twitter URLs", () => {
  assert.equal(normalizeXProfileUrl("@aobakanade"), "https://x.com/aobakanade");
  assert.equal(normalizeXProfileUrl("twitter.com/aobakanade/status/123"), "https://x.com/aobakanade");
  assert.equal(normalizeXProfileUrl("https://x.com/aobakanade/"), "https://x.com/aobakanade");
});

test("keeps a separate contact honorific and uses it in messages", () => {
  assert.equal(getActorContactHonorific({ actorName: "山田太郎" }), "さん");
  assert.equal(getActorContactHonorific({ actorName: "山田太郎", contactHonorific: "先生" }), "先生");
  assert.equal(getActorContactName({ actorName: "ざっきー", contactName: "ざっきーさん" }), "ざっきー");
  assert.equal(buildProductionContactMessage({ body: "〇〇さん、こんにちは。" }, {
    actorName: "山田",
    actorHonorific: "先生"
  }), "山田先生、こんにちは。");
});

test("fills another-role placeholders in saved drafts and removes duplicate honorifics", () => {
  const message = buildProductionContactMessage({
    category: "その他",
    body: "ざっきーさんさんへ。◆◆という役があります。◆◆は第■章で出てきます。◆◆の画像です。"
  }, {
    actorName: "ざっきー",
    actorHonorific: "さん",
    roleName: "ヴェル13世",
    offeredRoleName: "バルガス・ロウ",
    appearanceLabel: "第四章、第六章"
  });

  assert.equal(message, "ざっきーさんへ。バルガス・ロウという役があります。バルガス・ロウは第四章、第六章に登場します。バルガス・ロウの画像です。");
});

test("builds another-role messages with the offered role and automatic chapter label", () => {
  const message = buildProductionContactMessage({
    category: "その他",
    body: "〇〇さんは△△役へ応募。◆◆をお願いします。◆◆は第■章で出てきます。"
  }, {
    actorName: "青葉",
    actorHonorific: "さん",
    roleName: "観客A",
    offeredRoleName: "バルガス・ロウ",
    appearanceLabel: "第一章、第三章"
  });
  assert.equal(message, "青葉さんは観客A役へ応募。バルガス・ロウをお願いします。バルガス・ロウは第一章、第三章に登場します。");
});

test("shows the low-dialogue notice only when the offered role has four lines or fewer", () => {
  const body = "もしよかったらサンプルにあった「◇◇」のお声の感じで演じて頂けないかと思いました＾＾";
  assert.equal(
    applyProductionContactDialogueCountNotice(body, 4),
    "こちらセリフ数は少ないのですが、もしよかったらサンプルにあった「◇◇」のお声の感じで演じて頂けないかと思いました＾＾"
  );
  assert.equal(
    applyProductionContactDialogueCountNotice(`こちらセリフ数は少ないのですが、${body}`, 5),
    body
  );
  assert.equal(
    buildProductionContactMessage({ body: `◆◆：こちらセリフ数は少ないのですが、${body}` }, {
      offeredRoleName: "モーリス・ペック",
      offeredRoleDialogueCount: 7
    }),
    `モーリス・ペック：${body}`
  );
});

test("reflects one or multiple selected roles in early-result social messages", () => {
  const template = {
    body: "『{{作品名}}』\n「〇〇」役\nをお願いさせていただく方へ、先行してご連絡しました。"
  };
  assert.equal(
    buildProductionSocialMessage(template, {
      projectTitle: "雨を晴らせない男の復活劇",
      roleNames: ["ヴェル13世"]
    }),
    "『雨を晴らせない男の復活劇』\n「ヴェル13世」役\nをお願いさせていただく方へ、先行してご連絡しました。"
  );
  assert.equal(
    buildProductionSocialMessage(template, {
      projectTitle: "雨を晴らせない男の復活劇",
      roleNames: ["ヴェル13世", "カーラ・マンソン"]
    }),
    "『雨を晴らせない男の復活劇』\n「ヴェル13世」役・「カーラ・マンソン」役\nをお願いさせていただく方へ、先行してご連絡しました。"
  );
  assert.equal(
    applyProductionSocialRoleSelection(
      "「ヴェル13世」役・「カーラ・マンソン」役\nをお願いさせていただく方へ、",
      ["オルディス・グランベル"],
      ["ヴェル13世", "カーラ・マンソン"]
    ),
    "「オルディス・グランベル」役\nをお願いさせていただく方へ、"
  );
});

test("keeps selected social-template roles after reloading", () => {
  const project = normalizeRecordingProject({
    socialMessageDrafts: [{
      templateId: "social_early_result",
      characterIds: ["role_a", "role_a", "role_b", ""],
      body: "先行結果"
    }]
  });
  assert.deepEqual(project.socialMessageDrafts[0].characterIds, ["role_a", "role_b"]);
});

test("summarizes character appearances by chapter and recognizes all chapters", () => {
  const project = normalizeRecordingProject({
    characters: [{ id: "hero", name: "主人公" }, { id: "guest", name: "ゲスト" }],
    lines: [
      { id: "l1", chapterId: "c1", chapterTitle: "第一章 はじまり", sceneId: "s1", sceneTitle: "場面1", characterId: "hero", kind: "dialogue", text: "A" },
      { id: "l2", chapterId: "c1", chapterTitle: "第一章 はじまり", sceneId: "s1", sceneTitle: "場面1", characterId: "guest", kind: "dialogue", text: "B" },
      { id: "l3", chapterId: "c2", chapterTitle: "第二章 旅立ち", sceneId: "s2", sceneTitle: "場面2", characterId: "hero", kind: "dialogue", text: "C" }
    ]
  });
  assert.equal(getProductionCharacterAppearanceLabel(project, "hero"), "全章にわたって");
  assert.equal(getProductionCharacterAppearanceLabel(project, "guest"), "第一章");
});

test("imports applicants once and assigns the selected applicant to a character", () => {
  const imported = mergeProductionAuditionApplicants([], [{
    responseId: "response_1",
    formId: "form_1",
    sourceCharacterId: "role_a",
    sourceRoleName: "役A",
    name: "青葉かなで",
    socialInput: "@aobakanade",
    submittedAt: "2026-08-10T10:00:00.000Z"
  }]);
  const mergedAgain = mergeProductionAuditionApplicants(imported.map((item) => ({ ...item, status: "キープ" })), imported);
  assert.equal(mergedAgain.length, 1);
  assert.equal(mergedAgain[0].socialUrl, "https://x.com/aobakanade");
  assert.equal(mergedAgain[0].status, "キープ");

  const project = normalizeRecordingProject({
    characters: [{ id: "role_a", name: "役A" }],
    lines: [{ id: "line_a", chapterId: "c1", chapterTitle: "第一章", sceneId: "s1", sceneTitle: "場面1", characterId: "role_a", kind: "dialogue", text: "台詞" }],
    auditionApplicants: mergedAgain
  });
  const assigned = assignProductionAuditionApplicant(project, mergedAgain[0].id, "role_a");
  assert.equal(assigned.castMembers[0].actorName, "青葉かなで");
  assert.equal(assigned.castMembers[0].contactName, "青葉かなで");
  assert.equal(assigned.castMembers[0].contactHonorific, "さん");
  assert.equal(assigned.castMembers[0].socialUrl, "https://x.com/aobakanade");
  assert.equal(assigned.auditionApplicants[0].status, "合格");
});

test("groups audition applicants by recruitment role in character order", () => {
  const project = {
    characters: [
      { id: "role_b", name: "役B", color: "#222222" },
      { id: "role_a", name: "役A", color: "#111111" }
    ],
    auditionApplicants: [
      { id: "a1", sourceCharacterId: "role_a", sourceRoleName: "旧役A", name: "応募者1" },
      { id: "b1", sourceCharacterId: "role_b", sourceRoleName: "役B", name: "応募者2" },
      { id: "a2", sourceRoleName: "役A", name: "応募者3" },
      { id: "x1", sourceRoleName: "追加役", name: "応募者4" }
    ]
  };

  const groups = groupProductionAuditionApplicantsByRole(project);
  assert.deepEqual(groups.map((group) => [group.roleName, group.applicants.length]), [
    ["役B", 1],
    ["役A", 2],
    ["追加役", 1]
  ]);
  assert.equal(groups[1].color, "#111111");
});

test("builds an editable project-wide SNS message", () => {
  assert.equal(buildProductionSocialMessage({ body: "『{{作品名}}』公開＾＾" }, { projectTitle: "雨の街" }), "『雨の街』公開＾＾");
});
