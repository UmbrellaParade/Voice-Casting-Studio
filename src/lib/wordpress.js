export const getWordPressRuntime = () => {
  const runtime = globalThis.VoiceCastingStudio;
  if (runtime?.mode === "wordpress" && runtime.restUrl) return runtime;
  if (import.meta.env.DEV) {
    const previewRole = new URLSearchParams(globalThis.location?.search || "").get("wp-preview");
    if (["manager", "actor"].includes(previewRole)) {
      return {
        mode: "wordpress",
        preview: true,
        restUrl: "preview/",
        nonce: "preview",
        canManage: previewRole === "manager",
        currentUser: { id: 0, name: previewRole === "manager" ? "制作管理者" : "ヴェル役 声優さん" },
        logoutUrl: ""
      };
    }
  }
  return null;
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
        users: runtime.canManage ? [{ id: 11, name: "ヴェル役 声優さん" }, { id: 12, name: "アマモリ役 声優さん" }] : []
      };
    }
    if (path === "line") return { ok: true, line: { ...body.patch, updatedAt: new Date().toISOString() } };
    if (path === "question") {
      const now = new Date().toISOString();
      return { ok: true, question: { id: `question_preview_${Date.now()}`, lineId: body.lineId || "", characterId: "", authorName: runtime.currentUser.name, wpUserId: runtime.currentUser.id, body: body.body, answer: "", status: "未回答", createdAt: now, updatedAt: now } };
    }
    if (path === "image") return { id: 0, url: "" };
  }
  const response = await fetch(`${runtime.restUrl}${String(path || "").replace(/^\/+/, "")}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "X-WP-Nonce": runtime.nonce,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `WordPressへの接続に失敗しました（${response.status}）。`);
  return payload;
};

export const loadWordPressWorkspace = () => wordpressRequest("workspace", { method: "GET" });

export const saveWordPressWorkspace = (data) => wordpressRequest("workspace", {
  method: "POST",
  body: JSON.stringify({ data })
});

export const updateWordPressRecordingLine = ({ projectId, lineId, patch }) => wordpressRequest("line", {
  method: "POST",
  body: JSON.stringify({ projectId, lineId, patch })
});

export const createWordPressQuestion = ({ projectId, lineId = "", body }) => wordpressRequest("question", {
  method: "POST",
  body: JSON.stringify({ projectId, lineId, body })
});

export const uploadWordPressImage = (file) => {
  const body = new FormData();
  body.append("file", file);
  return wordpressRequest("image", { method: "POST", body });
};
