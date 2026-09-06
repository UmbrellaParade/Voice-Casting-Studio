import {
  createDefaultAuditionSocialTemplate,
  normalizeAuditionSocialPostText,
  normalizeAuditionSocialTemplate
} from "./audition-copy.js";
import { normalizeSePromptDraft } from "./se-prompts.js";
import { mergeRecordingProgress, normalizeProgressTimes, stampProgressPatch } from "./recording-sync.js";
import { buildManualAccentPattern, normalizeRetakeInstructions } from "./retake.js";

export const ACTOR_RECORDING_STATUSES = ["未収録", "収録済み", "再提出済み"];
export const DIRECTOR_REVIEW_STATUSES = ["未確認", "確認中", "OK", "リテイク", "保留"];
export const LINE_PERFORMANCE_TYPES = ["通常", "ナレーション", "心の声", "イヤモニ"];
export const PRODUCTION_MATERIAL_CATEGORIES = ["主題歌", "BGM", "SE", "完成音源", "サムネイル"];
export const PRODUCTION_MATERIAL_STATUSES = ["準備中", "制作中", "確認待ち", "完成"];
export const PRODUCTION_QUESTION_STATUSES = ["未回答", "回答済み", "解決済み"];
export const PRODUCTION_SCHEDULE_TYPES = ["収録締切", "リテイク締切", "確認日", "公開予定", "オーディション", "編集", "収録", "打ち合わせ", "その他"];
export const PRODUCTION_SCHEDULE_STATUSES = ["予定", "進行中", "完了", "延期"];
export const PRODUCTION_TASK_PRIORITIES = ["通常", "重要"];
export const PRODUCTION_AUDITION_APPLICANT_STATUSES = ["未選考", "キープ", "別役打診", "合格", "不合格"];
export const DEFAULT_AUDITION_MANAGEMENT_SHEET_URL = "https://docs.google.com/spreadsheets/d/19O9_lkivbomT5WiTRv-wsU5KKPLBx_lngZI4CclIXbY/edit?gid=1808011708#gid=1808011708";
export const DEFAULT_CONTACT_TEMPLATE_SHEET_URL = "https://docs.google.com/spreadsheets/d/19O9_lkivbomT5WiTRv-wsU5KKPLBx_lngZI4CclIXbY/edit?gid=85517127#gid=85517127";
export const PRODUCTION_CONTACT_TEMPLATE_CATEGORIES = ["募集告知", "応募受付", "確認依頼", "合格連絡", "その他", "不合格連絡", "リマインド"];
export const PRODUCTION_SOCIAL_TEMPLATE_CATEGORIES = ["募集", "結果発表", "制作進捗", "公開案内", "お知らせ"];
export const SHARED_LINK_COLORS = [
  "#168b9a", "#b04f74", "#6f5aa7", "#b36b1f",
  "#397c50", "#4b6fa9", "#9b4b45", "#7c5c3d"
];

const PRODUCTION_CONTACT_TEMPLATE_SCHEMA_VERSION = 1;

const sanitizeProductionRetakeMessageBody = (body = "") => String(body || "")
  .split(/\r?\n/u)
  .filter((line) => !/^さらにリテイクがある場合[：:]\s*ファイル名_re2\.wav$/u.test(line.trim()))
  .join("\n");

const DEFAULT_PRODUCTION_CONTACT_TEMPLATES = [
  {
    id: "contact_template_recruitment",
    category: "募集告知",
    name: "募集開始のお知らせ",
    body: "【声優オーディション開催】\n作品名：〇〇\n募集役：〇〇\n応募締切：〇月〇日\n応募方法：〇〇\n皆さまのご応募をお待ちしています！",
    notes: "SNS・告知ページ用",
    enabled: true
  },
  {
    id: "contact_template_received",
    category: "応募受付",
    name: "応募受付のご連絡",
    body: "〇〇さん\nこのたびは【作品名／役名】へご応募いただき、ありがとうございます。\n応募内容を受け付けました。結果発表まで今しばらくお待ちください。",
    notes: "応募確認時",
    enabled: true
  },
  {
    id: "contact_template_missing_information",
    category: "確認依頼",
    name: "不足情報のお願い",
    body: "〇〇さん\nご応募ありがとうございます。\n確認のため、次の情報をご共有いただけますでしょうか。\n・〇〇\n・〇〇\nよろしくお願いいたします。",
    notes: "応募内容に不足がある場合",
    enabled: true
  },
  {
    id: "contact_template_retake",
    category: "確認依頼",
    name: "リテイクのお願い",
    body: `〇〇さん

お疲れさまです。べるぼです＾＾
△△役の収録、本当にありがとうございます！

音声を確認させていただき、下記の箇所についてリテイクをお願いできればと思い、ご連絡しました。

{{リテイク一覧}}

お手数をおかけして申し訳ありませんが、該当箇所をご確認のうえ、再収録をお願いいたします。

再収録したファイルは、元のファイル名の末尾に「re1」のようにリテイク回数が分かる番号を付けて、いつもの収録フォルダーへアップロードをお願いいたします＾＾
例：ファイル名_re1.wav

分かりにくい点や確認したいことがありましたら、遠慮なくご連絡ください＾＾
何卒よろしくお願いいたします。`,
    notes: "台本で指定したリテイク箇所を担当声優へ送る場合",
    enabled: true
  },
  {
    id: "contact_template_accepted",
    category: "合格連絡",
    name: "合格のお知らせ",
    body: `〇〇さん、初めてメッセージ送らせて頂きます＾＾
べるぼと申します＾＾

〇〇さん、この度は△△役をご応募頂きまして本当にありがとうございます！

〇〇さんのお声を聴かせて頂き是非とも△△役をお願いさせて頂きたいと思いました＾＾
是非ともよろしくお願いします！

つきましては、LINEのオープンチャットで全声優さん達とやり取りをさせていただいておりますので以下のオープンチャットを登録しご入室頂けたらと思いますので何卒よろしくお願いいたします＾＾

オープンチャット「Umbrella Parade アニメ&ボイスドラマ」
line.me/ti/g2/1HHNE4n1JkYK9o8SL8dDbLnX96TgoUT1ubxd0Q?utm_source=invitation&utm_medium=link_copy&utm_campaign=default

参加コード
0703

になりますので何卒よろしくお願いいたします🌟

本当、お声を聴いたときに感動しました～☆彡

録音についてですが、オプチャのノートの方に「セリフ録音について」という項目がありまして、その中に台本ツールについてと収録音声のアップロード先について書いております＾＾

お手数おかけしますが一読して頂ければと思いますので何卒よろしくお願いいたします＾＾

また、収録期日については現状ではまだ設けてない状態ですので焦らず録音して頂ければと思いますので何卒よろしくお願いいたします＾＾`,
    notes: "合格者への連絡",
    enabled: true
  },
  {
    id: "contact_template_other_role",
    category: "その他",
    name: "別の役を依頼",
    body: `〇〇さん、初めてメッセージ送らせて頂きます＾＾
べるぼと申します＾＾

この度は、△△役のご応募を頂き本当にありがとうございました！

今回、△△役につきましては、〇〇さんのお声、物凄い素敵で本当に悩みましたが別の方に演じて頂くことになりました。
本当にすみません。

今回△△役ではないのですが、〇〇さんのお声のサンプルを聴く中で別の役をお願いできたらと思いまして連絡させて頂きました＾＾

〇〇さんにお願いしたい役として、
◆◆という役があります。
こちらセリフ数は少ないのですが、もしよかったらサンプルにあった「◇◇」のお声の感じで演じて頂けないかと思いました＾＾

以下、今回のボイスドラマの台本になっていて、
{{登場案内}}
よろしければご検討いただけましたら幸いです＾＾

〇ボイスドラマ脚本
drive.google.com/drive/folders/17aeoWD5sju-PJujaNF54Ot3JosK4AGvd

お手数おかけしますがご返信いただけたらと嬉しいです＾＾
何卒よろしくお願いいたします＾＾
◆◆のキャラクター画像はこちらになります＾＾`,
    notes: "別役をお願いする場合",
    enabled: true
  },
  {
    id: "contact_template_rejected",
    category: "不合格連絡",
    name: "選考結果のお知らせ",
    body: "〇〇さん\nこのたびは【作品名／役名】へご応募いただき、ありがとうございました。\n慎重に選考した結果、今回はご希望に添えない結果となりました。\n素敵なお声をお寄せいただいたこと、心より感謝申し上げます。",
    notes: "不合格者への連絡",
    enabled: true
  },
  {
    id: "contact_template_reminder",
    category: "リマインド",
    name: "応募締切のご案内",
    body: "【締切間近】\n【作品名】声優オーディションの応募締切は〇月〇日です。\nご検討中の方は、ぜひご応募ください！",
    notes: "SNS再告知用",
    enabled: true
  }
];

export const createDefaultProductionContactTemplates = () => DEFAULT_PRODUCTION_CONTACT_TEMPLATES.map((template) => ({
  ...template,
  updatedAt: ""
}));

const migrateProductionContactTemplates = (project = {}) => {
  const templates = Array.isArray(project.contactTemplates)
    ? [...project.contactTemplates]
    : createDefaultProductionContactTemplates();
  const schemaVersion = Number.parseInt(project.contactTemplateSchemaVersion, 10) || 0;
  const hasRetakeTemplate = templates.some((template) => template?.id === "contact_template_retake");
  if (schemaVersion >= PRODUCTION_CONTACT_TEMPLATE_SCHEMA_VERSION || hasRetakeTemplate) return templates;
  const retakeTemplate = createDefaultProductionContactTemplates()
    .find((template) => template.id === "contact_template_retake");
  return retakeTemplate ? [...templates, retakeTemplate] : templates;
};

const DEFAULT_PRODUCTION_SOCIAL_TEMPLATES = [
  {
    id: "social_template_audition",
    category: "募集",
    name: "声優募集のお知らせ",
    body: `【声優オーディション開催】
『{{作品名}}』の声優さんを募集しています＾＾

募集内容と応募方法は、各役の募集フォームをご確認ください。

#声優募集 #ボイスドラマ`,
    notes: "作品全体の募集告知",
    enabled: true
  },
  {
    id: "social_template_result",
    category: "結果発表",
    name: "選考結果のお知らせ",
    body: `【結果発表】
勝手ながら、今回は合格者のみご連絡させていただきます。

たくさんのご応募、本当にありがとうございました＾＾`,
    notes: "選考終了後の全体告知",
    enabled: true
  },
  {
    id: "social_template_progress",
    category: "制作進捗",
    name: "制作進捗のお知らせ",
    body: `【制作進捗】
『{{作品名}}』の制作を進めています＾＾

{{お知らせ}}

#ボイスドラマ`,
    notes: "収録・編集などの進捗共有",
    enabled: true
  },
  {
    id: "social_template_release",
    category: "公開案内",
    name: "公開のお知らせ",
    body: `【公開のお知らせ】
『{{作品名}}』を公開しました＾＾

{{公開URL}}

ぜひお聴きください！

#ボイスドラマ`,
    notes: "完成作品の公開告知",
    enabled: true
  }
];

export const createDefaultProductionSocialTemplates = () => DEFAULT_PRODUCTION_SOCIAL_TEMPLATES.map((template) => ({
  ...template,
  updatedAt: ""
}));

const normalizeScheduleTime = (value = "") => {
  const time = String(value || "").trim().slice(0, 5);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
};

const normalizeScheduleDateTime = (item = {}) => {
  const rawDate = String(item.date || item.deadlineDate || item.dateTime || "").trim();
  const dateTimeMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return {
    date: dateTimeMatch?.[1] || rawDate,
    time: normalizeScheduleTime(item.time || item.deadlineTime || dateTimeMatch?.[2])
  };
};

export const sortProductionScheduleItems = (items = []) => [...(Array.isArray(items) ? items : [])]
  .sort((first, second) => {
    const firstDate = String(first?.date || "9999-12-31");
    const secondDate = String(second?.date || "9999-12-31");
    const dateOrder = firstDate.localeCompare(secondDate);
    if (dateOrder) return dateOrder;
    return String(first?.time || "00:00").localeCompare(String(second?.time || "00:00"));
  });

const toLocalScheduleDateTime = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (number) => String(number).padStart(2, "0");
  return {
    date: `${validDate.getFullYear()}-${pad(validDate.getMonth() + 1)}-${pad(validDate.getDate())}`,
    time: `${pad(validDate.getHours())}:${pad(validDate.getMinutes())}`
  };
};

export const addProductionAuditionStartSchedule = (project = {}, characterId = "", startedAt = new Date()) => {
  const normalizedCharacterId = String(characterId || "").trim();
  const character = (Array.isArray(project.characters) ? project.characters : [])
    .find((item) => item.id === normalizedCharacterId);
  if (!character) return project;

  const sourceKey = `audition-recruitment-start:${normalizedCharacterId}`;
  const scheduleItems = Array.isArray(project.scheduleItems) ? project.scheduleItems : [];
  if (scheduleItems.some((item) => item.sourceKey === sourceKey)) return project;

  const dateTime = toLocalScheduleDateTime(startedAt);
  return {
    ...project,
    scheduleItems: [...scheduleItems, {
      id: createLocalId("schedule"),
      type: "オーディション",
      title: `「${character.name || "役名未設定"}」オーディション募集開始`,
      date: dateTime.date,
      time: dateTime.time,
      status: "進行中",
      notes: "タスク画面の「募集開始済み」から自動追加",
      sourceKey
    }]
  };
};

export const sortProductionTasks = (tasks = []) => [...(Array.isArray(tasks) ? tasks : [])]
  .sort((first, second) => {
    if (Boolean(first?.completed) !== Boolean(second?.completed)) return first?.completed ? 1 : -1;
    if (first?.priority !== second?.priority) return first?.priority === "重要" ? -1 : 1;
    const firstDate = String(first?.dueDate || "9999-12-31");
    const secondDate = String(second?.dueDate || "9999-12-31");
    const dateOrder = firstDate.localeCompare(secondDate);
    if (dateOrder) return dateOrder;
    return String(first?.createdAt || "").localeCompare(String(second?.createdAt || ""));
  });

const normalizeAuditionRoleProgress = (value) => {
  const entries = Array.isArray(value)
    ? value
    : Object.entries(value && typeof value === "object" ? value : {}).map(([characterId, progress]) => ({
      characterId,
      ...(progress && typeof progress === "object" ? progress : {})
    }));
  const byCharacterId = new Map();
  entries.forEach((progress) => {
    const characterId = String(progress?.characterId || "").trim();
    if (!characterId) return;
    const roleSummary = String(progress.auditionRoleSummary || "");
    const hasFemaleSetting = typeof progress.auditionAcceptsFemaleApplicants === "boolean";
    const hasMaleSetting = typeof progress.auditionAcceptsMaleApplicants === "boolean";
    const summaryRequestsMaleApplicants = /(?:女性の応募はご遠慮|男性(?:の方)?のみ.{0,16}応募)/u.test(roleSummary);
    const summaryRequestsFemaleApplicants = /(?:男性の応募はご遠慮|女性(?:の方)?のみ.{0,16}応募)/u.test(roleSummary);
    const acceptsFemaleApplicants = hasFemaleSetting
      ? progress.auditionAcceptsFemaleApplicants
      : summaryRequestsMaleApplicants
        ? false
        : true;
    const acceptsMaleApplicants = hasMaleSetting
      ? progress.auditionAcceptsMaleApplicants
      : summaryRequestsFemaleApplicants
        ? false
        : true;
    byCharacterId.set(characterId, {
      characterId,
      formCreated: Boolean(progress.formCreated),
      formStructureVerified: Boolean(progress.formStructureVerified),
      formValidation: progress.formValidation && typeof progress.formValidation === "object" ? progress.formValidation : {},
      headerApplied: Boolean(progress.headerApplied),
      uploadVerified: Boolean(progress.uploadVerified),
      recruitmentStarted: Boolean(progress.recruitmentStarted),
      formEditUrl: String(progress.formEditUrl || ""),
      formResponderUrl: String(progress.formResponderUrl || ""),
      headerImageUrl: String(progress.headerImageUrl || ""),
      socialImageUrl: String(progress.socialImageUrl || ""),
      imageAudit: progress.imageAudit && typeof progress.imageAudit === "object" ? progress.imageAudit : {},
      auditionRoleSummary: roleSummary,
      auditionAcceptsFemaleApplicants: Boolean(acceptsFemaleApplicants),
      auditionAcceptsMaleApplicants: Boolean(acceptsMaleApplicants),
      auditionLines: String(progress.auditionLines || ""),
      auditionDeadline: String(progress.auditionDeadline || ""),
      socialPostText: normalizeAuditionSocialPostText(progress.socialPostText),
      socialPostUpdatedAt: String(progress.socialPostUpdatedAt || ""),
      pcFinishStatus: String(progress.pcFinishStatus || ""),
      pcFinishMessage: String(progress.pcFinishMessage || ""),
      pcFinishedAt: String(progress.pcFinishedAt || ""),
      createdAt: String(progress.createdAt || ""),
      updatedAt: String(progress.updatedAt || "")
    });
  });
  return [...byCharacterId.values()];
};

export const canResolveProductionQuestion = (question = {}, userId, castMemberId = "") => {
  const questionUserId = Number(question.wpUserId);
  const currentUserId = Number(userId);
  const memberOwnsQuestion = Boolean(castMemberId)
    && String(question.castMemberId || "") === String(castMemberId);
  const userOwnsQuestion = questionUserId > 0
    && currentUserId > 0
    && Number.isFinite(questionUserId)
    && Number.isFinite(currentUserId)
    && questionUserId === currentUserId;
  return question.status === "回答済み"
    && Boolean(String(question.answer || "").trim())
    && (memberOwnsQuestion || userOwnsQuestion);
};

export const buildProductionQuestionThreads = (questions = []) => {
  const list = Array.isArray(questions) ? questions : [];
  const ids = new Set(list.map((question) => String(question.id || "")).filter(Boolean));
  const children = new Map();
  list.forEach((question) => {
    const parentId = String(question.parentQuestionId || "");
    if (!parentId || parentId === question.id || !ids.has(parentId)) return;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(question);
  });
  const visited = new Set();
  const ordered = [];
  const append = (question, depth = 0) => {
    const id = String(question.id || "");
    if (!id || visited.has(id)) return;
    visited.add(id);
    ordered.push({ question, depth });
    (children.get(id) || []).forEach((child) => append(child, depth + 1));
  };
  list
    .filter((question) => {
      const parentId = String(question.parentQuestionId || "");
      return !parentId || parentId === question.id || !ids.has(parentId);
    })
    .forEach((question) => append(question));
  list.forEach((question) => append(question));
  return ordered;
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

export const reorderProductionMaterialSourceSites = (sites = [], sourceId = "", targetId = "") =>
  reorderProductionItems(sites, sourceId, targetId);

export const reorderProductionTemplates = (templates = [], sourceId = "", targetId = "") =>
  reorderProductionItems(templates, sourceId, targetId);

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
    retakeAnnotations: normalizeRetakeInstructions(
      line.retakeAnnotations,
      stripRubyNotation(String(line.text || line.line || ""))
    ),
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
  delete sharedProject.auditionFormsFolderUrl;
  delete sharedProject.auditionManagementSheetUrl;
  delete sharedProject.auditionSocialTemplate;
  delete sharedProject.contactTemplateSheetUrl;
  delete sharedProject.contactTemplateSchemaVersion;
  delete sharedProject.contactTemplates;
  delete sharedProject.contactMessageDrafts;
  delete sharedProject.manualContactRecipients;
  delete sharedProject.otherRoleContact;
  delete sharedProject.socialTemplates;
  delete sharedProject.socialMessageDrafts;
  delete sharedProject.auditionApplicants;
  delete sharedProject.auditionApplicantsImportedAt;
  delete sharedProject.auditionFormFolderUrl;
  delete sharedProject.auditionFormUrl;
  delete sharedProject.auditionUrl;
  sharedProject.auditionRoleProgress = (sharedProject.auditionRoleProgress || []).map((progress) => {
    const publicProgress = { ...progress };
    delete publicProgress.formEditUrl;
    delete publicProgress.formResponderUrl;
    delete publicProgress.headerImageUrl;
    delete publicProgress.socialImageUrl;
    delete publicProgress.auditionRoleSummary;
    delete publicProgress.auditionAcceptsFemaleApplicants;
    delete publicProgress.auditionAcceptsMaleApplicants;
    delete publicProgress.auditionLines;
    delete publicProgress.auditionDeadline;
    delete publicProgress.socialPostText;
    delete publicProgress.socialPostUpdatedAt;
    delete publicProgress.pcFinishMessage;
    return publicProgress;
  });
  return sharedProject;
};

export const createRecordingAccessKey = () => {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

const getActorNameKey = (value = "") => String(value || "")
  .normalize("NFKC")
  .trim()
  .toLocaleLowerCase("ja");

export const normalizeXProfileUrl = (value = "") => {
  const source = String(value || "").normalize("NFKC").trim();
  if (!source) return "";
  const handleMatch = source.match(/^@([A-Za-z0-9_]{1,15})$/);
  if (handleMatch) return `https://x.com/${handleMatch[1]}`;
  const bareHandleMatch = source.match(/^([A-Za-z0-9_]{1,15})$/);
  if (bareHandleMatch) return `https://x.com/${bareHandleMatch[1]}`;
  try {
    const candidate = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
    const host = candidate.hostname.toLocaleLowerCase("en").replace(/^www\./, "");
    if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) return source;
    const handle = candidate.pathname.split("/").filter(Boolean)[0] || "";
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `https://x.com/${handle}` : source;
  } catch {
    return source;
  }
};

export const getActorContactName = (member = {}) => {
  const explicitName = String(member.contactName || "").trim();
  if (explicitName) return explicitName.replace(/(?:さん|さま|様)$/u, "").trim();
  const actorName = String(member.actorName || "").trim().replace(/(?:さん|さま|様)$/u, "").trim();
  return actorName || "声優さん";
};

export const getActorContactHonorific = (member = {}) => (
  Object.prototype.hasOwnProperty.call(member, "contactHonorific")
    ? String(member.contactHonorific || "").trim()
    : "さん"
);

const LOW_DIALOGUE_COUNT_NOTICE = "こちらセリフ数は少ないのですが、";
const LOW_DIALOGUE_COUNT_CONTINUATION = "もしよかったらサンプルにあった";

export const applyProductionContactDialogueCountNotice = (body = "", dialogueCount = null) => {
  const source = String(body || "");
  if (dialogueCount === null || dialogueCount === undefined || dialogueCount === "") return source;
  const normalizedCount = Number(dialogueCount);
  if (!Number.isFinite(normalizedCount)) return source;
  if (Math.max(0, Math.trunc(normalizedCount)) <= 4) {
    if (source.includes(LOW_DIALOGUE_COUNT_NOTICE)) return source;
    return source.replace(
      LOW_DIALOGUE_COUNT_CONTINUATION,
      `${LOW_DIALOGUE_COUNT_NOTICE}${LOW_DIALOGUE_COUNT_CONTINUATION}`
    );
  }
  return source.replaceAll(LOW_DIALOGUE_COUNT_NOTICE, "");
};

export const isOtherRoleRequestContactTemplate = (template = {}) => (
  template.id === "contact_template_other_role"
  || String(template.name || "").trim() === "別の役を依頼"
);

export const isRetakeRequestContactTemplate = (template = {}) => (
  template.id === "contact_template_retake"
  || String(template.name || "").trim() === "リテイクのお願い"
);

export const getProductionCharacterRetakes = (project = {}, characterId = "") => (
  getRecordingDisplayProject(project).lines || []
).filter((line) => (
  line?.characterId === characterId
  && line.kind !== "direction"
  && line.reviewStatus === "リテイク"
)).sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  .map((line, index) => {
    const text = stripRubyNotation(String(line.text || "")).trim();
    const instructions = normalizeRetakeInstructions(line.retakeAnnotations, text).map((instruction) => {
      const accent = instruction.reading
        ? buildManualAccentPattern(instruction.reading, instruction.accentType, instruction.accentRiseAt)
        : null;
      return {
        ...instruction,
        accentNotation: accent?.notation || "",
        accentInstruction: accent?.instruction || ""
      };
    });
    return {
      id: String(line.id || `retake_line_${index + 1}`),
      order: Number.isFinite(Number(line.order)) ? Number(line.order) : index + 1,
      chapterTitle: String(line.chapterTitle || "章未設定"),
      sceneTitle: String(line.sceneTitle || "シーン未設定"),
      performanceType: normalizeLinePerformanceType(line.performanceType),
      text,
      directorNote: String(line.directorNote || "").trim(),
      instructions
    };
  });

const buildProductionRetakeSection = (retake = {}, displayNumber = 1) => {
  const instructionBlocks = (retake.instructions || []).map((instruction) => {
    const lines = [
      instruction.quote
        ? `・「${instruction.quote}」`
        : "・台本ツールで指定した箇所"
    ];
    if (instruction.reading) lines.push(`読み：${instruction.reading}`);
    if (instruction.accentNotation) {
      lines.push(`アクセント：${instruction.accentNotation}`);
      if (instruction.accentInstruction) lines.push(`高低の目安：${instruction.accentInstruction}`);
    }
    if (instruction.instruction) lines.push("", instruction.instruction);
    return lines.join("\n");
  });
  const sections = [
    `【${displayNumber}】セリフ番号：${String(retake.order).padStart(3, "0")}${retake.performanceType !== "通常" ? ` / ${retake.performanceType}` : ""}`
  ];
  if (instructionBlocks.length) sections.push(instructionBlocks.join("\n\n"));
  if (retake.directorNote) sections.push(`確認メモ：\n${retake.directorNote}`);
  if (!instructionBlocks.length && !retake.directorNote) {
    sections.push("確認メモ：\n台本ツールの該当セリフにあるリテイク表示をご確認ください。");
  }
  return sections.join("\n\n");
};

export const buildProductionRetakeList = (project = {}, characterId = "") => {
  const retakes = getProductionCharacterRetakes(project, characterId);
  if (!retakes.length) return "現在、リテイク指定はありません。";
  return retakes.map((retake, index) => buildProductionRetakeSection(retake, index + 1)).join("\n\n");
};

const buildProductionRetakeListFromItems = (retakes = []) => (
  (Array.isArray(retakes) ? retakes : [])
    .map((retake, index) => buildProductionRetakeSection(retake, index + 1))
    .join("\n\n")
);

const normalizeRetakeDraftText = (value = "") => String(value || "")
  .normalize("NFKC")
  .replace(/\s+/gu, "")
  .trim();

const productionRetakeIsInDraft = (body = "", retake = {}) => {
  const source = String(body || "");
  const order = Number(retake.order);
  if (Number.isFinite(order) && order > 0) {
    const lineNumberPattern = new RegExp(`セリフ番号\\s*[：:]\\s*0*${Math.trunc(order)}(?:\\D|$)`, "u");
    if (lineNumberPattern.test(source)) return true;
  }

  const normalizedSource = normalizeRetakeDraftText(source);
  const textCandidates = [
    retake.text,
    ...(retake.instructions || []).map((instruction) => instruction.quote)
  ].map(normalizeRetakeDraftText).filter((candidate) => candidate.length >= 4);
  return textCandidates.some((candidate) => normalizedSource.includes(candidate));
};

export const mergeMissingProductionRetakesIntoDraft = (body = "", retakes = []) => {
  const source = String(body || "");
  const normalizedRetakes = Array.isArray(retakes) ? retakes : [];
  const latestList = buildProductionRetakeListFromItems(normalizedRetakes);
  const firstSectionMatch = /(^|\n)【\d+】[^\n]*(?=\n|$)/u.exec(source);
  if (firstSectionMatch && latestList) {
    const sectionStart = firstSectionMatch.index + firstSectionMatch[1].length;
    const closingMarkers = [
      "\n\nお手数をおかけ",
      "\n\n再収録したファイルは",
      "\n\n分かりにくい点や確認したいこと"
    ];
    const closingIndex = closingMarkers
      .map((marker) => source.indexOf(marker, sectionStart))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0] ?? source.length;
    const synced = `${source.slice(0, sectionStart).trimEnd()}${source.slice(0, sectionStart).trimEnd() ? "\n\n" : ""}${latestList}${closingIndex < source.length ? `\n\n${source.slice(closingIndex).trimStart()}` : ""}`.trim();
    return synced;
  }

  const missingRetakes = normalizedRetakes
    .filter((retake) => !productionRetakeIsInDraft(source, retake));
  if (!missingRetakes.length) return source;

  const usedNumbers = [...source.matchAll(/【(\d+)】/gu)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const firstNewNumber = Math.max(0, ...usedNumbers) + 1;
  const additions = missingRetakes
    .map((retake, index) => buildProductionRetakeSection(retake, firstNewNumber + index))
    .join("\n\n");
  const closingMarkers = [
    "\n\nお手数をおかけ",
    "\n\n再収録したファイルは",
    "\n\n分かりにくい点や確認したいこと"
  ];
  const insertionIndex = closingMarkers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (insertionIndex === undefined) return `${source.trimEnd()}\n\n${additions}`.trim();
  return `${source.slice(0, insertionIndex).trimEnd()}\n\n${additions}\n\n${source.slice(insertionIndex).trimStart()}`;
};

export const buildProductionContactMessage = (template = {}, {
  actorName = "声優",
  actorHonorific = "さん",
  roleName = "役名",
  offeredRoleName = "別の役",
  offeredRoleDialogueCount = null,
  appearanceLabel = "登場章未設定",
  projectTitle = "作品名",
  retakeList = "現在、リテイク指定はありません。"
} = {}) => {
  const honorific = String(actorHonorific || "").trim();
  const addressedActorName = honorific && !String(actorName).endsWith(honorific)
    ? `${actorName}${honorific}`
    : String(actorName);
  const appearanceSentence = appearanceLabel === "全章にわたって"
    ? `${offeredRoleName}は全章にわたって登場します。`
    : `${offeredRoleName}は${appearanceLabel}に登場します。`;
  const templateBody = isRetakeRequestContactTemplate(template)
    ? sanitizeProductionRetakeMessageBody(template.body)
    : String(template.body || "");
  const body = applyProductionContactDialogueCountNotice(
    templateBody
      .replaceAll("◆◆は第■章で出てきます。", appearanceSentence)
      .replaceAll("{{登場案内}}", appearanceSentence)
      .replaceAll("【作品名／役名】", `【${projectTitle}／${roleName}】`)
      .replaceAll("【作品名/役名】", `【${projectTitle}／${roleName}】`)
      .replaceAll("【作品名】", `【${projectTitle}】`)
      .replaceAll("{{声優名}}", actorName)
      .replaceAll("{{呼称}}", honorific)
      .replaceAll("{{役名}}", roleName)
      .replaceAll("{{別役名}}", offeredRoleName)
      .replaceAll("{{登場章}}", appearanceLabel)
      .replaceAll("{{作品名}}", projectTitle)
      .replaceAll("{{リテイク一覧}}", retakeList)
      .replaceAll("△△", roleName)
      .replaceAll("◆◆", offeredRoleName)
      .replaceAll("第■章", appearanceLabel)
      .replaceAll("〇〇さん", addressedActorName)
      .replaceAll("〇〇様", addressedActorName),
    offeredRoleDialogueCount
  );
  const normalizeRecipientHonorific = (source) => {
    if (!honorific || !addressedActorName) return source;
    return String(source).replaceAll(`${addressedActorName}${honorific}`, addressedActorName);
  };

  if (template.category === "募集告知") {
    return normalizeRecipientHonorific(body
      .replace("作品名：〇〇", `作品名：${projectTitle}`)
      .replace("募集役：〇〇", `募集役：${roleName}`));
  }

  if (template.category === "確認依頼") {
    return normalizeRecipientHonorific(body);
  }

  return normalizeRecipientHonorific(body.replaceAll("〇〇", actorName));
};

export const formatProductionSocialRoleSelection = (roleNames = []) => [...new Set(
  (Array.isArray(roleNames) ? roleNames : [])
    .map((roleName) => String(roleName || "").trim().replace(/役$/u, "").trim())
    .filter(Boolean)
)].map((roleName) => `「${roleName}」役`).join("・");

export const applyProductionSocialRoleSelection = (
  body = "",
  roleNames = [],
  previousRoleNames = []
) => {
  const source = String(body || "");
  const nextSelection = formatProductionSocialRoleSelection(roleNames) || "「〇〇」役";
  const previousSelection = formatProductionSocialRoleSelection(previousRoleNames);
  if (previousSelection && source.includes(previousSelection)) {
    return source.replaceAll(previousSelection, nextSelection);
  }
  return source
    .replaceAll("{{役名一覧}}", nextSelection)
    .replaceAll("「〇〇」役", nextSelection)
    .replace(
      /「[^「」\r\n]+」役(?:・「[^「」\r\n]+」役)*(?=\s*をお願いさせていただく方へ、)/u,
      nextSelection
    );
};

export const buildProductionSocialMessage = (template = {}, {
  projectTitle = "作品名",
  roleNames = []
} = {}) => applyProductionSocialRoleSelection(
  String(template.body || "").replaceAll("{{作品名}}", projectTitle),
  roleNames
);

const isActorNameCorrection = (previousName = "", nextName = "") => {
  const previousKey = getActorNameKey(previousName).replace(/[\s・._-]+/g, "");
  const nextKey = getActorNameKey(nextName).replace(/[\s・._-]+/g, "");
  return previousKey.length >= 2
    && nextKey.length >= 2
    && (previousKey.includes(nextKey) || nextKey.includes(previousKey));
};

export const assignProductionActorName = (project = {}, characterId = "", actorName = "") => {
  const name = String(actorName || "").trim();
  const members = Array.isArray(project.castMembers) ? project.castMembers : [];
  const currentMember = members.find((member) => member.characterIds?.includes(characterId));
  const withoutCharacter = members.map((member) => ({
    ...member,
    characterIds: (Array.isArray(member.characterIds) ? member.characterIds : [])
      .filter((id) => id !== characterId)
  }));

  if (!name) return { ...project, castMembers: withoutCharacter };

  const actorKey = getActorNameKey(name);
  const matchingMember = members.find((member) => getActorNameKey(member.actorName) === actorKey);
  if (matchingMember) {
    return {
      ...project,
      castMembers: withoutCharacter.map((member) => member.id === matchingMember.id
        ? { ...member, actorName: name, characterIds: [...new Set([...member.characterIds, characterId])] }
        : member)
    };
  }

  // A name correction for a single-role actor must keep SNS, contact and the share URL key.
  if (currentMember
    && currentMember.characterIds?.length === 1
    && isActorNameCorrection(currentMember.actorName, name)) {
    return {
      ...project,
      castMembers: members.map((member) => member.id === currentMember.id
        ? { ...member, actorName: name }
        : member)
    };
  }

  return {
    ...project,
    castMembers: [...withoutCharacter, {
      id: createLocalId("cast"),
      actorName: name,
      contactName: "",
      contactHonorific: "さん",
      contact: "",
      socialUrl: "",
      characterIds: [characterId],
      wpUserId: 0,
      accessKey: createRecordingAccessKey()
    }]
  };
};

const normalizeAuditionApplicant = (applicant = {}, index = 0) => {
  const responseId = String(applicant.responseId || "").trim();
  const formId = String(applicant.formId || "").trim();
  const name = String(applicant.name || applicant.actorName || "").trim();
  const submittedAt = String(applicant.submittedAt || "").trim();
  const socialInput = String(applicant.socialInput || applicant.socialUrl || "").trim();
  const identity = responseId || [formId, submittedAt, name, socialInput].join("|") || String(index);
  const status = PRODUCTION_AUDITION_APPLICANT_STATUSES.includes(applicant.status)
    ? applicant.status
    : "未選考";
  return {
    id: String(applicant.id || makeStableScopeId("audition_applicant", identity)),
    responseId,
    formId,
    sourceCharacterId: String(applicant.sourceCharacterId || applicant.characterId || ""),
    sourceRoleName: String(applicant.sourceRoleName || applicant.roleName || ""),
    name,
    contactName: String(applicant.contactName || ""),
    contactHonorific: Object.prototype.hasOwnProperty.call(applicant, "contactHonorific")
      ? String(applicant.contactHonorific || "").trim()
      : "さん",
    socialInput,
    socialUrl: normalizeXProfileUrl(applicant.socialUrl || socialInput),
    submittedAt,
    status,
    assignedCharacterId: String(applicant.assignedCharacterId || ""),
    updatedAt: String(applicant.updatedAt || "")
  };
};

export const mergeProductionAuditionApplicants = (currentApplicants = [], importedApplicants = []) => {
  const existingByIdentity = new Map();
  (Array.isArray(currentApplicants) ? currentApplicants : []).forEach((applicant, index) => {
    const normalized = normalizeAuditionApplicant(applicant, index);
    const key = normalized.responseId || normalized.id;
    existingByIdentity.set(key, normalized);
  });
  (Array.isArray(importedApplicants) ? importedApplicants : []).forEach((applicant, index) => {
    const normalized = normalizeAuditionApplicant(applicant, index);
    if (!normalized.name) return;
    const key = normalized.responseId || normalized.id;
    const existing = existingByIdentity.get(key);
    existingByIdentity.set(key, existing ? {
      ...normalized,
      id: existing.id,
      contactName: existing.contactName,
      contactHonorific: existing.contactHonorific,
      status: existing.status,
      assignedCharacterId: existing.assignedCharacterId,
      updatedAt: existing.updatedAt
    } : normalized);
  });
  return [...existingByIdentity.values()].sort((left, right) =>
    String(right.submittedAt).localeCompare(String(left.submittedAt)));
};

const getAuditionRoleNameKey = (value = "") => String(value || "")
  .normalize("NFKC")
  .replace(/\s+/gu, "")
  .toLocaleLowerCase("ja");

export const groupProductionAuditionApplicantsByRole = (project = {}, applicants = project.auditionApplicants || []) => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const characterByName = new Map(characters.map((character) => [getAuditionRoleNameKey(character.name), character]));
  const characterOrder = new Map(characters.map((character, index) => [character.id, index]));
  const groups = new Map();

  (Array.isArray(applicants) ? applicants : []).forEach((applicant, index) => {
    const sourceRoleName = String(applicant.sourceRoleName || "").trim();
    const sourceCharacter = characterById.get(applicant.sourceCharacterId)
      || characterByName.get(getAuditionRoleNameKey(sourceRoleName));
    const characterId = String(sourceCharacter?.id || applicant.sourceCharacterId || "");
    const roleName = String(sourceCharacter?.name || sourceRoleName || "応募役未設定");
    const key = characterId ? `character:${characterId}` : `role:${getAuditionRoleNameKey(roleName) || "unset"}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        characterId,
        roleName,
        color: sourceCharacter?.color || "#168b9a",
        order: characterOrder.has(characterId) ? characterOrder.get(characterId) : characters.length + index,
        applicants: []
      });
    }
    groups.get(key).applicants.push(applicant);
  });

  return [...groups.values()].sort((left, right) => left.order - right.order);
};

export const assignProductionAuditionApplicant = (project = {}, applicantId = "", characterId = "") => {
  const applicant = (project.auditionApplicants || []).find((item) => item.id === applicantId);
  if (!applicant || !characterId || !String(applicant.name || "").trim()) return project;
  const assigned = assignProductionActorName(project, characterId, applicant.name);
  const member = assigned.castMembers.find((item) => item.characterIds?.includes(characterId));
  const contactName = String(applicant.contactName || "").trim()
    || getActorContactName({ actorName: applicant.name });
  const contactHonorific = Object.prototype.hasOwnProperty.call(applicant, "contactHonorific")
    ? String(applicant.contactHonorific || "").trim()
    : "さん";
  return {
    ...assigned,
    castMembers: assigned.castMembers.map((item) => item.id === member?.id ? {
      ...item,
      actorName: applicant.name,
      contactName,
      contactHonorific,
      socialUrl: normalizeXProfileUrl(applicant.socialUrl || applicant.socialInput)
    } : item),
    auditionApplicants: (assigned.auditionApplicants || []).map((item) => item.id === applicantId ? {
      ...item,
      contactName,
      contactHonorific,
      status: "合格",
      assignedCharacterId: characterId,
      updatedAt: new Date().toISOString()
    } : item)
  };
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
  recordingDeadlineTime: "",
  releaseDate: "",
  releaseTime: "",
  editingStatus: "未着手",
  characters: [],
  castMembers: [],
  lines: [],
  materials: [],
  requiredMaterials: [],
  dismissedRequiredMaterialKeys: [],
  materialSourceSites: [],
  requiredMaterialFolderUrl: "",
  requiredMaterialChapterFolders: [],
  questions: [],
  tasks: [],
  auditionFormsFolderUrl: "",
  auditionManagementSheetUrl: DEFAULT_AUDITION_MANAGEMENT_SHEET_URL,
  auditionSocialTemplate: createDefaultAuditionSocialTemplate(),
  contactTemplateSheetUrl: DEFAULT_CONTACT_TEMPLATE_SHEET_URL,
  contactTemplateSchemaVersion: PRODUCTION_CONTACT_TEMPLATE_SCHEMA_VERSION,
  contactTemplates: createDefaultProductionContactTemplates(),
  contactMessageDrafts: [],
  manualContactRecipients: [],
  otherRoleContact: {
    contactName: "",
    contactHonorific: "さん",
    socialUrl: "",
    sourceCharacterId: "",
    sourceRoleName: ""
  },
  socialTemplates: createDefaultProductionSocialTemplates(),
  socialMessageDrafts: [],
  auditionApplicants: [],
  auditionApplicantsImportedAt: "",
  auditionRoleProgress: [],
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
        contactName: "",
        contactHonorific: "さん",
        contact: "",
        socialUrl: "",
        characterIds: ["character_vel"],
        accessKey: ""
      },
      {
        id: "cast_amamori",
        actorName: "アマモリ役 声優さん",
        contactName: "",
        contactHonorific: "さん",
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
    recordingDeadlineTime: "18:00",
    releaseDate: "2026-10-01",
    releaseTime: "20:00",
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
    requiredMaterials: [],
    dismissedRequiredMaterialKeys: [],
    materialSourceSites: [],
    requiredMaterialFolderUrl: "",
    requiredMaterialChapterFolders: [],
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
    tasks: [],
    auditionFormsFolderUrl: "",
    auditionManagementSheetUrl: DEFAULT_AUDITION_MANAGEMENT_SHEET_URL,
    auditionSocialTemplate: createDefaultAuditionSocialTemplate(),
    contactTemplateSheetUrl: DEFAULT_CONTACT_TEMPLATE_SHEET_URL,
    contactTemplateSchemaVersion: PRODUCTION_CONTACT_TEMPLATE_SCHEMA_VERSION,
    contactTemplates: createDefaultProductionContactTemplates(),
    contactMessageDrafts: [],
    manualContactRecipients: [],
    otherRoleContact: {
      contactName: "",
      contactHonorific: "さん",
      socialUrl: "",
      sourceCharacterId: "",
      sourceRoleName: ""
    },
    socialTemplates: createDefaultProductionSocialTemplates(),
    socialMessageDrafts: [],
    auditionApplicants: [],
    auditionApplicantsImportedAt: "",
    auditionRoleProgress: [],
    scheduleItems: [
      {
        id: "schedule_sample_001",
        type: "収録締切",
        title: "第一章の初回収録",
        date: "2026-08-15",
        time: "18:00",
        status: "予定",
        notes: "担当セリフを一度提出してください。"
      },
      {
        id: "schedule_sample_002",
        type: "編集",
        title: "音声編集・リテイク確認",
        date: "2026-09-15",
        time: "",
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

export const applyRecordingProjectUpdate = (project = {}, updater, updatedAt = new Date().toISOString()) => {
  const next = typeof updater === "function"
    ? updater(project)
    : { ...project, ...(updater && typeof updater === "object" ? updater : {}) };
  if (!next || typeof next !== "object" || Array.isArray(next) || next === project) return project;
  return { ...next, updatedAt: String(updatedAt || new Date().toISOString()) };
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
      retakeAnnotations: normalizeRetakeInstructions(
        line.retakeAnnotations,
        stripRubyNotation(String(line.text || line.line || ""))
      ),
      fieldUpdatedAt: normalizeProgressTimes(line.fieldUpdatedAt),
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
        retakeAnnotations: normalizeRetakeInstructions(progress.retakeAnnotations),
        fieldUpdatedAt: normalizeProgressTimes(progress.fieldUpdatedAt),
        updatedAt: String(progress.updatedAt || "")
      }])
  );
  const rawOtherRoleContact = project.otherRoleContact && typeof project.otherRoleContact === "object"
    ? project.otherRoleContact
    : {};
  const legacyOtherRoleDraft = [...(Array.isArray(project.contactMessageDrafts) ? project.contactMessageDrafts : [])]
    .filter((draft) => draft?.templateId === "contact_template_other_role")
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))[0];
  const legacyRecipientMatch = String(legacyOtherRoleDraft?.body || "").match(/^([^\r\n、]{1,80}?)(さん|さま|様)、初めてメッセージ/u);
  const requestedOtherRoleCharacterId = rawOtherRoleContact.sourceCharacterId || legacyOtherRoleDraft?.characterId || "";
  const normalizedOtherRoleCharacterId = characterIdAliases.get(requestedOtherRoleCharacterId) || requestedOtherRoleCharacterId;
  const otherRoleCharacter = characters.find((character) => character.id === normalizedOtherRoleCharacterId);

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
    recordingDeadlineTime: normalizeScheduleTime(project.recordingDeadlineTime || project.deadlineTime),
    releaseDate: String(project.releaseDate || ""),
    releaseTime: normalizeScheduleTime(project.releaseTime),
    editingStatus: String(project.editingStatus || "未着手"),
    characters,
    recordingFolderOrder,
    castMembers: (Array.isArray(project.castMembers) ? project.castMembers : []).map((member, memberIndex) => ({
      id: member.id || createLocalId("cast"),
      actorName: member.actorName || `声優さん${memberIndex + 1}`,
      contactName: String(member.contactName || member.shortName || ""),
      contactHonorific: Object.prototype.hasOwnProperty.call(member, "contactHonorific")
        ? String(member.contactHonorific || "").trim()
        : "さん",
      contact: member.contact || "",
      socialUrl: normalizeXProfileUrl(member.socialUrl || member.snsUrl || member.socialMediaUrl || ""),
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
    deletedQuestionIds: [...new Set((Array.isArray(project.deletedQuestionIds) ? project.deletedQuestionIds : []).map(String))],
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
    requiredMaterials: (Array.isArray(project.requiredMaterials) ? project.requiredMaterials : []).map((material, materialIndex) => {
      const source = material.source === "script" ? "script" : "manual";
      const id = String(material.id || createLocalId("required_material"));
      return {
        id,
        source,
        cueKey: String(material.cueKey || (source === "manual" ? `manual:${id}` : "")),
        chapterId: String(material.chapterId || ""),
        chapterTitle: String(material.chapterTitle || ""),
        category: PRODUCTION_MATERIAL_CATEGORIES.includes(material.category) ? material.category : "SE",
        title: String(material.title || `必要素材${materialIndex + 1}`),
        searchQuery: String(material.searchQuery || material.title || ""),
        notes: String(material.notes || ""),
        sourceSiteId: String(material.sourceSiteId || ""),
        candidateTitle: String(material.candidateTitle || ""),
        candidatePageUrl: String(material.candidatePageUrl || ""),
        previewUrl: String(material.previewUrl || ""),
        downloadUrl: String(material.downloadUrl || ""),
        confirmedMaterialId: String(material.confirmedMaterialId || ""),
        commonSeName: String(material.commonSeName || ""),
        sePrompt: normalizeSePromptDraft(material.sePrompt, material),
        updatedAt: String(material.updatedAt || "")
      };
    }),
    dismissedRequiredMaterialKeys: [...new Set(
      (Array.isArray(project.dismissedRequiredMaterialKeys) ? project.dismissedRequiredMaterialKeys : [])
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    )],
    materialSourceSites: (Array.isArray(project.materialSourceSites) ? project.materialSourceSites : []).map((site, siteIndex) => ({
      id: String(site.id || createLocalId("material_source")),
      name: String(site.name || `SE配布サイト${siteIndex + 1}`),
      homeUrl: String(site.homeUrl || ""),
      searchUrlTemplate: String(site.searchUrlTemplate || site.searchUrl || ""),
      licenseUrl: String(site.licenseUrl || ""),
      notes: String(site.notes || "")
    })),
    requiredMaterialFolderUrl: String(project.requiredMaterialFolderUrl || ""),
    requiredMaterialChapterFolders: (Array.isArray(project.requiredMaterialChapterFolders)
      ? project.requiredMaterialChapterFolders
      : []).map((folder) => ({
      chapterId: String(folder?.chapterId || ""),
      chapterTitle: String(folder?.chapterTitle || ""),
      url: String(folder?.url || folder?.folderUrl || "")
    })).filter((folder) => folder.chapterId || folder.chapterTitle || folder.url),
    questions: (Array.isArray(project.questions) ? project.questions : []).map((question) => ({
      id: question.id || createLocalId("question"),
      lineId: String(question.lineId || ""),
      characterId: characterIds.has(characterIdAliases.get(question.characterId) || question.characterId)
        ? characterIdAliases.get(question.characterId) || question.characterId
        : "",
      authorName: String(question.authorName || "メンバー"),
      wpUserId: Number.isFinite(Number(question.wpUserId)) ? Number(question.wpUserId) : 0,
      castMemberId: String(question.castMemberId || ""),
      parentQuestionId: String(question.parentQuestionId || ""),
      body: String(question.body || question.question || ""),
      answer: String(question.answer || ""),
      status: PRODUCTION_QUESTION_STATUSES.includes(question.status) ? question.status : "未回答",
      createdAt: String(question.createdAt || new Date().toISOString()),
      updatedAt: String(question.updatedAt || question.createdAt || "")
    })),
    tasks: (Array.isArray(project.tasks) ? project.tasks : []).map((task, taskIndex) => ({
      id: task.id || createLocalId("task"),
      title: String(task.title || `タスク${taskIndex + 1}`),
      completed: Boolean(task.completed ?? task.status === "完了"),
      priority: PRODUCTION_TASK_PRIORITIES.includes(task.priority) ? task.priority : "通常",
      dueDate: String(task.dueDate || task.date || "").slice(0, 10),
      notes: String(task.notes || task.description || ""),
      createdAt: String(task.createdAt || new Date().toISOString()),
      updatedAt: String(task.updatedAt || task.createdAt || "")
    })),
    contactTemplateSheetUrl: String(project.contactTemplateSheetUrl || DEFAULT_CONTACT_TEMPLATE_SHEET_URL),
    contactTemplateSchemaVersion: PRODUCTION_CONTACT_TEMPLATE_SCHEMA_VERSION,
    contactTemplates: migrateProductionContactTemplates(project).map((template, templateIndex) => ({
      id: String(template.id || createLocalId("contact_template")),
      category: String(template.category || "その他"),
      name: String(template.name || template.title || `連絡テンプレート${templateIndex + 1}`),
      body: template.id === "contact_template_other_role"
        ? String(template.body || template.text || "").replace(
            "酔っ払いのキャラクター画像はこちらになります＾＾",
            "◆◆のキャラクター画像はこちらになります＾＾"
          )
        : template.id === "contact_template_retake" || String(template.name || "").trim() === "リテイクのお願い"
          ? sanitizeProductionRetakeMessageBody(template.body || template.text || "")
          : String(template.body || template.text || ""),
      notes: String(template.notes || template.memo || ""),
      enabled: template.enabled !== false && template.inUse !== false,
      updatedAt: String(template.updatedAt || "")
    })),
    contactMessageDrafts: (Array.isArray(project.contactMessageDrafts) ? project.contactMessageDrafts : []).map((draft) => ({
      id: String(draft.id || createLocalId("contact_message")),
      templateId: String(draft.templateId || ""),
      characterId: String(draft.characterId || ""),
      applicantId: String(draft.applicantId || ""),
      targetKey: String(draft.targetKey || ""),
      offeredCharacterId: String(draft.offeredCharacterId || ""),
      body: draft.templateId === "contact_template_retake"
        ? sanitizeProductionRetakeMessageBody(draft.body)
        : String(draft.body || ""),
      updatedAt: String(draft.updatedAt || "")
    })),
    manualContactRecipients: (Array.isArray(project.manualContactRecipients) ? project.manualContactRecipients : []).map((recipient) => ({
      id: String(recipient.id || createLocalId("contact_recipient")),
      actorName: String(recipient.actorName || recipient.name || ""),
      contactName: String(recipient.contactName || ""),
      contactHonorific: Object.prototype.hasOwnProperty.call(recipient, "contactHonorific")
        ? String(recipient.contactHonorific || "").trim()
        : "さん",
      socialUrl: normalizeXProfileUrl(recipient.socialUrl || recipient.socialInput || ""),
      sourceCharacterId: characterIds.has(characterIdAliases.get(recipient.sourceCharacterId) || recipient.sourceCharacterId)
        ? characterIdAliases.get(recipient.sourceCharacterId) || recipient.sourceCharacterId
        : "",
      sourceRoleName: String(recipient.sourceRoleName || "")
    })),
    otherRoleContact: {
      contactName: String(rawOtherRoleContact.contactName || legacyRecipientMatch?.[1] || ""),
      contactHonorific: Object.prototype.hasOwnProperty.call(rawOtherRoleContact, "contactHonorific")
        ? String(rawOtherRoleContact.contactHonorific || "").trim()
        : String(legacyRecipientMatch?.[2] || "さん"),
      socialUrl: normalizeXProfileUrl(rawOtherRoleContact.socialUrl || rawOtherRoleContact.socialInput || ""),
      sourceCharacterId: otherRoleCharacter?.id || "",
      sourceRoleName: String(rawOtherRoleContact.sourceRoleName || otherRoleCharacter?.name || "")
    },
    socialTemplates: (Array.isArray(project.socialTemplates)
      ? project.socialTemplates
      : createDefaultProductionSocialTemplates()
    ).map((template, templateIndex) => ({
      id: String(template.id || createLocalId("social_template")),
      category: String(template.category || "お知らせ"),
      name: String(template.name || template.title || `SNSテンプレート${templateIndex + 1}`),
      body: String(template.body || template.text || ""),
      notes: String(template.notes || template.memo || ""),
      enabled: template.enabled !== false && template.inUse !== false,
      updatedAt: String(template.updatedAt || "")
    })),
    socialMessageDrafts: (Array.isArray(project.socialMessageDrafts) ? project.socialMessageDrafts : []).map((draft) => ({
      id: String(draft.id || createLocalId("social_message")),
      templateId: String(draft.templateId || ""),
      characterIds: [...new Set((Array.isArray(draft.characterIds) ? draft.characterIds : [])
        .map((characterId) => String(characterId || "").trim())
        .filter(Boolean))],
      body: String(draft.body || ""),
      updatedAt: String(draft.updatedAt || "")
    })),
    auditionApplicants: mergeProductionAuditionApplicants(project.auditionApplicants, []),
    auditionApplicantsImportedAt: String(project.auditionApplicantsImportedAt || ""),
    auditionFormsFolderUrl: String(
      project.auditionFormsFolderUrl
      || project.auditionFormFolderUrl
      || project.auditionFormUrl
      || project.auditionUrl
      || ""
    ),
    auditionManagementSheetUrl: String(
      project.auditionManagementSheetUrl
      || DEFAULT_AUDITION_MANAGEMENT_SHEET_URL
    ),
    auditionSocialTemplate: normalizeAuditionSocialTemplate(project.auditionSocialTemplate),
    auditionRoleProgress: normalizeAuditionRoleProgress(project.auditionRoleProgress),
    scheduleItems: (Array.isArray(project.scheduleItems) ? project.scheduleItems : []).map((item, itemIndex) => {
      const scheduleDateTime = normalizeScheduleDateTime(item);
      return {
        id: item.id || createLocalId("schedule"),
        type: PRODUCTION_SCHEDULE_TYPES.includes(item.type) ? item.type : "その他",
        title: String(item.title || `予定${itemIndex + 1}`),
        date: scheduleDateTime.date,
        time: scheduleDateTime.time,
        status: PRODUCTION_SCHEDULE_STATUSES.includes(item.status) ? item.status : "予定",
        notes: String(item.notes || ""),
        sourceKey: String(item.sourceKey || "")
      };
    }),
    deadlineItems: (Array.isArray(project.deadlineItems) ? project.deadlineItems : []).map((item, itemIndex) => {
      const scheduleDateTime = normalizeScheduleDateTime(item);
      return {
        id: item.id || createLocalId("deadline"),
        type: PRODUCTION_SCHEDULE_TYPES.includes(item.type) ? item.type : "その他",
        title: String(item.title || `期日${itemIndex + 1}`),
        date: scheduleDateTime.date,
        time: scheduleDateTime.time,
        status: PRODUCTION_SCHEDULE_STATUSES.includes(item.status) ? item.status : "予定",
        notes: String(item.notes || "")
      };
    }),
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
  const progress = { ...(localProject.derivedLineProgress || {}) };
  for (const [id, remote] of Object.entries(remoteProject?.derivedLineProgress || {})) {
    progress[id] = mergeRecordingProgress(progress[id] || remote, remote);
  }
  const questions = new Map((localProject.questions || []).map((question) => [question.id, question]));
  const deletedQuestionIds = [...new Set([...(localProject.deletedQuestionIds || []), ...(remoteProject?.deletedQuestionIds || [])])];
  for (const question of remoteProject?.questions || []) {
    if (!questions.has(question.id) || String(question.updatedAt || "") >= String(questions.get(question.id).updatedAt || "")) questions.set(question.id, question);
  }
  for (const id of deletedQuestionIds) questions.delete(id);
  return normalizeRecordingProject({
    ...localProject,
    sharedAt: remoteProject?.sharedAt || localProject.sharedAt,
    updatedAt: remoteProject?.updatedAt || localProject.updatedAt,
    derivedLineProgress: progress,
    questions: [...questions.values()],
    deletedQuestionIds,
    lines: (localProject.lines || []).map((line) => {
      const remote = remoteLines.get(line.id);
      if (!remote) return line;
      return mergeRecordingProgress(line, remote);
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

const extractSeCueTitles = (value = "") => String(value || "")
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/^[（(【\[]\s*/u, "").replace(/\s*[）)】\]]$/u, ""))
  .map((line) => line.match(/^(?:[-*・●■▶]\s*)?(?:SE|ＳＥ|SFX|効果音)(?:\s*(?:No\.?|#)?\d+)?\s*[：:]\s*(.+)$/iu)?.[1]?.trim() || "")
  .filter(Boolean);

const getSelectedCharacterMentionTokens = (project = {}, selectedCharacterIds = new Set()) => {
  const selected = selectedCharacterIds instanceof Set
    ? selectedCharacterIds
    : new Set(selectedCharacterIds || []);
  const tokens = new Set();
  (project?.characters || []).forEach((character) => {
    if (!selected.has(character.id)) return;
    getCharacterKnownNames(character).forEach((name) => {
      const token = normalizeCharacterAliasToken(name);
      if (token) tokens.add(token);
    });
  });
  return [...tokens];
};

const directionMentionsSelectedCharacter = (line = {}, characterMentionTokens = []) => {
  if (line.kind !== "direction" || !characterMentionTokens.length) return false;
  const cueText = [
    ...extractSeCueTitles(line.text),
    ...extractSeCueTitles(line.direction)
  ].join(" ");
  if (!cueText) return false;
  const cueToken = normalizeCharacterAliasToken(stripRubyNotation(cueText));
  return characterMentionTokens.some((token) => cueToken.includes(token));
};

const directionTextMentionsSelectedCharacter = (line = {}, characterMentionTokens = []) => {
  if (line.kind !== "direction" || !characterMentionTokens.length) return false;
  const directionToken = normalizeCharacterAliasToken(stripRubyNotation([
    line.text,
    line.direction
  ].filter(Boolean).join(" ")));
  return Boolean(directionToken) && characterMentionTokens.some((token) => directionToken.includes(token));
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
  const selectedCharacterMentionTokens = getSelectedCharacterMentionTokens(project, selected);
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
    const relatedCharacterSe = directionMentionsSelectedCharacter(line, selectedCharacterMentionTokens);
    const selectedMatch = selected.size === 0 || (!isDirection && selected.has(line.characterId)) || relatedCharacterSe;
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
    const directSceneIds = new Set([...directIndexes].map((index) => lines[index]?.sceneId));
    directIndexes.forEach((index) => {
      const previous = lines[index - 1];
      const next = lines[index + 1];
      if (previous && previous.sceneId === lines[index].sceneId) visibleIndexes.add(index - 1);
      if (next && next.sceneId === lines[index].sceneId) visibleIndexes.add(index + 1);
    });
    lines.forEach((line, index) => {
      if (
        !visibleIndexes.has(index)
        && directSceneIds.has(line.sceneId)
        && directionTextMentionsSelectedCharacter(line, selectedCharacterMentionTokens)
      ) {
        visibleIndexes.add(index);
      }
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

const getSuggestedCharacterName = (speaker = "", knownNames = []) => {
  const canonicalName = getCanonicalCharacterName(speaker, knownNames);
  const normalizedName = cleanSpeakerLabel(canonicalName).normalize("NFKC").trim();
  const matchingSuffix = [...CHARACTER_ALIAS_SUFFIXES]
    .sort((left, right) => right.length - left.length)
    .find((suffix) => normalizedName.endsWith(suffix) && normalizedName.length > suffix.length);
  return matchingSuffix
    ? normalizedName.slice(0, -matchingSuffix.length).trim()
    : normalizedName;
};

export const getUnregisteredScriptSpeakers = (project = {}) => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const knownNames = characters.flatMap(getCharacterKnownNames);
  const knownKeys = new Set(knownNames.map((name) => normalizeCharacterNameKey(
    getCanonicalCharacterName(name, knownNames)
  )));
  const candidates = new Map();

  (Array.isArray(project.lines) ? project.lines : []).forEach((line, lineIndex) => {
    if (!line.manualBody || !String(line.text || "").trim()) return;
    parseGoogleDocsScript(line.text, knownNames).forEach((row, rowIndex) => {
      if (row.sourceKind === "direction" || row.speaker === "ト書き") return;
      const name = getSuggestedCharacterName(row.speakerLabel || row.speaker, knownNames);
      const key = normalizeCharacterNameKey(name);
      if (!key || knownKeys.has(key) || !isPlausibleSpeaker(name) || isScriptStructureLabel(name)) return;
      const location = {
        chapterTitle: String(line.chapterTitle || "第一章"),
        sceneTitle: String(line.sceneTitle || "章の本文")
      };
      const existing = candidates.get(key) || {
        name,
        count: 0,
        locations: [],
        firstOrder: (lineIndex * 10000) + rowIndex
      };
      existing.count += 1;
      if (!existing.locations.some((item) =>
        item.chapterTitle === location.chapterTitle && item.sceneTitle === location.sceneTitle)) {
        existing.locations.push(location);
      }
      candidates.set(key, existing);
    });
  });

  return [...candidates.values()]
    .sort((left, right) => left.firstOrder - right.firstOrder)
    .map(({ firstOrder, ...candidate }) => candidate);
};

export const addProductionCharacterFromScriptSpeaker = (project = {}, speakerName = "") => {
  const characters = Array.isArray(project.characters) ? project.characters : [];
  const knownNames = characters.flatMap(getCharacterKnownNames);
  const name = getSuggestedCharacterName(speakerName, knownNames);
  const nameKey = normalizeCharacterNameKey(name);
  const alreadyRegistered = characters.some((character) => getCharacterKnownNames(character)
    .some((knownName) => normalizeCharacterNameKey(knownName) === nameKey));
  if (!nameKey || alreadyRegistered || !isPlausibleSpeaker(name) || isScriptStructureLabel(name)) return project;

  const characterId = createLocalId("character");
  const character = {
    id: characterId,
    name,
    scriptName: name,
    scriptAliases: [],
    color: "",
    imageUrl: "",
    imagePositionX: 50,
    imagePositionY: 50,
    imageScale: 1.12,
    profile: "",
    background: "",
    recordingFolderUrl: "",
    openChatUrl: ""
  };
  return {
    ...project,
    characters: ensureUniqueCharacterColors([...characters, character]),
    recordingFolderOrder: [...new Set([
      ...(Array.isArray(project.recordingFolderOrder) ? project.recordingFolderOrder : []),
      characterId
    ])]
  };
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

export const getUnassignedProductionCharacters = (project = {}) => {
  const { dialogueCounts, linkedCharacters } = partitionCharactersByScript(project);
  const assignedCharacterIds = new Set(
    (Array.isArray(project.castMembers) ? project.castMembers : [])
      .filter((member) => String(member.actorName || "").trim())
      .flatMap((member) => Array.isArray(member.characterIds) ? member.characterIds : [])
  );
  return linkedCharacters
    .filter((character) => !assignedCharacterIds.has(character.id))
    .map((character) => ({
      ...character,
      dialogueCount: dialogueCounts[character.id] || 0
    }));
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
        retakeAnnotations: normalizeRetakeInstructions(savedProgress.retakeAnnotations, stripRubyNotation(`${fallbackPrefix}${row.text || ""}`.trim())),
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

const getShortChapterTitle = (value = "") => {
  const title = String(value || "").trim();
  const match = title.match(/^(第\s*(?:[0-9０-９]+|[一二三四五六七八九十百]+)\s*章)/u);
  return match ? match[1].replace(/\s+/g, "") : title || "章未設定";
};

export const getProductionCharacterAppearanceLabel = (project = {}, characterId = "") => {
  const displayLines = getRecordingDisplayProject(project).lines || [];
  const allChapters = [];
  const chapterKeys = new Set();
  displayLines.forEach((line) => {
    const key = String(line.chapterId || line.chapterTitle || "").trim();
    if (!key || chapterKeys.has(key)) return;
    chapterKeys.add(key);
    allChapters.push({ key, title: getShortChapterTitle(line.chapterTitle) });
  });
  const appearanceKeys = new Set(displayLines
    .filter((line) => line.kind !== "direction" && line.characterId === characterId)
    .map((line) => String(line.chapterId || line.chapterTitle || "").trim())
    .filter(Boolean));
  if (!appearanceKeys.size) return "登場章未設定";
  if (allChapters.length > 1 && allChapters.every((chapter) => appearanceKeys.has(chapter.key))) {
    return "全章にわたって";
  }
  return allChapters
    .filter((chapter) => appearanceKeys.has(chapter.key))
    .map((chapter) => chapter.title)
    .join("、") || "登場章未設定";
};

const DERIVED_LINE_PROGRESS_FIELDS = new Set([
  "actorStatus",
  "reviewStatus",
  "recordingUrl",
  "recordingFileName",
  "actorNote",
  "directorNote",
  "retakeAnnotations",
  "fieldUpdatedAt",
  "updatedAt"
]);

export const patchRecordingLineProgress = (project = {}, lineId = "", patch = {}, lineContext = null) => {
  const storedLine = (project.lines || []).find((line) => line.id === lineId);
  if (storedLine) {
    const stampedPatch = stampProgressPatch(storedLine, patch);
    return {
      ...project,
      lines: project.lines.map((line) => line.id === lineId ? { ...line, ...stampedPatch } : line)
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
        retakeAnnotations: normalizeRetakeInstructions(
          previous.retakeAnnotations || displayLine.retakeAnnotations,
          stripRubyNotation(displayLine.text || "")
        ),
        updatedAt: previous.updatedAt || displayLine.updatedAt || "",
        ...stampProgressPatch(previous, progressPatch)
      }
    }
  };
};

export const patchRecordingChapterReviewStatus = (
  project = {},
  chapterId = "",
  reviewStatus = "OK",
  updatedAt = new Date().toISOString(),
  characterIds = []
) => {
  const targetChapterId = String(chapterId || "");
  if (!targetChapterId || !DIRECTOR_REVIEW_STATUSES.includes(reviewStatus)) return project;
  const targetCharacterIds = new Set(
    (Array.isArray(characterIds) ? characterIds : [characterIds])
      .map((characterId) => String(characterId || "").trim())
      .filter(Boolean)
  );
  const dialogueLines = getRecordingDisplayProject(project).lines.filter((line) => (
    line.chapterId === targetChapterId
    && line.kind !== "direction"
    && (!targetCharacterIds.size || targetCharacterIds.has(line.characterId))
    && (reviewStatus !== "OK" || line.reviewStatus !== "リテイク")
    && (reviewStatus !== "未確認" || line.reviewStatus === "OK")
  ));
  return dialogueLines.reduce((current, line) => patchRecordingLineProgress(
    current,
    line.id,
    { reviewStatus, updatedAt },
    line
  ), project);
};

export const patchRecordingChapterActorStatus = (
  project = {},
  chapterId = "",
  actorStatus = "収録済み",
  updatedAt = new Date().toISOString(),
  characterIds = []
) => {
  const targetChapterId = String(chapterId || "");
  if (!targetChapterId || !ACTOR_RECORDING_STATUSES.includes(actorStatus)) return project;
  const targetCharacterIds = new Set(
    (Array.isArray(characterIds) ? characterIds : [characterIds])
      .map((characterId) => String(characterId || "").trim())
      .filter(Boolean)
  );
  const dialogueLines = getRecordingDisplayProject(project).lines.filter((line) => (
    line.chapterId === targetChapterId
    && line.kind !== "direction"
    && (!targetCharacterIds.size || targetCharacterIds.has(line.characterId))
    && (actorStatus !== "収録済み" || line.actorStatus === "未収録")
    && line.actorStatus !== actorStatus
  ));
  return dialogueLines.reduce((current, line) => patchRecordingLineProgress(
    current,
    line.id,
    { actorStatus, updatedAt },
    line
  ), project);
};

export const patchRecordingCharacterReviewStatus = (
  project = {},
  reviewStatus = "OK",
  updatedAt = new Date().toISOString(),
  characterIds = []
) => {
  if (!DIRECTOR_REVIEW_STATUSES.includes(reviewStatus)) return project;
  const targetCharacterIds = new Set(
    (Array.isArray(characterIds) ? characterIds : [characterIds])
      .map((characterId) => String(characterId || "").trim())
      .filter(Boolean)
  );
  if (!targetCharacterIds.size) return project;
  const dialogueLines = getRecordingDisplayProject(project).lines.filter((line) => (
    line.kind !== "direction"
    && targetCharacterIds.has(line.characterId)
    && (reviewStatus !== "OK" || line.reviewStatus !== "リテイク")
    && (reviewStatus !== "未確認" || line.reviewStatus === "OK")
  ));
  return dialogueLines.reduce((current, line) => patchRecordingLineProgress(
    current,
    line.id,
    { reviewStatus, updatedAt },
    line
  ), project);
};

export const patchRecordingCharacterActorStatus = (
  project = {},
  actorStatus = "収録済み",
  updatedAt = new Date().toISOString(),
  characterIds = []
) => {
  if (!ACTOR_RECORDING_STATUSES.includes(actorStatus)) return project;
  const targetCharacterIds = new Set(
    (Array.isArray(characterIds) ? characterIds : [characterIds])
      .map((characterId) => String(characterId || "").trim())
      .filter(Boolean)
  );
  if (!targetCharacterIds.size) return project;
  const dialogueLines = getRecordingDisplayProject(project).lines.filter((line) => (
    line.kind !== "direction"
    && targetCharacterIds.has(line.characterId)
    && (actorStatus !== "収録済み" || line.actorStatus === "未収録")
    && line.actorStatus !== actorStatus
  ));
  return dialogueLines.reduce((current, line) => patchRecordingLineProgress(
    current,
    line.id,
    { actorStatus, updatedAt },
    line
  ), project);
};

const normalizeRequiredMaterialCueKey = (value = "") => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja")
  .replace(/\s+/g, " ")
  .replace(/[。．.]+$/u, "")
  .trim();

export const extractScriptRequiredMaterials = (project = {}) => {
  const groups = new Map();
  getRecordingDisplayProject(project).lines.forEach((line) => {
    const locationKey = `${line.chapterId || line.chapterTitle}\u0000${line.sceneId || line.sceneTitle}`;
    const location = {
      chapterId: String(line.chapterId || ""),
      chapterTitle: String(line.chapterTitle || "第一章"),
      sceneId: String(line.sceneId || ""),
      sceneTitle: String(line.sceneTitle || "Scene 1")
    };
    [...extractSeCueTitles(line.text), ...extractSeCueTitles(line.direction)].forEach((title) => {
      const cueKey = normalizeRequiredMaterialCueKey(title);
      if (!cueKey) return;
      const current = groups.get(cueKey) || {
        id: makeStableScopeId("required_se", cueKey),
        source: "script",
        cueKey,
        category: "SE",
        title,
        searchQuery: title,
        notes: "",
        sourceSiteId: "",
        candidateTitle: "",
        candidatePageUrl: "",
        previewUrl: "",
        downloadUrl: "",
        confirmedMaterialId: "",
        commonSeName: "",
        occurrenceCount: 0,
        lineIds: [],
        locations: [],
        locationKeys: new Set(),
        updatedAt: ""
      };
      current.occurrenceCount += 1;
      if (!current.lineIds.includes(line.id)) current.lineIds.push(line.id);
      if (!current.locationKeys.has(locationKey)) {
        current.locationKeys.add(locationKey);
        current.locations.push(location);
      }
      groups.set(cueKey, current);
    });
  });
  return [...groups.values()].map(({ locationKeys, ...material }) => material);
};

const mergeRequiredMaterialOverride = (material, override) => ({
  ...material,
  ...(override || {}),
  id: material.id,
  source: "script",
  cueKey: material.cueKey,
  category: "SE",
  occurrenceCount: material.occurrenceCount,
  lineIds: material.lineIds,
  locations: material.locations
});

export const getProductionRequiredMaterials = (project = {}) => {
  const stored = Array.isArray(project.requiredMaterials) ? project.requiredMaterials : [];
  const overrides = new Map(
    stored
      .filter((material) => material?.source === "script" && material.cueKey)
      .map((material) => [String(material.cueKey), material])
  );
  const dismissed = new Set(Array.isArray(project.dismissedRequiredMaterialKeys) ? project.dismissedRequiredMaterialKeys : []);
  const automatic = extractScriptRequiredMaterials(project)
    .filter((material) => !dismissed.has(material.cueKey))
    .map((material) => mergeRequiredMaterialOverride(material, overrides.get(material.cueKey)));
  const manual = stored.filter((material) => material?.source !== "script").map((material) => ({
    ...material,
    source: "manual",
    chapterId: String(material.chapterId || ""),
    chapterTitle: String(material.chapterTitle || ""),
    category: PRODUCTION_MATERIAL_CATEGORIES.includes(material.category) ? material.category : "SE",
    occurrenceCount: 0,
    lineIds: [],
    locations: []
  }));
  return [...automatic, ...manual];
};

export const getProductionRequiredMaterialChapterGroups = (project = {}, materials = null) => {
  const requiredMaterials = Array.isArray(materials) ? materials : getProductionRequiredMaterials(project);
  const groups = [];
  const groupById = new Map();
  const groupByTitle = new Map();

  const ensureChapter = (chapterId = "", chapterTitle = "") => {
    const normalizedId = String(chapterId || "").trim();
    const normalizedTitle = String(chapterTitle || "").trim() || "章未設定";
    const titleKey = getScriptChapterKey(normalizedTitle);
    const existing = (normalizedId && groupById.get(normalizedId)) || groupByTitle.get(titleKey);
    if (existing) return existing;
    const group = {
      id: normalizedId || makeStableScopeId("required_material_chapter", titleKey),
      title: normalizedTitle,
      materials: [],
      unassigned: false
    };
    groups.push(group);
    groupById.set(group.id, group);
    groupByTitle.set(titleKey, group);
    return group;
  };

  getRecordingDisplayProject(project).lines.forEach((line) => {
    ensureChapter(line.chapterId, line.chapterTitle);
  });

  let unassignedGroup = null;
  requiredMaterials.forEach((material) => {
    const materialGroups = [];
    if (material.source === "script") {
      (Array.isArray(material.locations) ? material.locations : []).forEach((location) => {
        const group = ensureChapter(location.chapterId, location.chapterTitle);
        if (!materialGroups.includes(group)) materialGroups.push(group);
      });
    } else if (material.chapterId || material.chapterTitle) {
      materialGroups.push(ensureChapter(material.chapterId, material.chapterTitle));
    }

    if (!materialGroups.length) {
      if (!unassignedGroup) {
        unassignedGroup = {
          id: "required_material_chapter_unassigned",
          title: "章未設定",
          materials: [],
          unassigned: true
        };
        groups.push(unassignedGroup);
      }
      materialGroups.push(unassignedGroup);
    }

    materialGroups.forEach((group) => {
      if (!group.materials.some((item) => item.id === material.id)) group.materials.push(material);
    });
  });

  return groups;
};

export const getDismissedProductionRequiredMaterials = (project = {}) => {
  const dismissed = new Set(Array.isArray(project.dismissedRequiredMaterialKeys) ? project.dismissedRequiredMaterialKeys : []);
  return extractScriptRequiredMaterials(project).filter((material) => dismissed.has(material.cueKey));
};

export const buildMaterialSourceSearchUrl = (site = {}, query = "") => {
  const template = String(site.searchUrlTemplate || site.homeUrl || "").trim();
  if (!/^https?:\/\//i.test(template)) return "";
  return template.includes("{query}")
    ? template.replaceAll("{query}", encodeURIComponent(String(query || "").trim()))
    : template;
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
