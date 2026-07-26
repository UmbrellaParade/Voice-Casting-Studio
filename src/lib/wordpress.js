export const getWordPressRuntime = () => {
  const runtime = globalThis.VoiceCastingStudio;
  if (runtime?.mode === "wordpress" && runtime.restUrl) return runtime;
  if (import.meta.env.DEV) {
    const previewRole = new URLSearchParams(globalThis.location?.search || "").get("wp-preview");
    if (["manager", "director", "actor"].includes(previewRole)) {
      const canManage = previewRole !== "actor";
      const canEditScript = previewRole === "manager";
      return {
        mode: "wordpress",
        preview: true,
        restUrl: "preview/",
        nonce: "preview",
        siteName: "Voice Cast Studio",
        canManage,
        canEditScript,
        currentUser: {
          id: 0,
          name: previewRole === "manager" ? "Umbrella Parade 制作担当" : previewRole === "director" ? "制作進行担当" : "ヴェル役 声優さん"
        },
        logoutUrl: ""
      };
    }
  }
  return null;
};

const PUBLIC_MEMBER_STORAGE_KEY = "voice-casting-studio-public-member-id";
const fallbackPublicMemberId = `member-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const getPublicMemberId = () => {
  try {
    const stored = globalThis.localStorage?.getItem(PUBLIC_MEMBER_STORAGE_KEY);
    if (stored) return stored;
    const generated = globalThis.crypto?.randomUUID?.() || fallbackPublicMemberId;
    globalThis.localStorage?.setItem(PUBLIC_MEMBER_STORAGE_KEY, generated);
    return generated;
  } catch {
    return fallbackPublicMemberId;
  }
};

const wordpressRequest = async (path, options = {}) => {
  const runtime = getWordPressRuntime();
  if (!runtime) throw new Error("WordPress接続情報がありません。");
  if (runtime.preview) {
    const body = options.body && !(options.body instanceof FormData) ? JSON.parse(options.body) : {};
    if (path === "workspace") {
      return {
        data: null,
        version: 1,
        currentUser: runtime.currentUser,
        canManage: runtime.canManage,
        canEditScript: runtime.canEditScript,
        users: runtime.canManage ? [{ id: 11, name: "ヴェル役 声優さん" }, { id: 12, name: "アマモリ役 声優さん" }] : []
      };
    }
    if (path === "line") return { ok: true, line: { ...body.patch, updatedAt: new Date().toISOString() } };
    if (path === "question") {
      const now = new Date().toISOString();
      return { ok: true, question: { id: `question_preview_${Date.now()}`, lineId: body.lineId || "", characterId: "", authorName: runtime.currentUser.name, wpUserId: runtime.currentUser.id, castMemberId: "", parentQuestionId: body.parentQuestionId || "", body: body.body, answer: "", status: "未回答", createdAt: now, updatedAt: now } };
    }
    if (path === "question/resolve") {
      return { ok: true, question: { id: body.questionId, status: "解決済み", updatedAt: new Date().toISOString() } };
    }
    if (path === "image") return { id: 0, url: "" };
    if (path === "audition-automation/settings") {
      return { hasOpenAiKey: false, appsScriptConfigured: false, model: "gpt-image-2" };
    }
    if (path === "audition-automation/create") {
      throw new Error("プレビューではオーディションフォームを作成できません。");
    }
  }
  const shareHeaders = runtime.shareAccess?.accessKey ? {
    "X-VCS-Project": runtime.shareAccess.projectId,
    "X-VCS-Member": runtime.shareAccess.memberId,
    "X-VCS-Key": runtime.shareAccess.accessKey
  } : {};
  const publicHeaders = runtime.publicNonce ? {
    "X-VCS-Public-Nonce": runtime.publicNonce,
    "X-VCS-Public-Member": getPublicMemberId()
  } : {};
  const response = await fetch(`${runtime.restUrl}${String(path || "").replace(/^\/+/, "")}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(runtime.nonce ? { "X-WP-Nonce": runtime.nonce } : {}),
      ...shareHeaders,
      ...publicHeaders,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const plainMessage = String(payload?.message || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const message = plainMessage.includes("重大なエラー")
      ? "WordPressの保存処理でサーバーエラーが発生しました。ページを再読み込みしてもう一度お試しください。"
      : plainMessage || `WordPressへの接続に失敗しました（${response.status}）。`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("WordPressから正しい形式の応答を受け取れませんでした。");
  }
  return payload;
};

export const makeWordPressMemberShareUrl = ({ projectId, memberId, accessKey }) => {
  if (!globalThis.location?.href || !projectId || !memberId || !accessKey) return "";
  const url = new URL(globalThis.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("vcs_project", projectId);
  url.searchParams.set("vcs_member", memberId);
  url.searchParams.set("vcs_key", accessKey);
  return url.toString();
};

export const loadWordPressWorkspace = () => wordpressRequest("workspace", { method: "GET" });

export const saveWordPressWorkspace = (data) => wordpressRequest("workspace", {
  method: "POST",
  body: JSON.stringify({ data })
});

export const updateWordPressRecordingLine = ({ projectId, lineId, patch, lineContext = null }) => wordpressRequest("line", {
  method: "POST",
  body: JSON.stringify({ projectId, lineId, patch, lineContext })
});

export const createWordPressQuestion = ({ projectId, lineId = "", body, parentQuestionId = "", authorName = "" }) => wordpressRequest("question", {
  method: "POST",
  body: JSON.stringify({ projectId, lineId, body, parentQuestionId, authorName })
});

export const resolveWordPressQuestion = ({ projectId, questionId }) => wordpressRequest("question/resolve", {
  method: "POST",
  body: JSON.stringify({ projectId, questionId })
});

export const uploadWordPressImage = (file) => {
  const body = new FormData();
  body.append("file", file);
  return wordpressRequest("image", { method: "POST", body });
};

export const getWordPressAuditionAutomationSettings = () => wordpressRequest(
  "audition-automation/settings",
  { method: "GET" }
);

export const saveWordPressAuditionAutomationSettings = (settings) => wordpressRequest(
  "audition-automation/settings",
  { method: "POST", body: JSON.stringify(settings) }
);

export const createWordPressAuditionForm = ({ projectId, characterId }) => wordpressRequest(
  "audition-automation/create",
  { method: "POST", body: JSON.stringify({ projectId, characterId }) }
);
