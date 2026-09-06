import {
  ELEVENLABS_PROMPT_MAX_LENGTH,
  countElevenLabsPromptCharacters,
  limitElevenLabsPrompt
} from "./elevenlabs.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const SE_PROMPT_MODE_OPTIONS = [
  { value: "one-shot", label: "単発音" },
  { value: "sequence", label: "連続動作" },
  { value: "ambience", label: "環境音" },
  { value: "loop", label: "ループ" }
];

export const SE_PROMPT_DISTANCE_OPTIONS = [
  { value: "close", label: "近い" },
  { value: "medium", label: "中距離" },
  { value: "far", label: "遠い" }
];

export const SE_PROMPT_SPACE_OPTIONS = [
  { value: "unspecified", label: "指定なし" },
  { value: "small-room", label: "小さな屋内" },
  { value: "large-room", label: "広い屋内" },
  { value: "outdoor", label: "屋外" }
];

export const SE_PROMPT_INTENSITY_OPTIONS = [
  { value: "subtle", label: "控えめ" },
  { value: "natural", label: "自然" },
  { value: "strong", label: "強い" },
  { value: "cinematic", label: "劇的" }
];

export const SE_PROMPT_STYLE_OPTIONS = [
  { value: "realistic", label: "リアル" },
  { value: "cinematic", label: "映画的" },
  { value: "stylized", label: "誇張表現" }
];

const OPTION_VALUES = {
  mode: new Set(SE_PROMPT_MODE_OPTIONS.map((option) => option.value)),
  distance: new Set(SE_PROMPT_DISTANCE_OPTIONS.map((option) => option.value)),
  space: new Set(SE_PROMPT_SPACE_OPTIONS.map((option) => option.value)),
  intensity: new Set(SE_PROMPT_INTENSITY_OPTIONS.map((option) => option.value)),
  style: new Set(SE_PROMPT_STYLE_OPTIONS.map((option) => option.value))
};

const getCueText = (material = {}) => String(material.title || material.searchQuery || "必要な効果音").trim();

const inferMode = (cue = "") => {
  if (/(ループ|環境音|アンビエンス|雨|風|群衆|観客|ざわめき|波|川|森|街|虫|鳥)/u.test(cue)) return "ambience";
  if (/(続け|連続|歩く|走る|足音|近づ|遠ざ|開いて|閉じて|その後|続いて)/u.test(cue)) return "sequence";
  return "one-shot";
};

const inferDistance = (cue = "") => {
  if (/(遠く|遠方|かすか|遠ざ)/u.test(cue)) return "far";
  if (/(近く|耳元|目の前|接近)/u.test(cue)) return "close";
  return "medium";
};

const inferSpace = (cue = "") => {
  if (/(屋外|外|街|路地|森|海|川|空|広場|雨|風)/u.test(cue)) return "outdoor";
  if (/(ホール|体育館|劇場|倉庫|大広間|教会)/u.test(cue)) return "large-room";
  if (/(室内|部屋|廊下|車内|店内|小屋)/u.test(cue)) return "small-room";
  return "unspecified";
};

const inferIntensity = (cue = "") => {
  if (/(激しい|強い|大きな|轟|爆発|破裂|絶叫)/u.test(cue)) return "strong";
  if (/(小さな|弱い|静か|かすか|そっと)/u.test(cue)) return "subtle";
  return "natural";
};

const inferDuration = (mode = "one-shot") => {
  if (mode === "ambience" || mode === "loop") return 12;
  if (mode === "sequence") return 7;
  return 4;
};

export const normalizeSePromptDraft = (value = {}, material = {}) => {
  const cue = getCueText(material);
  const inferredMode = inferMode(cue);
  const mode = OPTION_VALUES.mode.has(value?.mode) ? value.mode : inferredMode;
  const duration = Number(value?.durationSeconds);
  const promptInfluence = Number(value?.promptInfluence);
  return {
    mode,
    durationSeconds: Number.isFinite(duration) ? clamp(Math.round(duration * 10) / 10, 0.5, 30) : inferDuration(mode),
    promptInfluence: Number.isFinite(promptInfluence)
      ? clamp(Math.round(promptInfluence * 100) / 100, 0, 1)
      : 0.3,
    distance: OPTION_VALUES.distance.has(value?.distance) ? value.distance : inferDistance(cue),
    space: OPTION_VALUES.space.has(value?.space) ? value.space : inferSpace(cue),
    intensity: OPTION_VALUES.intensity.has(value?.intensity) ? value.intensity : inferIntensity(cue),
    style: OPTION_VALUES.style.has(value?.style) ? value.style : "realistic",
    detail: String(value?.detail || ""),
    codexPrompt: String(value?.codexPrompt || ""),
    elevenLabsPrompt: limitElevenLabsPrompt(value?.elevenLabsPrompt || ""),
    fireflyPrompt: String(value?.fireflyPrompt || "")
  };
};

const MODE_DESCRIPTIONS = {
  "one-shot": { ja: "単発音。前後に不要な環境音を足さず、一度の動作として明瞭に聞こえる", en: "A clean one-shot with a clear beginning and ending" },
  sequence: { ja: "一連の動作。各出来事の順番と間を自然につなぐ", en: "A natural sequence of connected actions with clear timing" },
  ambience: { ja: "自然に持続する環境音。単調にならない小さな揺らぎを入れる", en: "Continuous ambience with subtle natural variation" },
  loop: { ja: "継ぎ目のないループ。繰り返しても開始点と終了点が分からない", en: "Seamless loop with no perceptible start or end point" }
};

const DISTANCE_DESCRIPTIONS = {
  close: { ja: "近距離。細部がはっきり聞こえる", en: "close perspective with crisp detail" },
  medium: { ja: "中距離。場面になじむ自然な距離感", en: "medium perspective at a natural scene distance" },
  far: { ja: "遠距離。空気感と距離による減衰を含む", en: "distant perspective with natural air and attenuation" }
};

const SPACE_DESCRIPTIONS = {
  unspecified: { ja: "空間は効果音の内容に合う自然な響き", en: "natural acoustics appropriate to the sound" },
  "small-room": { ja: "小さな屋内。短く控えめな室内反射", en: "a small interior with short, restrained reflections" },
  "large-room": { ja: "広い屋内。広がりのある残響", en: "a large interior with spacious reverberation" },
  outdoor: { ja: "屋外。壁反射を抑え、開けた空気感", en: "outdoors with open air and minimal wall reflections" }
};

const INTENSITY_DESCRIPTIONS = {
  subtle: { ja: "控えめで、台詞を邪魔しない", en: "subtle and unobtrusive under dialogue" },
  natural: { ja: "誇張しすぎない自然な強さ", en: "natural intensity without exaggeration" },
  strong: { ja: "力強く明瞭だが、音割れさせない", en: "strong and clearly defined without clipping" },
  cinematic: { ja: "ドラマとして印象的で、奥行きのある強さ", en: "dramatic cinematic intensity with depth" }
};

const STYLE_DESCRIPTIONS = {
  realistic: { ja: "現実的で自然な質感", en: "realistic and natural texture" },
  cinematic: { ja: "映像作品向けの映画的な質感", en: "cinematic sound design for a voice drama" },
  stylized: { ja: "意図が伝わる程度に誇張した質感", en: "stylized and slightly exaggerated for clarity" }
};

const CUE_HINTS = [
  [/雨/u, "rain ambience"],
  [/雷|稲妻/u, "thunder rumble"],
  [/風/u, "wind"],
  [/扉|ドア/u, "door movement"],
  [/足音|歩く|走る/u, "footsteps"],
  [/鐘|ベル/u, "bell"],
  [/爆発|爆破/u, "explosion impact"],
  [/銃|発砲/u, "gunshot"],
  [/剣|刀|刃/u, "metal blade movement"],
  [/拍手/u, "applause"],
  [/群衆|観客|ざわめき/u, "crowd ambience"],
  [/車|エンジン/u, "vehicle engine"],
  [/波|海|水|川/u, "water ambience"],
  [/火|炎|燃/u, "fire crackle"],
  [/ガラス|硝子/u, "glass"],
  [/機械|電子|ノイズ/u, "mechanical electronic sound"],
  [/鳥/u, "birds"],
  [/虫/u, "insects"],
  [/森/u, "forest ambience"],
  [/街|路地/u, "urban ambience"],
  [/心臓|鼓動/u, "heartbeat"],
  [/呼吸|息/u, "breathing"],
  [/落下|落ちる/u, "falling impact"]
];

const getEnglishCueHints = (cue = "") => [...new Set(
  CUE_HINTS.filter(([pattern]) => pattern.test(cue)).map(([, hint]) => hint)
)];

const compactPromptText = (value = "") => String(value || "").replace(/\s+/gu, " ").trim();

const trimPromptAtBoundary = (value = "", maxLength = ELEVENLABS_PROMPT_MAX_LENGTH) => {
  const compact = compactPromptText(value);
  if (countElevenLabsPromptCharacters(compact) <= maxLength) return compact;
  const clipped = limitElevenLabsPrompt(compact, maxLength);
  const boundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf(", "), clipped.lastIndexOf("; "), clipped.lastIndexOf(" "));
  return (boundary >= Math.floor(maxLength * 0.72) ? clipped.slice(0, boundary + 1) : clipped).trimEnd();
};

const fitElevenLabsPrompt = (body = "", ending = "") => {
  const safeEnding = compactPromptText(ending);
  const endingLength = countElevenLabsPromptCharacters(safeEnding);
  const bodyLimit = Math.max(0, ELEVENLABS_PROMPT_MAX_LENGTH - endingLength - (safeEnding ? 1 : 0));
  const safeBody = trimPromptAtBoundary(body, bodyLimit);
  return limitElevenLabsPrompt([safeBody, safeEnding].filter(Boolean).join(" "));
};

const summarizeLocations = (locations = [], material = {}) => {
  const values = locations.length
    ? locations.map((location) => [location.chapterTitle, location.sceneTitle].filter(Boolean).join(" / "))
    : [[material.chapterTitle].filter(Boolean).join(" / ")];
  const unique = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!unique.length) return "章・シーン未設定";
  const shown = unique.slice(0, 4);
  return unique.length > shown.length ? `${shown.join("、")}、ほか${unique.length - shown.length}か所` : shown.join("、");
};

const makeWavFileName = (material = {}) => {
  const raw = [material.chapterTitle, material.title || material.searchQuery || "sound-effect"]
    .filter(Boolean)
    .join("_")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/\s+/gu, "_")
    .replace(/[.。]+$/gu, "")
    .slice(0, 72);
  return `${raw || "sound-effect"}.wav`;
};

export const buildSePromptOutputs = (material = {}, value = {}, locations = []) => {
  const draft = normalizeSePromptDraft(value, material);
  const cue = getCueText(material);
  const locationLabel = summarizeLocations(locations, material);
  const fileName = makeWavFileName(material);
  const mode = MODE_DESCRIPTIONS[draft.mode];
  const distance = DISTANCE_DESCRIPTIONS[draft.distance];
  const space = SPACE_DESCRIPTIONS[draft.space];
  const intensity = INTENSITY_DESCRIPTIONS[draft.intensity];
  const style = STYLE_DESCRIPTIONS[draft.style];
  const detail = draft.detail.trim();
  const cueHints = getEnglishCueHints(cue);
  const englishCue = cueHints.length ? `${cueHints.join(", ")}. ` : "";

  const codexPrompt = `以下の効果音を、現在のワークスペースで実行できるコードを使ってオリジナル生成してください。

【効果音】${cue}
【台本上の使用箇所】${locationLabel}
【音の構成】${mode.ja}
【距離感】${distance.ja}
【空間】${space.ja}
【強さ】${intensity.ja}
【仕上がり】${style.ja}${detail ? `\n【追加指示】${detail}` : ""}

【納品仕様】
- 長さ: ${draft.durationSeconds}秒
- 44.1kHz / 24bit PCM / モノラル WAV
- 保存先: artifacts/se/${fileName}
- 台詞、声、音楽、透かし音は含めない
- 外部の著作権音源や無許可サンプルは使わず、Python（NumPy/SciPy）やFFmpegなどで生成・加工する
- 先頭と末尾のクリックノイズ、DCオフセット、音割れを除去し、ピークに余裕を残す
- 作成後に長さ・サンプルレート・ビット深度・チャンネル数とピーク値を検査し、結果を報告する
- 手続き的な合成では自然な品質にできない音の場合は、無理に完成扱いせず理由と無料素材を探すための検索語を提示する`;

  const elevenLabsBody = `${englishCue}Sound effect: "${cue}". ${mode.en}. ${distance.en}. ${space.en}. ${intensity.en}. ${style.en}.${detail ? ` Direction: ${detail}.` : ""}`;
  const elevenLabsEnding = `Duration: ${draft.durationSeconds} seconds. Isolated sound only. No speech, voices, music, clipping, or digital artifacts.`;
  const elevenLabsPrompt = fitElevenLabsPrompt(elevenLabsBody, elevenLabsEnding);

  return { codexPrompt, elevenLabsPrompt };
};
