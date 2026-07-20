export const ACTOR_RECORDING_STATUSES = ["未収録", "収録済み", "再提出済み"];
export const DIRECTOR_REVIEW_STATUSES = ["未確認", "確認中", "OK", "リテイク", "保留"];
const RUBY_SOURCE = "(?:[|｜]([^《\\n]+)《([^》\\n]+)》|\\{([^|{}\\n]+)\\|([^{}\\n]+)\\})";

const CHARACTER_COLORS = ["#168b9a", "#d65285", "#7a63ad", "#b57024", "#2f7d4a", "#5f6d7a"];

const createLocalId = (prefix) => {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
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
  status: "準備中",
  characters: [],
  castMembers: [],
  lines: [],
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
    status: "収録準備中",
    characters: [
      { id: "character_vel", name: "ヴェル", color: "#168b9a" },
      { id: "character_amamori", name: "アマモリ", color: "#d65285" },
      { id: "character_narration", name: "ナレーション", color: "#5f6d7a" }
    ],
    castMembers: [
      {
        id: "cast_vel",
        actorName: "ヴェル役 声優さん",
        contact: "",
        characterIds: ["character_vel"],
        accessKey: ""
      },
      {
        id: "cast_amamori",
        actorName: "アマモリ役 声優さん",
        contact: "",
        characterIds: ["character_amamori"],
        accessKey: ""
      }
    ],
    lines: [
      {
        id: "line_sample_001",
        sceneId: "scene_01",
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
        sceneId: "scene_01",
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
        sceneId: "scene_01",
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
        sceneId: "scene_01",
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
        sceneId: "scene_02",
        sceneTitle: "Scene 02 出発",
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
    sharedAt: "",
    updatedAt: ""
  }
];

const normalizeStatus = (value, options, fallback) => (options.includes(value) ? value : fallback);

export const normalizeRecordingProject = (project = {}, index = 0) => {
  const rawLines = Array.isArray(project.lines) ? project.lines : [];
  const rawCharacters = Array.isArray(project.characters) ? project.characters : [];
  const characterByName = new Map();
  const characters = rawCharacters.map((character, characterIndex) => {
    const normalized = {
      id: character.id || createLocalId("character"),
      name: String(character.name || `登場人物${characterIndex + 1}`).trim(),
      color: character.color || CHARACTER_COLORS[characterIndex % CHARACTER_COLORS.length]
    };
    characterByName.set(normalized.name, normalized);
    return normalized;
  });

  rawLines.forEach((line) => {
    const speakerName = String(line.character || line.speaker || "").trim();
    if (!line.characterId && speakerName && !characterByName.has(speakerName)) {
      const character = {
        id: createLocalId("character"),
        name: speakerName,
        color: CHARACTER_COLORS[characters.length % CHARACTER_COLORS.length]
      };
      characters.push(character);
      characterByName.set(speakerName, character);
    }
  });

  const characterIds = new Set(characters.map((character) => character.id));
  const fallbackCharacter = characters[0];
  const lines = rawLines.map((line, lineIndex) => {
    const speakerName = String(line.character || line.speaker || "").trim();
    const matchedCharacter = characterByName.get(speakerName);
    const characterId = characterIds.has(line.characterId)
      ? line.characterId
      : matchedCharacter?.id || fallbackCharacter?.id || "";
    return {
      id: line.id || createLocalId("line"),
      sceneId: line.sceneId || `scene_${String(line.sceneNo || 1).padStart(2, "0")}`,
      sceneTitle: line.sceneTitle || line.scene || `Scene ${line.sceneNo || 1}`,
      order: Number.isFinite(Number(line.order)) ? Number(line.order) : lineIndex + 1,
      characterId,
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

  return {
    id: project.id || `recording_project_${index + 1}`,
    episodeId: project.episodeId || "",
    title: project.title || `収録プロジェクト${index + 1}`,
    description: project.description || "",
    scriptVersion: project.scriptVersion || "初稿",
    status: project.status || "準備中",
    characters,
    castMembers: (Array.isArray(project.castMembers) ? project.castMembers : []).map((member, memberIndex) => ({
      id: member.id || createLocalId("cast"),
      actorName: member.actorName || `声優さん${memberIndex + 1}`,
      contact: member.contact || "",
      characterIds: (Array.isArray(member.characterIds) ? member.characterIds : []).filter((id) => characterIds.has(id)),
      accessKey: member.accessKey || createRecordingAccessKey()
    })),
    lines: lines.sort((a, b) => Number(a.order) - Number(b.order)),
    sharedAt: project.sharedAt || "",
    updatedAt: project.updatedAt || ""
  };
};

export const normalizeRecordingProjects = (projects) =>
  (Array.isArray(projects) ? projects : sampleRecordingProjects).map(normalizeRecordingProject);

export const mergeRemoteRecordingProject = (localProject, remoteProject) => {
  const remoteLines = new Map((remoteProject?.lines || []).map((line) => [line.id, line]));
  return normalizeRecordingProject({
    ...localProject,
    sharedAt: remoteProject?.sharedAt || localProject.sharedAt,
    updatedAt: remoteProject?.updatedAt || localProject.updatedAt,
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

export const getRecordingProgress = (project) => {
  const lines = project?.lines || [];
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
      if (!sceneCharacters.has(line.sceneId)) sceneCharacters.set(line.sceneId, new Set());
      sceneCharacters.get(line.sceneId).add(line.characterId);
    });
    sceneCharacters.forEach((characters, sceneId) => {
      if ([...selected].every((id) => characters.has(id))) matchingScenes.add(sceneId);
    });
  }

  const directIndexes = new Set();
  lines.forEach((line, index) => {
    const selectedMatch = selected.size === 0 || selected.has(line.characterId);
    const dialogueMatch = mode !== "dialogue" || selected.size < 2 || matchingScenes.has(line.sceneId);
    const statusMatch =
      statusFilter === "すべて" ||
      line.actorStatus === statusFilter ||
      line.reviewStatus === statusFilter;
    const haystack = `${line.sceneTitle} ${getCharacterName(project, line.characterId)} ${line.text} ${line.direction} ${line.fileName}`.toLocaleLowerCase("ja");
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

export const parseScriptTable = (text = "", parseCsv) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  const aliases = {
    scene: ["シーン", "scene", "場面"],
    speaker: ["話者", "登場人物", "キャラクター", "speaker", "character"],
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
          sceneTitle: get("scene") || "Scene 1",
          speaker: get("speaker"),
          text: get("text"),
          direction: get("direction"),
          fileName: get("fileName"),
          sourceOrder: index
        };
      })
      .filter((row) => row.speaker || row.text);
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
      const get = (key, fallbackIndex) => String(row[indexes[key] >= 0 ? indexes[key] : fallbackIndex] || "").trim();
      return {
        sceneTitle: get("scene", 0) || "Scene 1",
        speaker: get("speaker", 1),
        text: get("text", 2),
        direction: get("direction", 3),
        fileName: get("fileName", 4),
        sourceOrder: index
      };
    })
    .filter((row) => row.speaker || row.text);
};
