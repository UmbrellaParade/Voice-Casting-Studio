export const ACTOR_RECORDING_STATUSES = ["未収録", "収録済み", "再提出済み"];
export const DIRECTOR_REVIEW_STATUSES = ["未確認", "確認中", "OK", "リテイク", "保留"];
export const LINE_PERFORMANCE_TYPES = ["通常", "ナレーション", "心の声", "イヤモニ"];
export const PRODUCTION_MATERIAL_CATEGORIES = ["主題歌", "BGM", "SE", "完成音源", "サムネイル"];
export const PRODUCTION_MATERIAL_STATUSES = ["準備中", "制作中", "確認待ち", "完成"];
export const PRODUCTION_QUESTION_STATUSES = ["未回答", "回答済み", "解決済み"];
export const PRODUCTION_SCHEDULE_TYPES = ["収録締切", "公開予定", "編集", "収録", "その他"];
export const PRODUCTION_SCHEDULE_STATUSES = ["予定", "進行中", "完了", "延期"];
export const SHARED_LINK_COLORS = [
  "#168b9a", "#b04f74", "#6f5aa7", "#b36b1f",
  "#397c50", "#4b6fa9", "#9b4b45", "#7c5c3d"
];

export const canResolveProductionQuestion = (question = {}, userId) => {
  const questionUserId = Number(question.wpUserId);
  const currentUserId = Number(userId);
  return question.status === "回答済み"
    && Boolean(String(question.answer || "").trim())
    && Number.isFinite(questionUserId)
    && Number.isFinite(currentUserId)
    && questionUserId === currentUserId;
};

const normalizeSharedLinkColor = (value = "") => {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
};

const reorderProductionItems = (items = [], sourceId = "", targetId = "") => {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

export const reorderProductionMaterials = (materials = [], sourceId = "", targetId = "") =>
  reorderProductionItems(materials, sourceId, targetId);

export const reorderProductionCharacters = (characters = [], sourceId = "", targetId = "") =>
  reorderProductionItems(characters, sourceId, targetId);

export const reorderProductionSharedLinks = (links = [], sourceId = "", targetId = "") =>
  reorderProductionItems(links, sourceId, targetId);

export const reorderProductionRecordingFolders = (characterIds = [], sourceId = "", targetId = "") =>
  reorderProductionItems(
    (Array.isArray(characterIds) ? characterIds : []).map((id) => ({ id })),
    sourceId,
    targetId
  ).map((item) => item.id);

export const parseManualChapterBody = (bodyText = "", chapterTitle = "") => {
  const chapter = String(chapterTitle || "").trim();
  const rows = [];
  let sceneTitle = "章の本文";
  let bodyLines = [];
  let sceneStarted = false;

  const flushScene = ({ keepEmpty = false } = {}) => {
    const text = bodyLines.join("\n").trim();
    if (text || keepEmpty) {
      rows.push({
        chapterTitle: chapter,
        sceneTitle,
        sourceKind: "direction",
        speaker: "ト書き",
        text,
        direction: "",
        fileName: "",
        manualBody: true
      });
    }
    bodyLines = [];
  };

  String(bodyText || "").replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
    const heading = line.match(/^\s*##\s+(.+?)\s*$/);
    if (!heading) {
      bodyLines.push(line);
      return;
    }
    if (sceneStarted || bodyLines.some((item) => item.trim())) flushScene({ keepEmpty: sceneStarted });
    sceneTitle = heading[1].trim() || "無題のシーン";
    sceneStarted = true;
  });
  flushScene({ keepEmpty: sceneStarted });

  return rows;
};

const RUBY_SOURCE = "(?:[|｜]([^《\\n]+)《([^》\\n]+)》|\\{([^|{}\\n]+)\\|([^{}\\n]+)\\})";

const CHARACTER_COLORS = [
  "#168b9a", "#d65285", "#7a63ad", "#b57024", "#2f7d4a", "#5f6d7a",
  "#c63f3f", "#2870c7", "#a45714", "#0f766e", "#a23b72", "#6b5fbd",
  "#477a1e", "#b23a78", "#3b6e8f", "#8a5d1d", "#596f2a", "#bb4d00",
  "#006d77", "#8b4f9f", "#2d6a4f", "#9d4edd", "#c2415c", "#4c6faf",
  "#7f5539", "#0081a7", "#6a994e", "#bc4749", "#5a189a", "#3d5a80",
  "#c05621", "#52796f"
];

const CHARACTER_ALIAS_TARGETS = new Map([
  ["ヴェルイヤモニ", "ヴェル"],
  ["ヴェルのイヤモニ", "ヴェル"],
  ["ヴェルイヤモニ越し", "ヴェル"],
  ["ヴェルイヤモニ越しの声", "ヴェル"],
  ["ヴェルイヤーモニター", "ヴェル"],
  ["ヴェルイヤーモニター越し", "ヴェル"],
  ["ヴェル心の声", "ヴェル"],
  ["ヴェルの心の声", "ヴェル"],
  ["アマモリナレーター", "アマモリ"],
  ["アマモリのナレーター", "アマモリ"],
  ["アマモリナレーション", "アマモリ"],
  ["アマモリのナレーション", "アマモリ"],
  ["アマモリ語り", "アマモリ"],
  ["アマモリの語り", "アマモリ"]
]);

const CHARACTER_ALIAS_SUFFIXES = [
  "のイヤモニ越しの声", "イヤモニ越しの声", "のイヤーモニター越し", "イヤーモニター越し",
  "のイヤモニ越し", "イヤモニ越し", "のイヤーモニター", "イヤーモニター",
  "のイヤモニ", "イヤモニ", "の心の声", "心の声",
  "のナレーター", "ナレーター", "のナレーション", "ナレーション", "の語り", "語り"
];

const normalizeCharacterAliasToken = (value = "") => String(value || "")
  .normalize("NFKC")
  .replace(/\s+/g, "")
  .replace(/[()[\]【】〈〉《》「」『』・･／/\\:：_\-―—–]/g, "")
  .toLocaleLowerCase("ja");

const normalizeCharacterAliases = (aliases = [], currentName = "") => {
  const currentToken = normalizeCharacterAliasToken(currentName);
  const seen = new Set();
  return (Array.isArray(aliases) ? aliases : [])
    .map((alias) => String(alias || "").normalize("NFKC").trim())
    .filter((alias) => {
      const token = normalizeCharacterAliasToken(alias);
      if (!token || token === currentToken || seen.has(token)) return false;
      seen.add(token);
      return true;
    });
};

const inferCharacterScriptName = (character = {}) => {
  const name = String(character.name || "").normalize("NFKC").trim();
  if (!name) return "";
  const firstName = name.split(/[・･]/)[0].trim() || name;
  const withoutGenerationalSuffix = firstName
    .replace(/(?:第)?(?:\d+|[〇零一二三四五六七八九十百千]+)世$/u, "")
    .trim();
  if (withoutGenerationalSuffix && withoutGenerationalSuffix !== name) return withoutGenerationalSuffix;

  const nameToken = normalizeCharacterAliasToken(name);
  const shorterAlias = normalizeCharacterAliases(character.scriptAliases, name)
    .filter((alias) => {
      const aliasToken = normalizeCharacterAliasToken(alias);
      return aliasToken && aliasToken.length < nameToken.length && nameToken.includes(aliasToken);
    })
    .sort((left, right) => left.length - right.length)[0];
  return shorterAlias || name;
};

export const getCharacterScriptName = (character = {}) => {
  const explicit = String(character.scriptName || character.shortName || "").normalize("NFKC").trim();
  return explicit || inferCharacterScriptName(character);
};

export const getCharacterKnownNames = (character = {}) => {
  const seen = new Set();
  return [
    String(character.name || "").normalize("NFKC").trim(),
    getCharacterScriptName(character),
    ...normalizeCharacterAliases(character.scriptAliases, character.name)
  ].filter((name) => {
    const token = normalizeCharacterAliasToken(name);
    if (!token || seen.has(token)) return false;
    seen.add(token);
    return true;
  });
};

export const renameProductionCharacter = (project = {}, characterId = "", nextName = "") => {
  const name = String(nextName || "").normalize("NFKC").trim();
  if (!name || !characterId) return project;
  return {
    ...project,
    characters: (Array.isArray(project.characters) ? project.characters : []).map((character) => {
      if (character.id !== characterId || character.name === name) return character;
      const previousName = String(character.name || "").normalize("NFKC").trim();
      const previousScriptName = getCharacterScriptName(character);
      const scriptAliases = normalizeCharacterAliases([
        ...(Array.isArray(character.scriptAliases) ? character.scriptAliases : []),
        previousName,
        previousScriptName
      ], name);
      const scriptName = previousScriptName === previousName
        ? inferCharacterScriptName({ name, scriptAliases })
        : previousScriptName;
      return {
        ...character,
        name,
        scriptName,
        scriptAliases
      };
    })
  };
};

export const renameProductionCharacterScriptName = (project = {}, characterId = "", nextScriptName = "") => {
  const scriptName = String(nextScriptName || "").normalize("NFKC").trim();
  if (!scriptName || !characterId) return project;
  return {
    ...project,
    characters: (Array.isArray(project.characters) ? project.characters : []).map((character) => {
      if (character.id !== characterId || getCharacterScriptName(character) === scriptName) return character;
      const previousScriptName = getCharacterScriptName(character);
      return {
        ...character,
        scriptName,
        scriptAliases: normalizeCharacterAliases([
          ...(Array.isArray(character.scriptAliases) ? character.scriptAliases : []),
          previousScriptName
        ], character.name)
      };
    })
  };
};

export const normalizeLinePerformanceType = (value = "", speaker = "") => {
  const explicit = String(value || "").normalize("NFKC").trim();
  if (LINE_PERFORMANCE_TYPES.includes(explicit)) return explicit;
  const source = `${explicit} ${String(speaker || "")}`.normalize("NFKC");
  if (/心の声/.test(source)) return "心の声";
  if (/(?:イヤモニ|イヤーモニター)/.test(source)) return "イヤモニ";
  if (/(?:ナレーター|ナレーション|語り)/.test(source)) return "ナレーション";
  return "通常";
};

export const getCanonicalCharacterName = (value = "", availableNames = []) => {
  const name = String(value || "").normalize("NFKC").trim();
  const token = normalizeCharacterAliasToken(name);
  const availableByToken = new Map(
    (availableNames || [])
      .map((availableName) => [normalizeCharacterAliasToken(availableName), String(availableName || "").normalize("NFKC").trim()])
      .filter(([availableToken]) => availableToken)
  );
  for (const suffix of CHARACTER_ALIAS_SUFFIXES) {
    const suffixToken = normalizeCharacterAliasToken(suffix);
    if (!token.endsWith(suffixToken) || token.length <= suffixToken.length) continue;
    const baseName = availableByToken.get(token.slice(0, -suffixToken.length));
    if (baseName) return baseName;
  }
  const explicitTarget = CHARACTER_ALIAS_TARGETS.get(token);
  if (explicitTarget) return explicitTarget;
  if (token === "心の声") {
    const velName = availableByToken.get(normalizeCharacterAliasToken("ヴェル"));
    if (velName) return velName;
  }
  return name;
};

const normalizeCharacterColor = (value = "") => {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
};

const hslToHex = (hue, saturation, lightness) => {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs((2 * l) - 1)) * s;
  const segment = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const channels = segment < 1 ? [chroma, x, 0]
    : segment < 2 ? [x, chroma, 0]
      : segment < 3 ? [0, chroma, x]
        : segment < 4 ? [0, x, chroma]
          : segment < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = l - (chroma / 2);
  return `#${channels.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
};

const findUnusedCharacterColor = (usedColors, preferredIndex = 0) => {
  for (let offset = 0; offset < CHARACTER_COLORS.length; offset += 1) {
    const color = CHARACTER_COLORS[(preferredIndex + offset) % CHARACTER_COLORS.length];
    if (!usedColors.has(color)) return color;
  }
  for (let index = 0; index < 360; index += 1) {
    const color = hslToHex((index * 137.508) + 11, 62 + ((index % 3) * 5), 38 + ((index % 4) * 4));
    if (!usedColors.has(color)) return color;
  }
  return "#334155";
};

export const ensureUniqueCharacterColors = (characters = []) => {
  const usedColors = new Set();
  return (Array.isArray(characters) ? characters : []).map((character, index) => {
    const requestedColor = normalizeCharacterColor(character.color);
    const color = requestedColor && !usedColors.has(requestedColor)
      ? requestedColor
      : findUnusedCharacterColor(usedColors, index);
    usedColors.add(color);
    return { ...character, color };
  });
};
export const MAX_SCRIPT_SNAPSHOTS = 8;
export const MAX_SCRIPT_SNAPSHOT_BYTES = 4 * 1024 * 1024;

export const normalizeImagePosition = (value, fallback = 50) => {
  const position = Number(value);
  return Number.isFinite(position) ? Math.min(100, Math.max(0, position)) : fallback;
};

export const normalizeImageScale = (value, fallback = 1.12) => {
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.min(2.4, Math.max(1, scale)) : fallback;
};

export const getCharacterImageCropStyle = (character = {}) => {
  const positionX = normalizeImagePosition(character.imagePositionX);
  const positionY = normalizeImagePosition(character.imagePositionY);
  const scale = normalizeImageScale(character.imageScale);
  const overflow = (scale - 1) * 100;
  const percentage = (value) => `${Number(value.toFixed(4))}%`;
  return {
    width: percentage(scale * 100),
    height: percentage(scale * 100),
    left: percentage(-(overflow * positionX / 100)),
    top: percentage(-(overflow * positionY / 100)),
    objectPosition: `${positionX}% ${positionY}%`
  };
};

const createLocalId = (prefix) => {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const mergeCharacterProfile = (profileValue = "", backgroundValue = "") => {
  const profile = String(profileValue || "").trim();
  const background = String(backgroundValue || "").trim();
  if (!background || profile.includes(background)) return profile;
  if (!profile || background.includes(profile)) return background;
  return profile ? `${profile}\n\n${background}` : background;
};

const cloneScriptCharacters = (characters = []) => (Array.isArray(characters) ? characters : [])
  .filter((character) => character && typeof character === "object")
  .map((character, index) => ({
    id: String(character.id || createLocalId("character")),
    name: String(character.name || `登場人物${index + 1}`).trim(),
    scriptName: getCharacterScriptName(character) || String(character.name || `登場人物${index + 1}`).trim(),
    scriptAliases: normalizeCharacterAliases(character.scriptAliases, character.name),
    color: String(character.color || CHARACTER_COLORS[index % CHARACTER_COLORS.length]),
    imageUrl: String(character.imageUrl || ""),
    imagePositionX: normalizeImagePosition(character.imagePositionX),
    imagePositionY: normalizeImagePosition(character.imagePositionY),
    imageScale: normalizeImageScale(character.imageScale),
    profile: mergeCharacterProfile(character.profile || character.setting, character.background || character.backstory),
    background: "",
    recordingFolderUrl: String(character.recordingFolderUrl || character.driveFolderUrl || ""),
    openChatUrl: String(character.openChatUrl || character.lineOpenChatUrl || "")
  }));

const cloneScriptLines = (lines = []) => (Array.isArray(lines) ? lines : [])
  .filter((line) => line && typeof line === "object")
  .map((line, index) => ({
    id: String(line.id || createLocalId("line")),
    chapterId: String(line.chapterId || ""),
    chapterTitle: String(line.chapterTitle || line.chapter || "第一章"),
    sceneId: String(line.sceneId || ""),
    sceneTitle: String(line.sceneTitle || line.scene || "Scene 1"),
    order: Number.isFinite(Number(line.order)) ? Number(line.order) : index + 1,
    characterId: String(line.characterId || ""),
    kind: line.kind === "direction" ? "direction" : "dialogue",
    performanceType: normalizeLinePerformanceType(line.performanceType),
    manualBody: Boolean(line.manualBody),
    text: String(line.text || line.line || ""),
    direction: String(line.direction || line.note || ""),
    fileName: String(line.fileName || ""),
    actorStatus: normalizeStatus(line.actorStatus, ACTOR_RECORDING_STATUSES, "未収録"),
    reviewStatus: normalizeStatus(line.reviewStatus, DIRECTOR_REVIEW_STATUSES, "未確認"),
    recordingUrl: String(line.recordingUrl || ""),
    recordingFileName: String(line.recordingFileName || ""),
    actorNote: String(line.actorNote || ""),
    directorNote: String(line.directorNote || ""),
    updatedAt: String(line.updatedAt || "")
  }));

const normalizeScriptSnapshot = (snapshot = {}, index = 0) => ({
  id: String(snapshot.id || `script_snapshot_${index + 1}`),
  label: String(snapshot.label || snapshot.scriptVersion || `保存版 ${index + 1}`),
  reason: String(snapshot.reason || "手動保存"),
  createdAt: String(snapshot.createdAt || new Date().toISOString()),
  scriptVersion: String(snapshot.scriptVersion || "初稿"),
  sourceScriptText: String(snapshot.sourceScriptText || ""),
  characters: cloneScriptCharacters(snapshot.characters),
  lines: cloneScriptLines(snapshot.lines)
});

const compactScriptSnapshots = (snapshots = []) => {
  const compacted = [];
  let totalBytes = 0;
  for (const [index, rawSnapshot] of (Array.isArray(snapshots) ? snapshots : []).slice(0, MAX_SCRIPT_SNAPSHOTS).entries()) {
    const snapshot = normalizeScriptSnapshot(rawSnapshot, index);
    const snapshotBytes = JSON.stringify(snapshot).length;
    if (compacted.length && totalBytes + snapshotBytes > MAX_SCRIPT_SNAPSHOT_BYTES) continue;
    compacted.push(snapshot);
    totalBytes += snapshotBytes;
  }
  return compacted;
};

export const createScriptSnapshot = (project = {}, {
  label = "",
  reason = "手動保存",
  createdAt = new Date().toISOString()
} = {}) => ({
  id: createLocalId("script_snapshot"),
  label: String(label || project.scriptVersion || "保存版"),
  reason: String(reason || "手動保存"),
  createdAt,
  scriptVersion: String(project.scriptVersion || "初稿"),
  sourceScriptText: String(project.sourceScriptText || ""),
  characters: cloneScriptCharacters(project.characters),
  lines: cloneScriptLines(project.lines)
});

export const archiveScriptVersion = (project = {}, options = {}) => ({
  ...project,
  scriptSnapshots: compactScriptSnapshots([
    createScriptSnapshot(project, options),
    ...(Array.isArray(project.scriptSnapshots) ? project.scriptSnapshots : [])
  ])
});

export const getShareableRecordingProject = (project = {}) => {
  const sharedProject = { ...project };
  delete sharedProject.scriptSnapshots;
  delete sharedProject.sourceScriptText;
  return sharedProject;
};

export const createRecordingAccessKey = () => {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

const makeRubyPattern = () => new RegExp(RUBY_SOURCE, "g");

export const parseRubyText = (value = "") => {
  const source = String(value || "");
  const pattern = makeRubyPattern();
  const segments = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) segments.push({ type: "text", text: source.slice(cursor, match.index) });
    segments.push({
      type: "ruby",
      base: match[1] || match[3] || "",
      reading: match[2] || match[4] || ""
    });
    cursor = pattern.lastIndex;
  }
  if (cursor < source.length) segments.push({ type: "text", text: source.slice(cursor) });
  return segments.length ? segments : [{ type: "text", text: source }];
};

export const hasRubyNotation = (value = "") => makeRubyPattern().test(String(value || ""));

export const stripRubyNotation = (value = "") =>
  String(value || "").replace(makeRubyPattern(), (_, baseA, readingA, baseB) => baseA || baseB || "");

export const addRubyNotation = (value = "", base = "", reading = "") => {
  const source = String(value || "");
  const target = String(base || "").trim();
  const rubyReading = String(reading || "").trim();
  if (!target || !rubyReading) {
    return { ok: false, text: source, message: "ルビを付ける文字と読みを入力してください。" };
  }

  const pattern = makeRubyPattern();
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    const plain = source.slice(cursor, match.index);
    const plainIndex = plain.indexOf(target);
    if (plainIndex >= 0) {
      const absoluteIndex = cursor + plainIndex;
      return {
        ok: true,
        text: `${source.slice(0, absoluteIndex)}｜${target}《${rubyReading}》${source.slice(absoluteIndex + target.length)}`,
        message: `「${target}」にルビを付けました。`
      };
    }
    cursor = pattern.lastIndex;
  }

  const tailIndex = source.slice(cursor).indexOf(target);
  if (tailIndex >= 0) {
    const absoluteIndex = cursor + tailIndex;
    return {
      ok: true,
      text: `${source.slice(0, absoluteIndex)}｜${target}《${rubyReading}》${source.slice(absoluteIndex + target.length)}`,
      message: `「${target}」にルビを付けました。`
    };
  }

  return { ok: false, text: source, message: `セリフ内に「${target}」が見つかりません。` };
};

export const createRecordingProject = ({ episodeId = "", title = "新しい収録プロジェクト" } = {}) => ({
  id: createLocalId("recording"),
  episodeId,
  title,
  description: "",
  scriptVersion: "初稿",
  sourceScriptText: "",
  scriptSnapshots: [],
  status: "準備中",
  recordingDeadline: "",
  releaseDate: "",
  editingStatus: "未着手",
  characters: [],
  castMembers: [],
  lines: [],
  materials: [],
  questions: [],
  scheduleItems: [],
  announcements: [],
  sharedLinks: [],
  recordingFolderOrder: [],
  sharedAt: "",
  updatedAt: new Date().toISOString()
});

export const sampleRecordingProjects = [
  {
    id: "recording_sample_001",
    episodeId: "audition_voice_drama_001",
    title: "サンプル収録台本",
    description: "登場人物を選ぶと、担当セリフや掛け合いだけに絞り込めます。",
    scriptVersion: "初稿",
    sourceScriptText: "",
    scriptSnapshots: [],
    status: "収録準備中",
    characters: [
      {
        id: "character_vel",
        name: "ヴェル",
        color: "#168b9a",
        imageUrl: "",
        profile: "静かな決意を内側に秘めた主人公。強がりすぎず、相手へのやさしさが声に残る人物。\n\n大切な人を守るため、雨の街を離れる決意をした。",
        background: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      },
      {
        id: "character_amamori",
        name: "アマモリ",
        color: "#d65285",
        imageUrl: "",
        profile: "ヴェルの決意を心配しながらも、最後には背中を押す相棒。\n\nヴェルとは幼い頃から雨の街で過ごしてきた。",
        background: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      },
      {
        id: "character_narration",
        name: "ナレーション",
        color: "#5f6d7a",
        imageUrl: "",
        profile: "場面の温度と余韻を伝える語り手。",
        background: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      }
    ],
    castMembers: [
      {
        id: "cast_vel",
        actorName: "ヴェル役 声優さん",
        contact: "",
        socialUrl: "",
        characterIds: ["character_vel"],
        accessKey: ""
      },
      {
        id: "cast_amamori",
        actorName: "アマモリ役 声優さん",
        contact: "",
        socialUrl: "",
        characterIds: ["character_amamori"],
        accessKey: ""
      }
    ],
    lines: [
      {
        id: "line_sample_001",
        chapterId: "chapter_01",
        chapterTitle: "第一章",
        sceneId: "chapter_01_scene_01",
        sceneTitle: "Scene 01 雨上がり",
        order: 1,
        characterId: "character_narration",
        text: "雨音が少しずつ遠ざかっていく。",
        direction: "静かに。場面の余韻を残す。",
        fileName: "S01_001_NARRATION",
        actorStatus: "未収録",
        reviewStatus: "未確認",
        recordingUrl: "",
        recordingFileName: "",
        actorNote: "",
        directorNote: "",
        updatedAt: ""
      },
      {
        id: "line_sample_002",
        chapterId: "chapter_01",
        chapterTitle: "第一章",
        sceneId: "chapter_01_scene_01",
        sceneTitle: "Scene 01 雨上がり",
        order: 2,
        characterId: "character_amamori",
        text: "本当に行くつもりなの？",
        direction: "心配を隠そうとしている。",
        fileName: "S01_002_AMAMORI",
        actorStatus: "収録済み",
        reviewStatus: "未確認",
        recordingUrl: "",
        recordingFileName: "",
        actorNote: "",
        directorNote: "",
        updatedAt: ""
      },
      {
        id: "line_sample_003",
        chapterId: "chapter_01",
        chapterTitle: "第一章",
        sceneId: "chapter_01_scene_01",
        sceneTitle: "Scene 01 雨上がり",
        order: 3,
        characterId: "character_vel",
        text: "うん。もう｜決めた《きめた》んだ。",
        direction: "強がらず、静かな決意で。",
        fileName: "S01_003_VEL",
        actorStatus: "収録済み",
        reviewStatus: "リテイク",
        recordingUrl: "",
        recordingFileName: "",
        actorNote: "一度目を提出しました。",
        directorNote: "もう少し小さな声で、覚悟を内側に抑えてください。",
        updatedAt: ""
      },
      {
        id: "line_sample_004",
        chapterId: "chapter_01",
        chapterTitle: "第一章",
        sceneId: "chapter_01_scene_01",
        sceneTitle: "Scene 01 雨上がり",
        order: 4,
        characterId: "character_amamori",
        text: "そっか……。",
        direction: "短い間を置いて、受け入れる。",
        fileName: "S01_004_AMAMORI",
        actorStatus: "未収録",
        reviewStatus: "未確認",
        recordingUrl: "",
        recordingFileName: "",
        actorNote: "",
        directorNote: "",
        updatedAt: ""
      },
      {
        id: "line_sample_005",
        chapterId: "chapter_02",
        chapterTitle: "第二章",
        sceneId: "chapter_02_scene_01",
        sceneTitle: "Scene 01 出発",
        order: 5,
        characterId: "character_vel",
        text: "心配しなくても大丈夫。",
        direction: "相手を安心させる柔らかさ。",
        fileName: "S02_001_VEL",
        actorStatus: "未収録",
        reviewStatus: "未確認",
        recordingUrl: "",
        recordingFileName: "",
        actorNote: "",
        directorNote: "",
        updatedAt: ""
      }
    ],
    recordingDeadline: "2026-08-31",
    releaseDate: "2026-10-01",
    editingStatus: "脚本・配役調整中",
    materials: [
      {
        id: "material_theme_sample",
        category: "主題歌",
        title: "主題歌 デモ音源",
        url: "",
        fileName: "",
        aspectRatio: "",
        status: "制作中",
        notes: "歌詞と仮ミックスの確認用。",
        updatedAt: ""
      },
      {
        id: "material_thumbnail_sample",
        category: "サムネイル",
        title: "告知用サムネイル",
        url: "",
        fileName: "",
        aspectRatio: "16:9",
        status: "準備中",
        notes: "YouTube公開用。",
        updatedAt: ""
      }
    ],
    questions: [
      {
        id: "question_sample_001",
        lineId: "line_sample_003",
        characterId: "character_vel",
        authorName: "ヴェル役 声優さん",
        body: "「決めた」の部分は、迷いを残す演技にした方がよいでしょうか？",
        answer: "",
        status: "未回答",
        createdAt: "2026-07-25T09:00:00.000Z",
        updatedAt: "2026-07-25T09:00:00.000Z"
      }
    ],
    scheduleItems: [
      {
        id: "schedule_sample_001",
        type: "収録締切",
        title: "第一章の初回収録",
        date: "2026-08-15",
        status: "予定",
        notes: "担当セリフを一度提出してください。"
      },
      {
        id: "schedule_sample_002",
        type: "編集",
        title: "音声編集・リテイク確認",
        date: "2026-09-15",
        status: "予定",
        notes: "収録済み音源をまとめて確認します。"
      }
    ],
    announcements: [
      {
        id: "announcement_sample_001",
        title: "第一章の収録準備を進めています",
        body: "担当セリフと演技指示を確認し、分からない箇所は質問ページから送ってください。",
        priority: "通常",
        publishedAt: "2026-07-25T09:00:00.000Z"
      }
    ],
    sharedAt: "",
    updatedAt: ""
  }
];

function normalizeStatus(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

const makeStableScopeId = (prefix, value) => {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
};

export const normalizeRecordingProject = (project = {}, index = 0) => {
  const rawLines = Array.isArray(project.lines) ? project.lines : [];
  const rawCharacters = Array.isArray(project.characters) ? project.characters : [];
  const normalizedCharacters = rawCharacters.map((character, characterIndex) => {
    const name = String(character.name || `登場人物${characterIndex + 1}`).trim();
    const scriptAliases = normalizeCharacterAliases(character.scriptAliases, name);
    const normalized = {
      id: character.id || createLocalId("character"),
      name,
      scriptName: getCharacterScriptName({ ...character, name, scriptAliases }),
      scriptAliases,
      color: character.color || CHARACTER_COLORS[characterIndex % CHARACTER_COLORS.length],
      imageUrl: String(character.imageUrl || ""),
      imagePositionX: normalizeImagePosition(character.imagePositionX),
      imagePositionY: normalizeImagePosition(character.imagePositionY),
      imageScale: normalizeImageScale(character.imageScale),
      profile: mergeCharacterProfile(character.profile || character.setting, character.background || character.backstory),
      background: "",
      recordingFolderUrl: String(character.recordingFolderUrl || character.driveFolderUrl || ""),
      openChatUrl: String(character.openChatUrl || character.lineOpenChatUrl || "")
    };
    return normalized;
  });
  const originalCharacterNameById = new Map(normalizedCharacters.map((character) => [character.id, character.name]));
  const structuralCharacterIds = new Set(
    normalizedCharacters
      .filter((character) => isScriptStructureLabel(character.name))
      .map((character) => character.id)
  );
  const characterCandidates = normalizedCharacters.filter((character) => !structuralCharacterIds.has(character.id));
  const availableCharacterNames = [
    ...characterCandidates.flatMap(getCharacterKnownNames),
    ...rawLines.map((line) => String(line.character || line.speaker || "").trim()).filter(Boolean)
  ];
  const characterGroups = new Map();
  characterCandidates.forEach((character) => {
    const canonicalScriptName = getCanonicalCharacterName(getCharacterScriptName(character), availableCharacterNames);
    const canonicalKey = normalizeCharacterNameKey(canonicalScriptName);
    if (!characterGroups.has(canonicalKey)) characterGroups.set(canonicalKey, { canonicalScriptName, canonicalKey, members: [] });
    characterGroups.get(canonicalKey).members.push(character);
  });

  const characterIdAliases = new Map();
  const characterTargetIdByName = new Map();
  let characters = [...characterGroups.values()].map((group) => {
    const target = group.members.find((character) =>
      normalizeCharacterNameKey(getCharacterScriptName(character)) === group.canonicalKey &&
      normalizeCharacterNameKey(character.name) !== group.canonicalKey
    ) || group.members.find((character) => normalizeCharacterNameKey(character.name) === group.canonicalKey) || group.members[0];
    const firstValue = (key) => group.members.find((character) => String(character[key] || "").trim())?.[key] || "";
    const imageSource = target.imageUrl ? target : group.members.find((character) => character.imageUrl) || target;
    const scriptAliases = normalizeCharacterAliases(
      group.members.flatMap((character) => [character.name, ...(character.scriptAliases || [])]),
      target.name
    );
    const merged = {
      ...target,
      name: target.name,
      scriptName: group.canonicalScriptName || getCharacterScriptName(target),
      scriptAliases,
      imageUrl: imageSource.imageUrl,
      imagePositionX: imageSource.imagePositionX,
      imagePositionY: imageSource.imagePositionY,
      imageScale: imageSource.imageScale,
      profile: target.profile || firstValue("profile"),
      background: "",
      recordingFolderUrl: target.recordingFolderUrl || firstValue("recordingFolderUrl"),
      openChatUrl: target.openChatUrl || firstValue("openChatUrl")
    };
    group.targetId = merged.id;
    characterTargetIdByName.set(group.canonicalKey, merged.id);
    group.members.forEach((character) => {
      characterIdAliases.set(character.id, merged.id);
      getCharacterKnownNames(character).forEach((knownName) => {
        characterTargetIdByName.set(normalizeCharacterNameKey(knownName), merged.id);
      });
    });
    getCharacterKnownNames(merged).forEach((knownName) => {
      characterTargetIdByName.set(normalizeCharacterNameKey(knownName), merged.id);
    });
    return merged;
  });

  rawLines.forEach((line) => {
    const speakerName = String(line.character || line.speaker || "").trim();
    const canonicalSpeakerName = getCanonicalCharacterName(speakerName, availableCharacterNames);
    const speakerKey = normalizeCharacterNameKey(canonicalSpeakerName);
    if (!line.characterId && speakerName && !isScriptStructureLabel(speakerName) && !characterTargetIdByName.has(speakerKey)) {
      const character = {
        id: createLocalId("character"),
        name: canonicalSpeakerName,
        scriptName: canonicalSpeakerName,
        scriptAliases: [],
        color: CHARACTER_COLORS[characters.length % CHARACTER_COLORS.length],
        imageUrl: "",
        imagePositionX: 50,
        imagePositionY: 50,
        imageScale: 1.12,
        profile: "",
        background: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      };
      characters.push(character);
      characterIdAliases.set(character.id, character.id);
      characterTargetIdByName.set(speakerKey, character.id);
      characterTargetIdByName.set(normalizeCharacterNameKey(speakerName), character.id);
    }
  });

  characters = ensureUniqueCharacterColors(characters);
  const characterIds = new Set(characters.map((character) => character.id));
  const configuredRecordingFolderOrder = [...new Set(
    (Array.isArray(project.recordingFolderOrder) ? project.recordingFolderOrder : [])
      .map((id) => characterIdAliases.get(id) || String(id || ""))
      .filter((id) => characterIds.has(id))
  )];
  const recordingFolderOrder = [
    ...configuredRecordingFolderOrder,
    ...characters.map((character) => character.id).filter((id) => !configuredRecordingFolderOrder.includes(id))
  ];
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const characterByName = new Map(
    [...characterTargetIdByName.entries()]
      .map(([name, characterId]) => [name, characterById.get(characterId)])
      .filter((entry) => entry[1])
  );
  const fallbackCharacter = characters[0];
  const chapterByTitle = new Map();
  const chapterIdOwners = new Map();
  const sceneByScope = new Map();
  const sceneIdOwners = new Map();
  const lines = rawLines.map((line, lineIndex) => {
    const speakerName = String(line.character || line.speaker || "").trim();
    const originalSpeakerName = speakerName || originalCharacterNameById.get(line.characterId) || "";
    const structuralSpeaker = structuralCharacterIds.has(line.characterId) || isScriptStructureLabel(speakerName);
    const canonicalSpeakerName = getCanonicalCharacterName(speakerName, availableCharacterNames);
    const matchedCharacter = characterByName.get(normalizeCharacterNameKey(canonicalSpeakerName));
    const remappedCharacterId = characterIdAliases.get(line.characterId) || line.characterId;
    const characterId = !structuralSpeaker && characterIds.has(remappedCharacterId)
      ? remappedCharacterId
      : matchedCharacter?.id || fallbackCharacter?.id || "";
    const rawSceneTitle = String(line.sceneTitle || line.scene || `Scene ${line.sceneNo || 1}`).trim();
    const legacyChapterHeading = !line.chapterTitle && !line.chapter && isChapterHeading(rawSceneTitle);
    const chapterTitle = String(line.chapterTitle || line.chapter || (legacyChapterHeading ? rawSceneTitle : "第一章")).trim() || "第一章";
    const chapterKey = getScriptChapterKey(chapterTitle);
    let chapterId = chapterByTitle.get(chapterKey);
    if (!chapterId) {
      const proposedChapterId = String(line.chapterId || "");
      const proposedOwner = proposedChapterId ? chapterIdOwners.get(proposedChapterId) : "";
      chapterId = proposedChapterId && (!proposedOwner || proposedOwner === chapterKey)
        ? proposedChapterId
        : makeStableScopeId("chapter", chapterKey);
      chapterByTitle.set(chapterKey, chapterId);
      chapterIdOwners.set(chapterId, chapterKey);
    }
    const sceneTitle = legacyChapterHeading ? "章の冒頭" : rawSceneTitle;
    const sceneKey = `${chapterId}\u0000${getScriptSceneKey(sceneTitle)}`;
    let sceneId = sceneByScope.get(sceneKey);
    if (!sceneId) {
      const proposedSceneId = String(line.sceneId || "");
      const proposedOwner = proposedSceneId ? sceneIdOwners.get(proposedSceneId) : "";
      sceneId = proposedSceneId && (!proposedOwner || proposedOwner === sceneKey)
        ? proposedSceneId
        : makeStableScopeId("scene", sceneKey);
      sceneByScope.set(sceneKey, sceneId);
      sceneIdOwners.set(sceneId, sceneKey);
    }
    return {
      id: line.id || createLocalId("line"),
      chapterId,
      chapterTitle,
      sceneId,
      sceneTitle,
      order: Number.isFinite(Number(line.order)) ? Number(line.order) : lineIndex + 1,
      characterId,
      kind: line.kind === "direction" || structuralSpeaker ? "direction" : "dialogue",
      performanceType: normalizeLinePerformanceType(line.performanceType, originalSpeakerName),
      manualBody: Boolean(line.manualBody),
      text: String(line.text || line.line || ""),
      direction: String(line.direction || line.note || ""),
      fileName: String(line.fileName || ""),
      actorStatus: normalizeStatus(line.actorStatus, ACTOR_RECORDING_STATUSES, "未収録"),
      reviewStatus: normalizeStatus(line.reviewStatus, DIRECTOR_REVIEW_STATUSES, "未確認"),
      recordingUrl: String(line.recordingUrl || ""),
      recordingFileName: String(line.recordingFileName || ""),
      actorNote: String(line.actorNote || ""),
      directorNote: String(line.directorNote || ""),
      updatedAt: String(line.updatedAt || "")
    };
  });
  const derivedLineProgress = Object.fromEntries(
    Object.entries(project.derivedLineProgress && typeof project.derivedLineProgress === "object"
      ? project.derivedLineProgress
      : {})
      .filter(([lineId, progress]) => lineId && progress && typeof progress === "object")
      .map(([lineId, progress]) => [lineId, {
        id: lineId,
        sourceLineId: String(progress.sourceLineId || ""),
        characterId: characterIdAliases.get(progress.characterId) || String(progress.characterId || ""),
        chapterId: String(progress.chapterId || ""),
        sceneId: String(progress.sceneId || ""),
        performanceType: normalizeLinePerformanceType(progress.performanceType),
        actorStatus: normalizeStatus(progress.actorStatus, ACTOR_RECORDING_STATUSES, "未収録"),
        reviewStatus: normalizeStatus(progress.reviewStatus, DIRECTOR_REVIEW_STATUSES, "未確認"),
        recordingUrl: String(progress.recordingUrl || ""),
        recordingFileName: String(progress.recordingFileName || ""),
        actorNote: String(progress.actorNote || ""),
        directorNote: String(progress.directorNote || ""),
        updatedAt: String(progress.updatedAt || "")
      }])
  );

  return {
    id: project.id || `recording_project_${index + 1}`,
    episodeId: project.episodeId || "",
    title: project.title || `収録プロジェクト${index + 1}`,
    description: project.description || "",
    scriptVersion: project.scriptVersion || "初稿",
    sourceScriptText: String(project.sourceScriptText || ""),
    scriptSnapshots: compactScriptSnapshots(project.scriptSnapshots),
    status: project.status || "準備中",
    recordingDeadline: String(project.recordingDeadline || ""),
    releaseDate: String(project.releaseDate || ""),
    editingStatus: String(project.editingStatus || "未着手"),
    characters,
    recordingFolderOrder,
    castMembers: (Array.isArray(project.castMembers) ? project.castMembers : []).map((member, memberIndex) => ({
      id: member.id || createLocalId("cast"),
      actorName: member.actorName || `声優さん${memberIndex + 1}`,
      contact: member.contact || "",
      socialUrl: String(member.socialUrl || member.snsUrl || member.socialMediaUrl || ""),
      characterIds: [...new Set(
        (Array.isArray(member.characterIds) ? member.characterIds : [])
          .map((id) => characterIdAliases.get(id) || id)
          .filter((id) => characterIds.has(id))
      )],
      wpUserId: Number.isFinite(Number(member.wpUserId)) ? Number(member.wpUserId) : 0,
      accessKey: member.accessKey || createRecordingAccessKey()
    })),
    lines: lines.sort((a, b) => Number(a.order) - Number(b.order)),
    derivedLineProgress,
    materials: (Array.isArray(project.materials) ? project.materials : []).map((material, materialIndex) => ({
      id: material.id || createLocalId("material"),
      category: PRODUCTION_MATERIAL_CATEGORIES.includes(material.category) ? material.category : "BGM",
      title: String(material.title || `素材${materialIndex + 1}`),
      url: String(material.url || material.sourceUrl || ""),
      fileName: String(material.fileName || ""),
      aspectRatio: String(material.aspectRatio || ""),
      status: PRODUCTION_MATERIAL_STATUSES.includes(material.status) ? material.status : "準備中",
      notes: String(material.notes || ""),
      updatedAt: String(material.updatedAt || "")
    })),
    questions: (Array.isArray(project.questions) ? project.questions : []).map((question) => ({
      id: question.id || createLocalId("question"),
      lineId: String(question.lineId || ""),
      characterId: characterIds.has(characterIdAliases.get(question.characterId) || question.characterId)
        ? characterIdAliases.get(question.characterId) || question.characterId
        : "",
      authorName: String(question.authorName || "メンバー"),
      wpUserId: Number.isFinite(Number(question.wpUserId)) ? Number(question.wpUserId) : 0,
      body: String(question.body || question.question || ""),
      answer: String(question.answer || ""),
      status: PRODUCTION_QUESTION_STATUSES.includes(question.status) ? question.status : "未回答",
      createdAt: String(question.createdAt || new Date().toISOString()),
      updatedAt: String(question.updatedAt || question.createdAt || "")
    })),
    scheduleItems: (Array.isArray(project.scheduleItems) ? project.scheduleItems : []).map((item, itemIndex) => ({
      id: item.id || createLocalId("schedule"),
      type: PRODUCTION_SCHEDULE_TYPES.includes(item.type) ? item.type : "その他",
      title: String(item.title || `予定${itemIndex + 1}`),
      date: String(item.date || ""),
      status: PRODUCTION_SCHEDULE_STATUSES.includes(item.status) ? item.status : "予定",
      notes: String(item.notes || "")
    })),
    announcements: (Array.isArray(project.announcements) ? project.announcements : []).map((announcement, announcementIndex) => ({
      id: announcement.id || createLocalId("announcement"),
      title: String(announcement.title || `お知らせ${announcementIndex + 1}`),
      body: String(announcement.body || ""),
      priority: announcement.priority === "重要" ? "重要" : "通常",
      publishedAt: String(announcement.publishedAt || new Date().toISOString())
    })),
    sharedLinks: (Array.isArray(project.sharedLinks) ? project.sharedLinks : []).map((link, linkIndex) => ({
      id: link.id || createLocalId("shared_link"),
      title: String(link.title || link.label || `共有URL ${linkIndex + 1}`),
      url: String(link.url || ""),
      notes: String(link.notes || link.description || ""),
      color: normalizeSharedLinkColor(link.color) || SHARED_LINK_COLORS[linkIndex % SHARED_LINK_COLORS.length]
    })),
    sharedAt: project.sharedAt || "",
    updatedAt: project.updatedAt || ""
  };
};

export const normalizeRecordingProjects = (projects) =>
  (Array.isArray(projects) ? projects : sampleRecordingProjects).map(normalizeRecordingProject);

export const restoreScriptSnapshot = (project = {}, snapshotId = "") => {
  const snapshots = Array.isArray(project.scriptSnapshots) ? project.scriptSnapshots : [];
  const snapshot = snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) return normalizeRecordingProject(project);
  const archived = archiveScriptVersion(project, {
    label: `${project.scriptVersion || "現在版"}（復元前）`,
    reason: `「${snapshot.label || snapshot.scriptVersion || "保存版"}」を復元する直前`
  });
  const currentCharacters = Array.isArray(project.characters) ? project.characters : [];
  const currentCharacterById = new Map(currentCharacters.map((character) => [character.id, character]));
  const restoredCharacterIds = new Set(snapshot.characters.map((character) => character.id));
  const restoredCharacters = [
    ...snapshot.characters.map((character) => ({
      ...character,
      ...(currentCharacterById.get(character.id) || {})
    })),
    ...currentCharacters.filter((character) => !restoredCharacterIds.has(character.id))
  ];
  return normalizeRecordingProject({
    ...archived,
    scriptVersion: snapshot.scriptVersion,
    sourceScriptText: snapshot.sourceScriptText,
    characters: restoredCharacters,
    lines: snapshot.lines
  });
};

export const mergeRemoteRecordingProject = (localProject, remoteProject) => {
  const remoteLines = new Map((remoteProject?.lines || []).map((line) => [line.id, line]));
  return normalizeRecordingProject({
    ...localProject,
    sharedAt: remoteProject?.sharedAt || localProject.sharedAt,
    updatedAt: remoteProject?.updatedAt || localProject.updatedAt,
    derivedLineProgress: {
      ...(localProject.derivedLineProgress || {}),
      ...(remoteProject?.derivedLineProgress || {})
    },
    lines: (localProject.lines || []).map((line) => {
      const remote = remoteLines.get(line.id);
      if (!remote) return line;
      return {
        ...line,
        actorStatus: remote.actorStatus,
        reviewStatus: remote.reviewStatus,
        recordingUrl: remote.recordingUrl,
        recordingFileName: remote.recordingFileName,
        actorNote: remote.actorNote,
        directorNote: remote.directorNote,
        updatedAt: remote.updatedAt
      };
    })
  });
};

export const getCharacterName = (project, characterId) =>
  project?.characters?.find((character) => character.id === characterId)?.name || "話者未設定";

const normalizeScriptMatchValue = (value = "") =>
  stripRubyNotation(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ja");

export const getScriptLineMatchKey = ({ speaker = "", text = "", kind = "", sourceKind = "", performanceType = "" } = {}) => {
  const isDirection = kind === "direction" || sourceKind === "direction" || speaker === "ト書き";
  return [
    isDirection ? "direction" : "dialogue",
    normalizeScriptMatchValue(isDirection ? "ト書き" : speaker),
    isDirection ? "" : normalizeLinePerformanceType(performanceType, speaker),
    normalizeScriptMatchValue(text)
  ].join("\u0000");
};

const getScriptLineLocationMatchKey = (line = {}) => [
  normalizeScriptMatchValue(line.chapterTitle || "第一章"),
  normalizeScriptMatchValue(line.sceneTitle || "Scene 1"),
  getScriptLineMatchKey(line)
].join("\u0001");

export const getScriptImportPlan = (project, rows = []) => {
  const exactQueues = new Map();
  const looseQueues = new Map();
  (project?.lines || []).forEach((line) => {
    const candidate = {
      speaker: line.kind === "direction" ? "ト書き" : getCharacterName(project, line.characterId),
      text: line.text,
      kind: line.kind,
      performanceType: line.performanceType,
      chapterTitle: line.chapterTitle,
      sceneTitle: line.sceneTitle
    };
    const exactKey = getScriptLineLocationMatchKey(candidate);
    const looseKey = getScriptLineMatchKey(candidate);
    if (!exactQueues.has(exactKey)) exactQueues.set(exactKey, []);
    if (!looseQueues.has(looseKey)) looseQueues.set(looseKey, []);
    exactQueues.get(exactKey).push(line);
    looseQueues.get(looseKey).push(line);
  });

  const usedLineIds = new Set();
  const takeUnused = (queue = []) => {
    while (queue.length) {
      const candidate = queue.shift();
      if (!usedLineIds.has(candidate.id)) {
        usedLineIds.add(candidate.id);
        return candidate;
      }
    }
    return null;
  };
  const matches = rows.map((row) => takeUnused(exactQueues.get(getScriptLineLocationMatchKey(row))));
  rows.forEach((row, index) => {
    if (matches[index]) return;
    matches[index] = takeUnused(looseQueues.get(getScriptLineMatchKey(row)));
  });
  const retained = matches.filter(Boolean).length;

  return {
    matches,
    retained,
    added: rows.length - retained,
    removed: Math.max(0, (project?.lines?.length || 0) - retained)
  };
};

export const getRecordingProgress = (project) => {
  const lines = getRecordingDisplayProject(project).lines.filter((line) => line.kind !== "direction");
  const total = lines.length;
  const recorded = lines.filter((line) => line.actorStatus !== "未収録").length;
  const approved = lines.filter((line) => line.reviewStatus === "OK").length;
  const retakes = lines.filter((line) => line.reviewStatus === "リテイク").length;
  return {
    total,
    recorded,
    approved,
    retakes,
    recordedPercent: total ? Math.round((recorded / total) * 100) : 0,
    approvedPercent: total ? Math.round((approved / total) * 100) : 0
  };
};

export const getFilteredRecordingLines = ({
  project,
  selectedCharacterIds = [],
  mode = "assignment",
  includeContext = true,
  query = "",
  statusFilter = "すべて"
}) => {
  const lines = project?.lines || [];
  const selected = new Set(selectedCharacterIds);
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("ja");
  const matchingScenes = new Set();

  if (mode === "dialogue" && selected.size > 1) {
    const sceneCharacters = new Map();
    lines.forEach((line) => {
      if (line.kind === "direction") return;
      if (!sceneCharacters.has(line.sceneId)) sceneCharacters.set(line.sceneId, new Set());
      sceneCharacters.get(line.sceneId).add(line.characterId);
    });
    sceneCharacters.forEach((characters, sceneId) => {
      if ([...selected].every((id) => characters.has(id))) matchingScenes.add(sceneId);
    });
  }

  const directIndexes = new Set();
  lines.forEach((line, index) => {
    const isDirection = line.kind === "direction";
    const selectedMatch = selected.size === 0 || (!isDirection && selected.has(line.characterId));
    const dialogueMatch = mode !== "dialogue" || selected.size < 2 || matchingScenes.has(line.sceneId);
    const statusMatch =
      statusFilter === "すべて" ||
      (!isDirection && (line.actorStatus === statusFilter || line.reviewStatus === statusFilter));
    const haystack = `${line.chapterTitle} ${line.sceneTitle} ${getCharacterName(project, line.characterId)} ${line.performanceType || "通常"} ${line.text} ${line.direction} ${line.fileName}`.toLocaleLowerCase("ja");
    const queryMatch = !normalizedQuery || haystack.includes(normalizedQuery);
    if (selectedMatch && dialogueMatch && statusMatch && queryMatch) directIndexes.add(index);
  });

  const visibleIndexes = new Set(directIndexes);
  if (includeContext && selected.size > 0) {
    directIndexes.forEach((index) => {
      const previous = lines[index - 1];
      const next = lines[index + 1];
      if (previous && previous.sceneId === lines[index].sceneId) visibleIndexes.add(index - 1);
      if (next && next.sceneId === lines[index].sceneId) visibleIndexes.add(index + 1);
    });
  }

  return lines
    .map((line, index) => ({
      ...line,
      isContext: selected.size > 0 && !directIndexes.has(index)
    }))
    .filter((_, index) => visibleIndexes.has(index));
};

export const readRecordingShareReference = (hash = globalThis.location?.hash || "") => {
  const match = String(hash).match(/^#\/recording\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)(?:\?(.+))?$/);
  if (!match) return null;
  const params = new URLSearchParams(match[4] || "");
  return {
    projectId: decodeURIComponent(match[1]),
    memberId: decodeURIComponent(match[2]),
    accessKey: decodeURIComponent(match[3]),
    endpointUrl: params.get("endpoint") || "",
    driveFolderUrl: params.get("folder") || ""
  };
};

export const makeRecordingShareUrl = ({
  projectId,
  memberId,
  accessKey,
  endpointUrl = "",
  driveFolderUrl = ""
}) => {
  const base = `${globalThis.location?.origin || ""}${globalThis.location?.pathname || "/"}`;
  const params = new URLSearchParams();
  if (endpointUrl) params.set("endpoint", endpointUrl);
  if (driveFolderUrl) params.set("folder", driveFolderUrl);
  const query = params.toString();
  return `${base}#/recording/${encodeURIComponent(projectId)}/${encodeURIComponent(memberId)}/${encodeURIComponent(accessKey)}${query ? `?${query}` : ""}`;
};

const normalizeDocumentLine = (value = "") =>
  String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+$/g, "")
    .trim();

const headingText = (line = "") => normalizeDocumentLine(line).replace(/^#{1,6}\s*/, "");

const unwrapHeadingWrapper = (value = "") => {
  const text = headingText(value);
  const wrapped = text.match(/^[【\[]\s*([\s\S]*?)\s*[】\]]\s*(.*)$/);
  return wrapped ? `${wrapped[1]}${wrapped[2] ? ` ${wrapped[2]}` : ""}`.trim() : text;
};

const stripHeadingDecorations = (value = "") =>
  unwrapHeadingWrapper(value)
    .replace(/^(?:[■□◆◇●○〇◎▶▷►▸・＊*]+\s*)+/, "")
    .trim();

const CHAPTER_NUMBER_PATTERN = "[0-9０-９一二三四五六七八九十百千万〇零]+";
const CHAPTER_SPECIAL_PATTERN = "序章|終章|最終章|プロローグ|エピローグ|幕間";

const getChapterHeadingMatch = (line = "") => {
  const text = stripHeadingDecorations(line);
  const numeric = text.match(new RegExp(`^((?:第\\s*)?(${CHAPTER_NUMBER_PATTERN})\\s*章)(?=$|[\\s　:：\\-‐‑–—・「『（(【])`, "i"));
  if (numeric) return { text, raw: numeric[1], number: numeric[2], special: "", length: numeric[0].length };
  const western = text.match(new RegExp(`^((?:chapter|chap\\.?)\\s*(${CHAPTER_NUMBER_PATTERN}))(?=$|[\\s　:：\\-‐‑–—・「『（(【])`, "i"));
  if (western) return { text, raw: western[1], number: western[2], special: "", western: true, length: western[0].length };
  const special = text.match(new RegExp(`^(${CHAPTER_SPECIAL_PATTERN})(?=$|[\\s　:：\\-‐‑–—・「『（(【])`, "i"));
  return special ? { text, raw: special[1], number: "", special: special[1], length: special[0].length } : null;
};

const parseChapterNumber = (value = "") => {
  const text = String(value || "").normalize("NFKC").replace(/\s+/g, "");
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (![...text].every((character) => character in digits || "十百千万".includes(character))) return null;
  if (!/[十百千万]/.test(text)) return Number([...text].map((character) => digits[character]).join(""));
  const units = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let current = 0;
  [...text].forEach((character) => {
    if (character in digits) {
      current = digits[character];
      return;
    }
    const unit = units[character];
    if (unit === 10000) {
      total += (section + current || 1) * unit;
      section = 0;
      current = 0;
      return;
    }
    section += (current || 1) * unit;
    current = 0;
  });
  return total + section + current;
};

const normalizeScopeValue = (value = "") =>
  normalizeDocumentLine(value).normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("ja");

const isChapterHeading = (line = "") => Boolean(getChapterHeadingMatch(line));

const normalizeChapterHeading = (line = "") => {
  const match = getChapterHeadingMatch(line);
  if (!match) return stripHeadingDecorations(line) || "第一章";
  const numberText = String(match.number || "").normalize("NFKC").replace(/\s+/g, "");
  const base = match.special || (match.western ? `Chapter ${numberText}` : `第${numberText}章`);
  const suffix = match.text
    .slice(match.length)
    .replace(/^[\s　:：\-‐‑–—・]+/, "")
    .replace(/^[「『（(【]\s*|\s*[」』）)】]$/g, "")
    .trim();
  return suffix ? `${base} ${suffix}` : base;
};

export const getScriptChapterKey = (value = "") => {
  const match = getChapterHeadingMatch(value);
  if (!match) return `chapter:label:${normalizeScopeValue(stripHeadingDecorations(value) || "第一章")}`;
  if (match.special) return `chapter:special:${normalizeScopeValue(match.special)}`;
  const numeric = parseChapterNumber(match.number);
  return `chapter:number:${numeric ?? normalizeScopeValue(match.number)}`;
};

const isCastListHeading = (line = "") => {
  const text = stripHeadingDecorations(line);
  return /^(?:登場人物|キャスト|出演)(?:$|[\s　:：])/i.test(text);
};

const isDocumentMetadataLine = (line = "") => {
  const text = stripHeadingDecorations(line);
  return /^(?:ボイスドラマ\s*)?(?:脚本|台本|原稿)(?:全文)?(?:$|[\s　:：])/i.test(text) ||
    /^(?:作品名|タイトル|原作|原案|作者|監督|演出|出演|キャスト|登場人物)(?:$|[\s　:：])/i.test(text);
};

const isStandaloneDocumentTitleLine = (line = "") => {
  const text = normalizeDocumentLine(line);
  return text.length <= 160 && /^(?:『[^』]+』|「[^」]+」|【[^】]+】)$/.test(text);
};

const isScriptCueLine = (line = "") => {
  const text = stripHeadingDecorations(line).normalize("NFKC");
  return /^(?:SE|SFX|BGM|ME|M)(?:\s*\d+)?(?:$|[\s　:：\-‐‑–—])/i.test(text) ||
    /^(?:効果音|音楽|主題歌)(?:\s*\d+)?(?:$|[\s　:：\-‐‑–—])/i.test(text);
};

const isEpisodeHeading = (line = "") => {
  const text = stripHeadingDecorations(line);
  return new RegExp(`^第\\s*${CHAPTER_NUMBER_PATTERN}\\s*話(?:$|[\\s　:：\\-‐‑–—・「『（(【])`).test(text);
};

const isSceneHeading = (line = "") => {
  const text = headingText(line);
  const unwrapped = unwrapHeadingWrapper(text);
  if (isChapterHeading(text) || isScriptCueLine(text) || isDocumentMetadataLine(text)) return false;
  return (
    new RegExp(`^(?:scene|sc\\.?|シーン)\\s*${CHAPTER_NUMBER_PATTERN}(?:$|[\\s　:：\\-‐‑–—])`, "i").test(stripHeadingDecorations(unwrapped)) ||
    new RegExp(`^第\\s*${CHAPTER_NUMBER_PATTERN}\\s*(?:場|幕)(?:$|[\\s　:：\\-‐‑–—])`).test(stripHeadingDecorations(unwrapped)) ||
    /^[〇○●■◆◇]\s*\S+/.test(text)
  );
};

const normalizeSceneHeading = (line = "") => {
  const text = unwrapHeadingWrapper(line);
  const undecorated = stripHeadingDecorations(text);
  if (/^(?:scene|sc\.?|シーン)\s*/i.test(undecorated) || /^第\s*.+\s*(?:場|幕)/.test(undecorated)) return undecorated;
  return text;
};

export const getScriptSceneKey = (value = "") => {
  const text = stripHeadingDecorations(normalizeSceneHeading(value));
  const explicit = text.match(new RegExp(`^(?:scene|sc\\.?|シーン)\\s*(${CHAPTER_NUMBER_PATTERN})`, "i")) ||
    text.match(new RegExp(`^第\\s*(${CHAPTER_NUMBER_PATTERN})\\s*(?:場|幕)`));
  if (explicit) {
    const numeric = parseChapterNumber(explicit[1]);
    return `scene:number:${numeric ?? normalizeScopeValue(explicit[1])}`;
  }
  return `scene:label:${normalizeScopeValue(text || "Scene 1")}`;
};

const isChapterIntroScene = (value = "") =>
  normalizeScopeValue(value) === normalizeScopeValue("章の冒頭") || isChapterHeading(value);

const isLikelyLegacyCastIntroBlock = (lines = [], characterNames = new Set()) => {
  if (!lines.length || !characterNames.size) return false;
  const entries = lines.map((line) => normalizeDocumentLine(line.text));
  if (entries.some((text) => !text || text.length > 40 || /[。！？!?「」『』]/.test(text))) return false;

  const matchedEntries = entries.filter((text) => text
    .split(/[／/・、,，&＆]+/)
    .map((part) => normalizeScopeValue(stripHeadingDecorations(part)))
    .some((part) => characterNames.has(part)));
  return matchedEntries.length >= Math.max(1, Math.ceil(entries.length / 3));
};

export const getScriptHierarchyRepairPlan = (project = {}) => {
  const sourceLines = (Array.isArray(project.lines) ? project.lines : [])
    .map((line, index) => ({ line, index }))
    .sort((left, right) => (Number(left.line.order) || left.index) - (Number(right.line.order) || right.index));
  const chapterMarkers = new Set(
    sourceLines
      .filter(({ line }) => isChapterIntroScene(line.sceneTitle))
      .map(({ line }) => getScriptChapterKey(line.chapterTitle || "第一章"))
  );
  if (chapterMarkers.size < 2) {
    return { changed: 0, moved: 0, removed: 0, movedLineIds: [], removedLineIds: [], lines: sourceLines.map(({ line }) => line), chapters: chapterMarkers.size, scenes: 0 };
  }

  const firstChapterKey = getScriptChapterKey("第一章");
  const patches = new Map();
  const introLinesByChapter = new Map();
  let activeChapterTitle = "";
  let activeChapterKey = "";

  sourceLines.forEach(({ line }) => {
    const chapterTitle = String(line.chapterTitle || "第一章").trim() || "第一章";
    const chapterKey = getScriptChapterKey(chapterTitle);
    if (isChapterIntroScene(line.sceneTitle)) {
      activeChapterTitle = chapterTitle;
      activeChapterKey = chapterKey;
      if (!introLinesByChapter.has(chapterKey)) introLinesByChapter.set(chapterKey, []);
      introLinesByChapter.get(chapterKey).push(line);
      return;
    }
    if (activeChapterKey && activeChapterKey !== firstChapterKey && chapterKey === firstChapterKey) {
      patches.set(line.id, activeChapterTitle);
    }
  });

  const characterNames = new Set((project.characters || [])
    .flatMap(getCharacterKnownNames)
    .map((name) => normalizeScopeValue(name))
    .filter(Boolean));
  const removedLineIds = new Set();
  introLinesByChapter.forEach((lines) => {
    if (isLikelyLegacyCastIntroBlock(lines, characterNames)) {
      lines.forEach((line) => removedLineIds.add(line.id));
    }
  });

  const repairedLines = sourceLines
    .filter(({ line }) => !removedLineIds.has(line.id))
    .map(({ line }) => patches.has(line.id)
      ? { ...line, chapterTitle: patches.get(line.id) }
      : line);
  const changed = patches.size + removedLineIds.size;
  if (!changed) {
    const scenes = new Set(repairedLines.map((line) => `${getScriptChapterKey(line.chapterTitle)}\u0000${getScriptSceneKey(line.sceneTitle)}`));
    return { changed: 0, moved: 0, removed: 0, movedLineIds: [], removedLineIds: [], lines: repairedLines, chapters: chapterMarkers.size, scenes: scenes.size };
  }

  const normalized = normalizeRecordingProject({ ...project, lines: repairedLines });
  return {
    changed,
    moved: patches.size,
    removed: removedLineIds.size,
    movedLineIds: [...patches.keys()],
    removedLineIds: [...removedLineIds],
    lines: normalized.lines,
    chapters: new Set(normalized.lines.map((line) => line.chapterId)).size,
    scenes: new Set(normalized.lines.map((line) => line.sceneId)).size
  };
};

export const repairScriptHierarchy = (project = {}) => {
  const plan = getScriptHierarchyRepairPlan(project);
  if (!plan.changed) return normalizeRecordingProject(project);
  const archived = archiveScriptVersion(project, {
    label: `${project.scriptVersion || "現在版"}（構成修復前）`,
    reason: "第一章へまとまった章・シーン構成を修復する直前"
  });
  return normalizeRecordingProject({ ...archived, lines: plan.lines });
};

const cleanSpeakerLabel = (value = "") =>
  normalizeDocumentLine(value)
    .replace(/^[\-–—・●■◆◇]+\s*/, "")
    .replace(/^[【\[]|[】\]]$/g, "")
    .trim();

const normalizeCharacterNameKey = (value = "") => normalizeScopeValue(cleanSpeakerLabel(value));

export const isScriptStructureLabel = (value = "") => {
  const text = cleanSpeakerLabel(value);
  if (!text) return false;
  return text === "ト書き" || isChapterHeading(text) || isEpisodeHeading(text) || isSceneHeading(text) || isScriptCueLine(text) || isDocumentMetadataLine(text);
};

const isPlausibleSpeaker = (value = "") => {
  const speaker = cleanSpeakerLabel(value);
  return Boolean(speaker) &&
    speaker.length <= 24 &&
    !isScriptStructureLabel(speaker) &&
    !/^(?:※|注|備考|場面|場所|時刻|日時)(?:$|[\s　:：])/.test(speaker) &&
    !/[。！？!?、,「」『』：:\/\\]/.test(speaker);
};

const getParentheticalDirection = (line = "") => {
  const match = normalizeDocumentLine(line).match(/^[（(]([\s\S]+)[）)]$/);
  return match ? match[1].trim() : "";
};

const splitQuotedText = (value = "", openingQuote = "「") => {
  const closingQuote = openingQuote === "『" ? "』" : "」";
  const closeIndex = value.indexOf(closingQuote);
  if (closeIndex < 0) {
    return { text: value.trim(), direction: "", complete: false, closingQuote };
  }
  const suffix = value.slice(closeIndex + 1).trim();
  return {
    text: value.slice(0, closeIndex).trim(),
    direction: getParentheticalDirection(suffix) || suffix,
    complete: true,
    closingQuote
  };
};

const parseInlineDialogue = (line = "") => {
  const text = normalizeDocumentLine(line);
  const bracketMatch = text.match(/^【([^】]{1,30})】\s*(.*)$/);
  if (bracketMatch && isPlausibleSpeaker(bracketMatch[1])) {
    const speaker = cleanSpeakerLabel(bracketMatch[1]);
    const remainder = bracketMatch[2].trim();
    if (!remainder) return { speaker, pending: true };
    const quoteMatch = remainder.match(/^[「『]([\s\S]*)$/);
    if (quoteMatch) {
      const openingQuote = remainder[0];
      return { speaker, openingQuote, ...splitQuotedText(quoteMatch[1], openingQuote) };
    }
    return { speaker, text: remainder, direction: "", complete: true };
  }

  const tabCells = text.split(/\t+/).map((cell) => cell.trim()).filter(Boolean);
  if (tabCells.length >= 2 && isPlausibleSpeaker(tabCells[0])) {
    return {
      speaker: cleanSpeakerLabel(tabCells[0]),
      text: tabCells[1],
      direction: tabCells.slice(2).join(" / "),
      complete: true
    };
  }

  const quoteMatch = text.match(/^(.{1,30}?)\s*[：:]?\s*([「『])([\s\S]*)$/);
  if (quoteMatch && isPlausibleSpeaker(quoteMatch[1])) {
    return {
      speaker: cleanSpeakerLabel(quoteMatch[1]),
      openingQuote: quoteMatch[2],
      ...splitQuotedText(quoteMatch[3], quoteMatch[2])
    };
  }

  const colonMatch = text.match(/^([^：:]{1,30})[：:]\s*(.+)$/);
  if (colonMatch && isPlausibleSpeaker(colonMatch[1])) {
    return {
      speaker: cleanSpeakerLabel(colonMatch[1]),
      text: colonMatch[2].trim(),
      direction: "",
      complete: true
    };
  }
  return null;
};

export const parseGoogleDocsScript = (text = "", knownSpeakers = []) => {
  const sourceLines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const firstChapterLineIndex = sourceLines.findIndex((line) => isChapterHeading(normalizeDocumentLine(line)));
  const knownSpeakerNames = (knownSpeakers || [])
    .map((speaker) => cleanSpeakerLabel(speaker))
    .filter((speaker) => speaker && !isScriptStructureLabel(speaker));
  const knownSpeakerSet = new Set(
    knownSpeakerNames
      .flatMap((speaker) => [speaker, getCanonicalCharacterName(speaker, knownSpeakerNames)])
      .map(normalizeCharacterNameKey)
  );
  const rows = [];
  let currentChapter = "第一章";
  let currentScene = "Scene 1";
  let pendingSpeaker = "";
  let pendingDirection = "";
  let openDialogue = null;
  let skippingCastList = false;

  const pushRow = ({ speaker, lineText, direction = "", sourceKind = "dialogue" }) => {
    const normalizedText = normalizeDocumentLine(lineText);
    const normalizedDirection = normalizeDocumentLine(direction);
    if (!normalizedText && !normalizedDirection) return;
    const cleanedSpeaker = cleanSpeakerLabel(speaker) || "ト書き";
    rows.push({
      chapterTitle: currentChapter,
      sceneTitle: currentScene,
      speakerLabel: cleanedSpeaker,
      speaker: cleanedSpeaker === "ト書き"
        ? cleanedSpeaker
        : getCanonicalCharacterName(cleanedSpeaker, knownSpeakerNames),
      performanceType: cleanedSpeaker === "ト書き"
        ? "通常"
        : normalizeLinePerformanceType("", cleanedSpeaker),
      text: normalizedText || normalizedDirection,
      direction: normalizedText ? normalizedDirection : "",
      fileName: "",
      sourceKind,
      sourceOrder: rows.length
    });
  };

  const nextNonEmptyLine = (startIndex) => {
    for (let index = startIndex + 1; index < sourceLines.length; index += 1) {
      const candidate = normalizeDocumentLine(sourceLines[index]);
      if (candidate) return candidate;
    }
    return "";
  };

  const flushOpenDialogue = () => {
    if (!openDialogue) return;
    pushRow({
      speaker: openDialogue.speaker,
      lineText: openDialogue.text,
      direction: openDialogue.direction
    });
    openDialogue = null;
  };

  sourceLines.forEach((rawLine, index) => {
    const line = normalizeDocumentLine(rawLine);
    if (!line) return;
    if (firstChapterLineIndex > index && isStandaloneDocumentTitleLine(line)) return;

    const chapterHeading = isChapterHeading(line);
    const sceneHeading = isSceneHeading(line);
    const metadataLine = isDocumentMetadataLine(line);
    if (openDialogue && (chapterHeading || sceneHeading || isCastListHeading(line))) {
      flushOpenDialogue();
    }

    if (openDialogue) {
      const closeIndex = line.indexOf(openDialogue.closingQuote);
      if (closeIndex < 0) {
        openDialogue.text = `${openDialogue.text}\n${line}`.trim();
        return;
      }
      const suffix = line.slice(closeIndex + 1).trim();
      pushRow({
        speaker: openDialogue.speaker,
        lineText: `${openDialogue.text}\n${line.slice(0, closeIndex)}`.trim(),
        direction: [openDialogue.direction, getParentheticalDirection(suffix) || suffix].filter(Boolean).join(" / ")
      });
      openDialogue = null;
      return;
    }

    if (chapterHeading) {
      currentChapter = normalizeChapterHeading(line);
      currentScene = "章の冒頭";
      pendingSpeaker = "";
      pendingDirection = "";
      skippingCastList = false;
      return;
    }

    if (sceneHeading) {
      currentScene = normalizeSceneHeading(line);
      pendingSpeaker = "";
      pendingDirection = "";
      skippingCastList = false;
      return;
    }

    if (metadataLine) {
      pendingSpeaker = "";
      pendingDirection = "";
      skippingCastList = isCastListHeading(line);
      return;
    }

    if (skippingCastList) return;

    if (isScriptCueLine(line)) {
      pendingSpeaker = "";
      pendingDirection = "";
      pushRow({ speaker: "ト書き", lineText: line, sourceKind: "direction" });
      return;
    }

    const parentheticalDirection = getParentheticalDirection(line);
    if (parentheticalDirection) {
      if (pendingSpeaker) {
        pendingDirection = [pendingDirection, parentheticalDirection].filter(Boolean).join(" / ");
      } else if (
        rows.length &&
        rows[rows.length - 1].chapterTitle === currentChapter &&
        rows[rows.length - 1].sceneTitle === currentScene
      ) {
        rows[rows.length - 1].direction = [rows[rows.length - 1].direction, parentheticalDirection].filter(Boolean).join(" / ");
      } else {
        pushRow({ speaker: "ト書き", lineText: parentheticalDirection, sourceKind: "direction" });
      }
      return;
    }

    if (pendingSpeaker) {
      const quoteMatch = line.match(/^([「『])([\s\S]*)$/);
      if (quoteMatch) {
        const quoted = splitQuotedText(quoteMatch[2], quoteMatch[1]);
        if (quoted.complete) {
          pushRow({
            speaker: pendingSpeaker,
            lineText: quoted.text,
            direction: [pendingDirection, quoted.direction].filter(Boolean).join(" / ")
          });
        } else {
          openDialogue = {
            speaker: pendingSpeaker,
            text: quoted.text,
            direction: pendingDirection,
            closingQuote: quoted.closingQuote
          };
        }
      } else {
        pushRow({ speaker: pendingSpeaker, lineText: line, direction: pendingDirection });
      }
      pendingSpeaker = "";
      pendingDirection = "";
      return;
    }

    const inlineDialogue = parseInlineDialogue(line);
    if (inlineDialogue) {
      if (inlineDialogue.pending) {
        pendingSpeaker = inlineDialogue.speaker;
      } else if (inlineDialogue.complete === false) {
        openDialogue = {
          speaker: inlineDialogue.speaker,
          text: inlineDialogue.text,
          direction: inlineDialogue.direction,
          closingQuote: inlineDialogue.closingQuote
        };
      } else {
        pushRow({
          speaker: inlineDialogue.speaker,
          lineText: inlineDialogue.text,
          direction: inlineDialogue.direction,
          sourceKind: inlineDialogue.speaker === "ト書き" ? "direction" : "dialogue"
        });
      }
      return;
    }

    const nextLine = nextNonEmptyLine(index);
    const standaloneSpeaker = cleanSpeakerLabel(line);
    const nextStartsWithQuote = /^[「『]/.test(nextLine);
    const isKnownSpeaker = knownSpeakerSet.has(normalizeCharacterNameKey(getCanonicalCharacterName(standaloneSpeaker, knownSpeakerNames)));
    const nextSpeaker = cleanSpeakerLabel(nextLine);
    const nextIsKnownSpeaker = knownSpeakerSet.has(normalizeCharacterNameKey(getCanonicalCharacterName(nextSpeaker, knownSpeakerNames)));
    const nextIsStructure = isScriptStructureLabel(nextLine);
    const knownSpeakerHasPlainDialogue = isKnownSpeaker && nextLine && !nextIsKnownSpeaker && !nextIsStructure && !parseInlineDialogue(nextLine);
    if (isPlausibleSpeaker(standaloneSpeaker) && (nextStartsWithQuote || knownSpeakerHasPlainDialogue)) {
      pendingSpeaker = standaloneSpeaker;
      return;
    }

    pushRow({ speaker: "ト書き", lineText: line, sourceKind: "direction" });
  });

  flushOpenDialogue();
  if (pendingSpeaker) {
    pushRow({ speaker: "ト書き", lineText: pendingSpeaker, sourceKind: "direction" });
  }

  return rows;
};

export const getCharacterDialogueCounts = (project = {}) => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const lines = Array.isArray(project.lines) ? project.lines : [];
  const counts = Object.fromEntries(characters.map((character) => [character.id, 0]));
  const knownNames = characters.flatMap(getCharacterKnownNames);
  const characterIdByName = new Map(characters.flatMap((character) =>
    getCharacterKnownNames(character).flatMap((knownName) => [
      [normalizeCharacterNameKey(knownName), character.id],
      [normalizeCharacterNameKey(getCanonicalCharacterName(knownName, knownNames)), character.id]
    ])
  ));

  lines.forEach((line) => {
    if (line.kind !== "direction" && Object.hasOwn(counts, line.characterId)) {
      counts[line.characterId] += 1;
    }
    if (!line.manualBody || !String(line.text || "").trim()) return;
    parseGoogleDocsScript(line.text, knownNames).forEach((row) => {
      if (row.sourceKind === "direction" || row.speaker === "ト書き") return;
      const canonicalName = getCanonicalCharacterName(row.speaker, knownNames);
      const characterId = characterIdByName.get(normalizeCharacterNameKey(canonicalName));
      if (characterId) counts[characterId] += 1;
    });
  });

  return counts;
};

export const partitionCharactersByScript = (project = {}) => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const dialogueCounts = getCharacterDialogueCounts(project);
  const linkedCharacters = [];
  const unlinkedCharacters = [];

  characters.forEach((character) => {
    const target = (dialogueCounts[character.id] || 0) > 0
      ? linkedCharacters
      : unlinkedCharacters;
    target.push(character);
  });

  return { dialogueCounts, linkedCharacters, unlinkedCharacters };
};

export const getRecordingDisplayProject = (project = {}) => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const knownNames = characters.flatMap(getCharacterKnownNames);
  const derivedLineProgress = project.derivedLineProgress && typeof project.derivedLineProgress === "object"
    ? project.derivedLineProgress
    : {};
  const derivedIdentityCounts = new Map();
  const characterIdByName = new Map(characters.flatMap((character) =>
    getCharacterKnownNames(character).flatMap((knownName) => [
      [normalizeCharacterNameKey(knownName), character.id],
      [normalizeCharacterNameKey(getCanonicalCharacterName(knownName, knownNames)), character.id]
    ])
  ));
  const lines = (Array.isArray(project.lines) ? project.lines : []).flatMap((line) => {
    if (!line.manualBody || !String(line.text || "").trim()) return [line];
    const parsedRows = parseGoogleDocsScript(line.text, knownNames);
    const resolvedRows = parsedRows.map((row) => {
      const isDirection = row.sourceKind === "direction" || row.speaker === "ト書き";
      const canonicalName = isDirection ? "" : getCanonicalCharacterName(row.speaker, knownNames);
      const characterId = canonicalName
        ? characterIdByName.get(normalizeCharacterNameKey(canonicalName)) || ""
        : "";
      const resolvedAsDialogue = Boolean(characterId) && !isDirection;
      const fallbackPrefix = !isDirection && !characterId && row.speaker ? `${row.speaker}：` : "";
      const performanceType = resolvedAsDialogue
        ? normalizeLinePerformanceType(row.performanceType, row.speakerLabel || row.speaker)
        : "通常";
      const identityKey = [
        getScriptChapterKey(line.chapterTitle),
        getScriptSceneKey(line.sceneTitle),
        getScriptLineMatchKey({
          speaker: resolvedAsDialogue ? canonicalName : "ト書き",
          text: row.text,
          sourceKind: resolvedAsDialogue ? "dialogue" : "direction",
          performanceType
        }),
        normalizeScriptMatchValue(row.direction)
      ].join("\u0002");
      const occurrence = (derivedIdentityCounts.get(identityKey) || 0) + 1;
      derivedIdentityCounts.set(identityKey, occurrence);
      const lineId = makeStableScopeId("derived_line", `${identityKey}\u0002${occurrence}`);
      const savedProgress = derivedLineProgress[lineId] || {};
      return {
        ...line,
        id: lineId,
        characterId: resolvedAsDialogue ? characterId : "",
        kind: resolvedAsDialogue ? "dialogue" : "direction",
        performanceType,
        manualBody: false,
        derivedFromManualBody: true,
        sourceLineId: line.id,
        text: `${fallbackPrefix}${row.text || ""}`.trim(),
        direction: resolvedAsDialogue ? String(row.direction || "") : "",
        fileName: "",
        actorStatus: normalizeStatus(savedProgress.actorStatus, ACTOR_RECORDING_STATUSES, "未収録"),
        reviewStatus: normalizeStatus(savedProgress.reviewStatus, DIRECTOR_REVIEW_STATUSES, "未確認"),
        recordingUrl: String(savedProgress.recordingUrl || ""),
        recordingFileName: String(savedProgress.recordingFileName || ""),
        actorNote: String(savedProgress.actorNote || ""),
        directorNote: String(savedProgress.directorNote || ""),
        updatedAt: String(savedProgress.updatedAt || "")
      };
    });
    return resolvedRows.some((row) => row.kind === "dialogue") ? resolvedRows : [line];
  });

  return {
    ...project,
    lines: lines.map((line, index) => line.derivedFromManualBody
      ? { ...line, displayOrder: index + 1 }
      : line)
  };
};

const DERIVED_LINE_PROGRESS_FIELDS = new Set([
  "actorStatus",
  "reviewStatus",
  "recordingUrl",
  "recordingFileName",
  "actorNote",
  "directorNote",
  "updatedAt"
]);

export const patchRecordingLineProgress = (project = {}, lineId = "", patch = {}, lineContext = null) => {
  const storedLine = (project.lines || []).find((line) => line.id === lineId);
  if (storedLine) {
    return {
      ...project,
      lines: project.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line)
    };
  }

  const displayLine = lineContext?.id === lineId
    ? lineContext
    : getRecordingDisplayProject(project).lines.find((line) => line.id === lineId);
  if (!displayLine?.derivedFromManualBody) return project;
  const progressPatch = Object.fromEntries(
    Object.entries(patch).filter(([key]) => DERIVED_LINE_PROGRESS_FIELDS.has(key))
  );
  if (!Object.keys(progressPatch).length) return project;
  const previous = project.derivedLineProgress?.[lineId] || {};
  return {
    ...project,
    derivedLineProgress: {
      ...(project.derivedLineProgress || {}),
      [lineId]: {
        id: lineId,
        sourceLineId: displayLine.sourceLineId || previous.sourceLineId || "",
        characterId: displayLine.characterId || previous.characterId || "",
        chapterId: displayLine.chapterId || previous.chapterId || "",
        sceneId: displayLine.sceneId || previous.sceneId || "",
        performanceType: displayLine.performanceType || previous.performanceType || "通常",
        actorStatus: previous.actorStatus || displayLine.actorStatus || "未収録",
        reviewStatus: previous.reviewStatus || displayLine.reviewStatus || "未確認",
        recordingUrl: previous.recordingUrl || displayLine.recordingUrl || "",
        recordingFileName: previous.recordingFileName || displayLine.recordingFileName || "",
        actorNote: previous.actorNote || displayLine.actorNote || "",
        directorNote: previous.directorNote || displayLine.directorNote || "",
        updatedAt: previous.updatedAt || displayLine.updatedAt || "",
        ...progressPatch
      }
    }
  };
};

const normalizeParsedTableRow = (row = {}) => {
  const originalSpeaker = cleanSpeakerLabel(row.speaker);
  const isDirection = !originalSpeaker || isScriptStructureLabel(originalSpeaker);
  const text = String(row.text || "").trim() || (isDirection && originalSpeaker !== "ト書き" ? originalSpeaker : "");
  return {
    ...row,
    speakerLabel: originalSpeaker,
    speaker: isDirection ? "ト書き" : originalSpeaker,
    performanceType: isDirection ? "通常" : normalizeLinePerformanceType(row.performanceType, originalSpeaker),
    text,
    sourceKind: isDirection ? "direction" : "dialogue"
  };
};

export const parseScriptTable = (text = "", parseCsv) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const aliases = {
    chapter: ["章", "chapter", "チャプター"],
    scene: ["シーン", "scene", "場面"],
    speaker: ["話者", "登場人物", "キャラクター", "speaker", "character"],
    performanceType: ["読み分け", "演技区分", "話者区分", "performance", "voice type"],
    text: ["セリフ", "台詞", "本文", "text", "line"],
    direction: ["演技指示", "ト書き", "指示", "direction", "note"],
    fileName: ["ファイル名", "録音ファイル名", "filename", "file"]
  };

  if (!trimmed.includes("\t")) {
    const objectRows = parseCsv(trimmed);
    return objectRows
      .map((row, index) => {
        const normalizedEntries = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [String(key).trim().toLocaleLowerCase("ja"), value])
        );
        const get = (key) => {
          const alias = aliases[key].find((label) => Object.prototype.hasOwnProperty.call(normalizedEntries, label));
          return String(alias ? normalizedEntries[alias] : "").trim();
        };
        return {
          chapterTitle: get("chapter") || "第一章",
          sceneTitle: get("scene") || "Scene 1",
          speaker: get("speaker"),
          performanceType: get("performanceType"),
          text: get("text"),
          direction: get("direction"),
          fileName: get("fileName"),
          sourceOrder: index
        };
      })
      .map(normalizeParsedTableRow)
      .filter((row) => row.speaker !== "ト書き" || row.text);
  }

  const rows = trimmed.split(/\r?\n/).map((line) => line.split("\t"));
  if (!rows.length) return [];
  const normalizedHeader = rows[0].map((cell) => String(cell || "").trim().toLocaleLowerCase("ja"));
  const indexOf = (key) => normalizedHeader.findIndex((header) => aliases[key].includes(header));
  const indexes = Object.fromEntries(Object.keys(aliases).map((key) => [key, indexOf(key)]));
  const hasHeader = indexes.text >= 0 || indexes.speaker >= 0;
  const body = hasHeader ? rows.slice(1) : rows;

  return body
    .map((row, index) => {
      const hasChapterCell = !hasHeader && row.length >= 6;
      const offset = hasChapterCell ? 1 : 0;
      const get = (key, fallbackIndex) => String(row[indexes[key] >= 0 ? indexes[key] : fallbackIndex] || "").trim();
      return {
        chapterTitle: get("chapter", hasChapterCell ? 0 : -1) || "第一章",
        sceneTitle: get("scene", offset) || "Scene 1",
        speaker: get("speaker", offset + 1),
        performanceType: get("performanceType", -1),
        text: get("text", offset + 2),
        direction: get("direction", offset + 3),
        fileName: get("fileName", offset + 4),
        sourceOrder: index
      };
    })
    .map(normalizeParsedTableRow)
    .filter((row) => row.speaker !== "ト書き" || row.text);
};
