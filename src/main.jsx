import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import LZString from "lz-string";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  Link,
  Mic2,
  Plus,
  Save,
  Send,
  Settings,
  Trash2,
  Upload,
  Users,
  X
} from "lucide-react";
import "./styles.css";
import { getFromGasEndpoint, loadAppConfig, postToGasEndpoint } from "./lib/gas.js";

const APP_NAME = "Voice Casting Studio";
const STORAGE_KEY = "voice-casting-studio:v1";
const STORAGE_COMPRESSED_PREFIX = "lz16:";
const DEFAULT_ATTACHMENT_LIMIT_MB = 200;
const AUDIO_FILE_ACCEPT = "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/m4a,.mp3,.wav,.m4a,.aac";
const IMAGE_FILE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

const QUESTION_KIND_OPTIONS = [
  ["short", "短文"],
  ["long", "長文"],
  ["email", "メール"],
  ["url", "URL"],
  ["audio", "録音ファイル"],
  ["image", "画像"],
  ["checkbox", "確認チェック"]
];

const STATUS_OPTIONS = ["準備中", "受付中", "受付終了", "停止"];
const PERIOD_STATUS_OPTIONS = ["準備中", "受付中", "受付終了"];

const publicAsset = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(publicAsset("sw.js"), { scope: import.meta.env.BASE_URL }).catch(() => {
      console.warn(`${APP_NAME}: service worker registration failed.`);
    });
  });
}

const newId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const formatLocalDate = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

const formatDateRange = (startDate = "", endDate = "") => {
  if (startDate && endDate) return `${startDate} から ${endDate} まで`;
  if (startDate) return `${startDate} から`;
  if (endDate) return `${endDate} まで`;
  return "期間未設定";
};

const normalizeSlug = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const sanitizeName = (value = "", fallback = "applicant") =>
  String(value || fallback)
    .replace(/[\\/:*?"<>|#\[\]]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || fallback;

const formatFileSizeMb = (bytes = 0) => {
  const mb = Number(bytes || 0) / 1024 / 1024;
  if (!Number.isFinite(mb) || mb <= 0) return "0MB";
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
};

const choiceLabel = (options, value) => options.find(([key]) => key === value)?.[1] ?? value;

const defaultQuestion = (kind = "short") => ({
  id: newId("q"),
  label: kind === "audio" ? "ボイスサンプル" : "新しい質問",
  kind,
  required: false,
  help: ""
});

const makeDefaultForm = () => ({
  id: newId("form"),
  name: "ボイスドラマ声優応募フォーム",
  status: "受付中",
  shareSlug: "voice-audition",
  color: "#16a3a3",
  description: "ボイスドラマ出演希望の方から、連絡先・希望役・ボイスサンプルを受け取るフォームです。",
  receptionStartDate: "",
  receptionEndDate: "",
  submissionLimit: 0,
  attachmentLimitMb: DEFAULT_ATTACHMENT_LIMIT_MB,
  driveFolderUrl: "",
  thanksMessage: "ご応募ありがとうございました。運営側で内容を確認し、必要に応じてご連絡します。",
  questions: [
    { id: "q_name", label: "お名前 / 活動名", kind: "short", required: true, help: "公開してよい表記で入力してください。" },
    { id: "q_email", label: "連絡用メールアドレス", kind: "email", required: true, help: "" },
    { id: "q_x", label: "Xアカウントまたは活動URL", kind: "url", required: false, help: "" },
    { id: "q_role", label: "希望する役・演じたい方向性", kind: "long", required: true, help: "" },
    { id: "q_experience", label: "声優・朗読・配信などの活動歴", kind: "long", required: false, help: "" },
    { id: "q_voice", label: "ボイスサンプル / オーディション音源", kind: "audio", required: true, help: "MP3、WAV、M4Aなど。指定台詞がある場合はその録音を添付してください。" },
    { id: "q_message", label: "連絡事項・自己PR", kind: "long", required: false, help: "" },
    { id: "q_consent", label: "応募内容と録音物を選考目的で確認することに同意します", kind: "checkbox", required: true, help: "" }
  ]
});

const makeDefaultPeriod = (formId) => ({
  id: newId("period"),
  title: "第一回ボイスドラマ声優募集",
  status: "受付中",
  formId,
  startDate: formatLocalDate(),
  endDate: "",
  shareSlug: "voice-audition-01",
  driveFolderUrl: "",
  notes: "募集ごとに期間と保存先Driveフォルダーを分けられます。"
});

const createSampleData = () => {
  const form = makeDefaultForm();
  return {
    settings: {
      responseEndpointUrl: "",
      responseSyncToken: "",
      responseDriveFolderUrl: "",
      lastResponseSyncAt: ""
    },
    forms: [form],
    periods: [makeDefaultPeriod(form.id)],
    responses: []
  };
};

const migrateData = (input) => {
  const sample = createSampleData();
  const forms = Array.isArray(input?.forms) && input.forms.length ? input.forms : sample.forms;
  const periods = Array.isArray(input?.periods) ? input.periods : sample.periods;
  return {
    ...sample,
    ...input,
    settings: { ...sample.settings, ...(input?.settings ?? {}) },
    forms: forms.map((form) => ({
      ...makeDefaultForm(),
      ...form,
      shareSlug: normalizeSlug(form.shareSlug || form.name || form.id),
      attachmentLimitMb: Number(form.attachmentLimitMb || DEFAULT_ATTACHMENT_LIMIT_MB),
      submissionLimit: Number(form.submissionLimit || 0),
      questions: Array.isArray(form.questions) && form.questions.length ? form.questions : makeDefaultForm().questions
    })),
    periods: periods.map((period) => ({
      ...makeDefaultPeriod(forms[0]?.id || sample.forms[0].id),
      ...period,
      shareSlug: normalizeSlug(period.shareSlug || period.title || period.id)
    })),
    responses: Array.isArray(input?.responses) ? input.responses : []
  };
};

const loadData = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return migrateData(stored ? JSON.parse(stored) : createSampleData());
  } catch {
    return migrateData(createSampleData());
  }
};

const saveData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const encodeSharePayload = (payload) =>
  `${STORAGE_COMPRESSED_PREFIX}${LZString.compressToEncodedURIComponent(JSON.stringify(payload))}`;

const decodeSharePayload = (encoded) => {
  const source = String(encoded || "");
  const compressed = source.startsWith(STORAGE_COMPRESSED_PREFIX) ? source.slice(STORAGE_COMPRESSED_PREFIX.length) : source;
  const text = LZString.decompressFromEncodedURIComponent(compressed);
  if (!text) return null;
  return JSON.parse(text);
};

const appBaseUrl = () => `${window.location.origin}${window.location.pathname}`;

const makePublishedUrl = (slug) => `${appBaseUrl()}#/r/${encodeURIComponent(slug)}`;

const makePortableUrl = (payload) => `${appBaseUrl()}#/s/${encodeSharePayload(payload)}`;

const resolveDriveFolderUrl = (settings, form, period) =>
  String(period?.driveFolderUrl || form?.driveFolderUrl || settings.responseDriveFolderUrl || "").trim();

const makeSharePayload = (form, settings, period = null) => ({
  version: 1,
  type: "voice-casting-studio-form",
  exportedAt: new Date().toISOString(),
  appName: APP_NAME,
  form,
  period,
  submission: {
    endpointUrl: settings.responseEndpointUrl || "",
    driveFolderUrl: resolveDriveFolderUrl(settings, form, period)
  }
});

const readHashRoute = () => {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/s/")) {
    try {
      const payload = decodeSharePayload(hash.slice(4));
      return payload?.form ? { payload } : { error: true };
    } catch {
      return { error: true };
    }
  }
  if (hash.startsWith("#/r/")) {
    return { publishedSlug: decodeURIComponent(hash.slice(4)) };
  }
  return null;
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const isAudioUpload = (file) => {
  const name = file?.name?.toLowerCase() ?? "";
  const type = file?.type?.toLowerCase() ?? "";
  return /\.(mp3|wav|m4a|aac)$/.test(name) || type.startsWith("audio/");
};

const isImageUpload = (file) => {
  const name = file?.name?.toLowerCase() ?? "";
  const type = file?.type?.toLowerCase() ?? "";
  return /\.(png|jpe?g|webp)$/.test(name) || type.startsWith("image/");
};

const formatAnswerValue = (value) => {
  if (value === true) return "確認済み";
  if (!value) return "";
  if (typeof value === "object" && value.fileName) return `${value.fileName} (${formatFileSizeMb(value.size)})`;
  return String(value);
};

function App() {
  const logoSrc = publicAsset("assets/umbrella-parade-logo.png");
  const [data, setData] = useState(loadData);
  const [active, setActive] = useState("dashboard");
  const [route, setRoute] = useState(readHashRoute);
  const [publishMessage, setPublishMessage] = useState("");
  const [syncState, setSyncState] = useState({ busy: false, message: "" });

  useEffect(() => {
    if (!route) saveData(data);
  }, [data, route]);

  useEffect(() => {
    const onHashChange = () => setRoute(readHashRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!route?.publishedSlug) return undefined;
    let cancelled = false;
    setRoute({ publishedSlug: route.publishedSlug, loading: true });
    loadAppConfig(import.meta.env.BASE_URL)
      .then((config) => {
        if (!config.formEndpointUrl) throw new Error("public/app-config.json の formEndpointUrl が未設定です。");
        return getFromGasEndpoint(config.formEndpointUrl, { action: "getForm", slug: route.publishedSlug });
      })
      .then((result) => {
        if (!cancelled) setRoute({ payload: result.payload });
      })
      .catch((error) => {
        if (!cancelled) setRoute({ error: true, message: error?.message || "フォームを読み込めませんでした。" });
      });
    return () => {
      cancelled = true;
    };
  }, [route?.publishedSlug]);

  const updateSettings = (patch) => {
    setData((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  };

  const updateCollectionItem = (key, id, patch) => {
    setData((current) => ({
      ...current,
      [key]: current[key].map((item) => (item.id === id ? { ...item, ...patch } : item))
    }));
  };

  const removeCollectionItem = (key, id) => {
    setData((current) => ({ ...current, [key]: current[key].filter((item) => item.id !== id) }));
  };

  const addForm = () => {
    const form = makeDefaultForm();
    setData((current) => ({ ...current, forms: [form, ...current.forms] }));
    setActive("forms");
  };

  const addPeriod = () => {
    const period = makeDefaultPeriod(data.forms[0]?.id || "");
    setData((current) => ({ ...current, periods: [period, ...current.periods] }));
    setActive("periods");
  };

  const updateQuestion = (formId, questionId, patch) => {
    setData((current) => ({
      ...current,
      forms: current.forms.map((form) =>
        form.id === formId
          ? {
              ...form,
              questions: form.questions.map((question) =>
                question.id === questionId ? { ...question, ...patch } : question
              )
            }
          : form
      )
    }));
  };

  const addQuestion = (formId, kind = "short") => {
    setData((current) => ({
      ...current,
      forms: current.forms.map((form) =>
        form.id === formId ? { ...form, questions: [...form.questions, defaultQuestion(kind)] } : form
      )
    }));
  };

  const removeQuestion = (formId, questionId) => {
    setData((current) => ({
      ...current,
      forms: current.forms.map((form) =>
        form.id === formId
          ? { ...form, questions: form.questions.filter((question) => question.id !== questionId) }
          : form
      )
    }));
  };

  const publishPayload = async (slug, payload) => {
    const endpointUrl = String(data.settings.responseEndpointUrl || "").trim();
    const token = String(data.settings.responseSyncToken || "").trim();
    if (!endpointUrl) {
      setPublishMessage("設定で「GAS WebアプリURL」を入力してください。");
      return;
    }
    setPublishMessage("短いURLを公開しています...");
    try {
      await postToGasEndpoint(endpointUrl, { action: "publishForm", token, slug, payload });
      setPublishMessage(`公開しました: ${makePublishedUrl(slug)}`);
    } catch (error) {
      setPublishMessage(`公開できませんでした（${error?.message || "不明なエラー"}）。`);
    }
  };

  const copyText = async (text, doneMessage) => {
    await navigator.clipboard.writeText(text);
    setPublishMessage(doneMessage);
  };

  const importResponsePayloads = (payloads) => {
    const incoming = payloads
      .map((payload) => payload?.response ? { ...payload.response, rawAnswers: payload.rawAnswers || [], form: payload.form, period: payload.period } : null)
      .filter(Boolean);
    let imported = 0;
    setData((current) => {
      const existingIds = new Set(current.responses.map((response) => response.id));
      const fresh = incoming.filter((response) => response.id && !existingIds.has(response.id));
      imported = fresh.length;
      return fresh.length ? { ...current, responses: [...fresh, ...current.responses] } : current;
    });
    return imported;
  };

  const syncResponses = async () => {
    const endpointUrl = String(data.settings.responseEndpointUrl || "").trim();
    const token = String(data.settings.responseSyncToken || "").trim();
    if (!endpointUrl) {
      setSyncState({ busy: false, message: "設定で「GAS WebアプリURL」を入力してください。" });
      return;
    }
    setSyncState({ busy: true, message: "新着応募を確認しています..." });
    try {
      const result = await getFromGasEndpoint(endpointUrl, {
        action: "listResponses",
        token,
        folder: String(data.settings.responseDriveFolderUrl || "").trim()
      });
      const payloads = Array.isArray(result.responses) ? result.responses : [];
      const imported = importResponsePayloads(payloads);
      updateSettings({ lastResponseSyncAt: result.now || new Date().toISOString() });
      setSyncState({
        busy: false,
        message: imported
          ? `新着応募を${imported}件取り込みました（受信口の応募 全${payloads.length}件）。`
          : `新着応募はありませんでした（受信口の応募 全${payloads.length}件）。`
      });
    } catch (error) {
      setSyncState({ busy: false, message: `同期できませんでした（${error?.message || "不明なエラー"}）。` });
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `voice-casting-studio-${formatLocalDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setData(migrateData(JSON.parse(String(reader.result))));
      } catch {
        alert("JSONを読み込めませんでした。");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const resetSample = () => {
    if (!confirm("サンプル状態に戻しますか？現在のブラウザ内データは上書きされます。")) return;
    setData(createSampleData());
    setActive("dashboard");
  };

  if (route?.payload || route?.loading || route?.error) {
    return (
      <PublicSubmissionForm
        logoSrc={logoSrc}
        payload={route?.payload}
        loading={route?.loading}
        error={route?.error}
        message={route?.message}
      />
    );
  }

  return (
    <main className="app-shell">
      <Header logoSrc={logoSrc} />
      <nav className="app-nav" aria-label="Main navigation">
        {[
          ["dashboard", "概要", Mic2],
          ["forms", "フォーム", FileText],
          ["periods", "応募期間", CalendarDays],
          ["responses", "応募一覧", Users],
          ["settings", "設定", Settings]
        ].map(([key, label, Icon]) => (
          <button className={active === key ? "active" : ""} key={key} onClick={() => setActive(key)}>
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {publishMessage && <div className="notice">{publishMessage}</div>}

      <section className="workspace">
        {active === "dashboard" && <Dashboard data={data} setActive={setActive} syncResponses={syncResponses} syncState={syncState} />}
        {active === "forms" && (
          <FormsPanel
            forms={data.forms}
            periods={data.periods}
            settings={data.settings}
            addForm={addForm}
            patchForm={(id, patch) => updateCollectionItem("forms", id, patch)}
            removeForm={(id) => removeCollectionItem("forms", id)}
            addQuestion={addQuestion}
            updateQuestion={updateQuestion}
            removeQuestion={removeQuestion}
            publishPayload={publishPayload}
            copyText={copyText}
          />
        )}
        {active === "periods" && (
          <PeriodsPanel
            periods={data.periods}
            forms={data.forms}
            settings={data.settings}
            addPeriod={addPeriod}
            patchPeriod={(id, patch) => updateCollectionItem("periods", id, patch)}
            removePeriod={(id) => removeCollectionItem("periods", id)}
            publishPayload={publishPayload}
            copyText={copyText}
          />
        )}
        {active === "responses" && (
          <ResponsesPanel responses={data.responses} syncResponses={syncResponses} syncState={syncState} lastResponseSyncAt={data.settings.lastResponseSyncAt} />
        )}
        {active === "settings" && (
          <SettingsPanel
            settings={data.settings}
            updateSettings={updateSettings}
            exportJson={exportJson}
            importJson={importJson}
            resetSample={resetSample}
          />
        )}
      </section>
    </main>
  );
}

function Header({ logoSrc }) {
  return (
    <section className="hero">
      <img className="brand-logo" src={logoSrc} alt="Umbrella Parade" />
      <div className="title-block">
        <div className="eyebrow"><Mic2 size={16} /> Audition Toolkit</div>
        <h1>Voice Casting Studio</h1>
        <p>声優募集フォームを作り、応募期間を設定し、録音物を指定したGoogle Driveフォルダーへ受け取るための制作ツールです。</p>
      </div>
    </section>
  );
}

function Dashboard({ data, setActive, syncResponses, syncState }) {
  const openPeriods = data.periods.filter((period) => period.status === "受付中").length;
  const readyForms = data.forms.filter((form) => form.status === "受付中").length;
  const unscreened = data.responses.filter((response) => response.status !== "確認済み").length;
  return (
    <div className="view-stack">
      <SectionTitle title="制作状況" subtitle="声優募集を公開するための最小セットをここで確認します。" />
      <div className="stat-grid">
        <button className="stat-card" onClick={() => setActive("forms")}><FileText /><span>受付中フォーム</span><b>{readyForms}</b></button>
        <button className="stat-card" onClick={() => setActive("periods")}><CalendarDays /><span>受付中の応募期間</span><b>{openPeriods}</b></button>
        <button className="stat-card" onClick={() => setActive("responses")}><Users /><span>未確認応募</span><b>{unscreened}</b></button>
      </div>
      <article className="panel workflow-panel">
        <div>
          <h2>公開までの流れ</h2>
          <p className="muted">まず設定でGAS URLとDrive保存先を入れ、フォームと応募期間を整えてから公開URLを共有します。</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={() => setActive("settings")}><Settings size={16} />設定</button>
          <button className="secondary" onClick={() => setActive("forms")}><FileText size={16} />フォーム作成</button>
          <button className="secondary" onClick={() => setActive("periods")}><CalendarDays size={16} />応募期間</button>
          <button className="primary" onClick={syncResponses} disabled={syncState.busy}><Download size={16} />{syncState.busy ? "同期中" : "応募を同期"}</button>
        </div>
        {syncState.message && <p className="hint-text">{syncState.message}</p>}
      </article>
      <article className="panel split-panel">
        <div>
          <h2>Drive保存の考え方</h2>
          <p className="muted">応募期間またはフォームにDriveフォルダーURLを設定すると、その募集の回答と録音物は指定フォルダーへ保存されます。未設定なら設定画面の既定フォルダーを使います。</p>
        </div>
        <FolderOpen size={52} />
      </article>
    </div>
  );
}

function FormsPanel({ forms, settings, addForm, patchForm, removeForm, addQuestion, updateQuestion, removeQuestion, publishPayload, copyText }) {
  return (
    <div className="view-stack">
      <SectionTitle title="フォーム作成" subtitle="応募者に聞く項目と録音物の添付欄を作ります。" action={<button className="primary" onClick={addForm}><Plus size={16} />フォーム追加</button>} />
      <div className="records">
        {forms.map((form) => {
          const payload = makeSharePayload(form, settings);
          const slug = normalizeSlug(form.shareSlug || form.name || form.id);
          return (
            <article className="record" key={form.id}>
              <div className="record-head">
                <div>
                  <strong>{form.name || "フォーム名未入力"}</strong>
                  <p className="muted">{form.status} / 添付合計 {form.attachmentLimitMb || DEFAULT_ATTACHMENT_LIMIT_MB}MBまで</p>
                </div>
                <button className="icon-danger" onClick={() => removeForm(form.id)} aria-label="フォームを削除"><Trash2 size={16} /></button>
              </div>
              <div className="form-grid">
                <Field label="フォーム名" value={form.name} onChange={(value) => patchForm(form.id, { name: value })} />
                <SelectField label="ステータス" value={form.status} options={STATUS_OPTIONS} onChange={(value) => patchForm(form.id, { status: value })} />
                <Field label="短いURL ID" value={form.shareSlug} onChange={(value) => patchForm(form.id, { shareSlug: normalizeSlug(value) })} />
                <Field label="応募上限（0は無制限）" type="number" value={form.submissionLimit || 0} onChange={(value) => patchForm(form.id, { submissionLimit: Number(value || 0) })} />
                <Field label="受付開始日" type="date" value={form.receptionStartDate || ""} onChange={(value) => patchForm(form.id, { receptionStartDate: value })} />
                <Field label="受付終了日" type="date" value={form.receptionEndDate || ""} onChange={(value) => patchForm(form.id, { receptionEndDate: value })} />
                <Field label="添付合計上限MB" type="number" value={form.attachmentLimitMb || DEFAULT_ATTACHMENT_LIMIT_MB} onChange={(value) => patchForm(form.id, { attachmentLimitMb: Number(value || DEFAULT_ATTACHMENT_LIMIT_MB) })} />
                <Field label="回答保存先DriveフォルダーURL（任意）" value={form.driveFolderUrl || ""} onChange={(value) => patchForm(form.id, { driveFolderUrl: value })} wide />
                <TextArea label="説明文" value={form.description || ""} onChange={(value) => patchForm(form.id, { description: value })} />
                <TextArea label="送信後メッセージ" value={form.thanksMessage || ""} onChange={(value) => patchForm(form.id, { thanksMessage: value })} />
              </div>
              <QuestionEditor form={form} addQuestion={addQuestion} updateQuestion={updateQuestion} removeQuestion={removeQuestion} />
              <div className="share-box">
                <div>
                  <b>共有URL</b>
                  <p className="muted">すぐ使うなら圧縮URL、短くしたい場合はGASへ公開します。</p>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={() => copyText(makePortableUrl(payload), "圧縮URLをコピーしました。")}><ClipboardCopy size={16} />圧縮URL</button>
                  <button className="secondary" onClick={() => copyText(makePublishedUrl(slug), "短いURLをコピーしました。")}><Link size={16} />短いURL</button>
                  <button className="primary" onClick={() => publishPayload(slug, payload)}><Upload size={16} />短いURLを公開/更新</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PeriodsPanel({ periods, forms, settings, addPeriod, patchPeriod, removePeriod, publishPayload, copyText }) {
  const formLabels = Object.fromEntries(forms.map((form) => [form.id, form.name]));
  return (
    <div className="view-stack">
      <SectionTitle title="応募期間設定" subtitle="フォームに受付期間と保存先Driveフォルダーを紐づけます。" action={<button className="primary" onClick={addPeriod}><Plus size={16} />応募期間追加</button>} />
      <div className="records">
        {periods.map((period) => {
          const form = forms.find((item) => item.id === period.formId) || forms[0];
          const payload = form ? makeSharePayload(form, settings, period) : null;
          const slug = normalizeSlug(period.shareSlug || period.title || period.id);
          return (
            <article className="record" key={period.id}>
              <div className="record-head">
                <div>
                  <strong>{period.title || "応募期間名未入力"}</strong>
                  <p className="muted">{period.status} / {formatDateRange(period.startDate, period.endDate)}</p>
                </div>
                <button className="icon-danger" onClick={() => removePeriod(period.id)} aria-label="応募期間を削除"><Trash2 size={16} /></button>
              </div>
              <div className="form-grid">
                <Field label="募集名" value={period.title} onChange={(value) => patchPeriod(period.id, { title: value })} />
                <SelectField label="使用フォーム" value={period.formId} options={forms.map((formItem) => formItem.id)} labels={formLabels} onChange={(value) => patchPeriod(period.id, { formId: value })} />
                <SelectField label="ステータス" value={period.status} options={PERIOD_STATUS_OPTIONS} onChange={(value) => patchPeriod(period.id, { status: value })} />
                <Field label="短いURL ID" value={period.shareSlug} onChange={(value) => patchPeriod(period.id, { shareSlug: normalizeSlug(value) })} />
                <Field label="受付開始日" type="date" value={period.startDate || ""} onChange={(value) => patchPeriod(period.id, { startDate: value })} />
                <Field label="受付終了日" type="date" value={period.endDate || ""} onChange={(value) => patchPeriod(period.id, { endDate: value })} />
                <Field label="回答保存先DriveフォルダーURL（任意）" value={period.driveFolderUrl || ""} onChange={(value) => patchPeriod(period.id, { driveFolderUrl: value })} wide />
                <TextArea label="運営メモ" value={period.notes || ""} onChange={(value) => patchPeriod(period.id, { notes: value })} />
              </div>
              {payload && (
                <div className="share-box">
                  <div>
                    <b>応募期間付きURL</b>
                    <p className="muted">応募開始・終了日の判定とDrive保存先を含めて公開します。</p>
                  </div>
                  <div className="button-row">
                    <button className="secondary" onClick={() => copyText(makePortableUrl(payload), "応募期間付き圧縮URLをコピーしました。")}><ClipboardCopy size={16} />圧縮URL</button>
                    <button className="secondary" onClick={() => copyText(makePublishedUrl(slug), "応募期間付き短いURLをコピーしました。")}><Link size={16} />短いURL</button>
                    <button className="primary" onClick={() => publishPayload(slug, payload)}><Upload size={16} />短いURLを公開/更新</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function QuestionEditor({ form, addQuestion, updateQuestion, removeQuestion }) {
  return (
    <div className="question-editor">
      <div className="record-head">
        <div>
          <strong>質問項目</strong>
          <p className="muted">録音物を受け取る場合は「録音ファイル」を使います。</p>
        </div>
        <div className="button-row compact">
          <button className="secondary" onClick={() => addQuestion(form.id, "short")}><Plus size={16} />質問</button>
          <button className="secondary" onClick={() => addQuestion(form.id, "audio")}><FileAudio size={16} />録音</button>
        </div>
      </div>
      <div className="question-list">
        {form.questions.map((question) => (
          <div className="question-row" key={question.id}>
            <Field label="質問文" value={question.label} onChange={(value) => updateQuestion(form.id, question.id, { label: value })} />
            <SelectField label="形式" value={question.kind} options={QUESTION_KIND_OPTIONS.map(([key]) => key)} labels={Object.fromEntries(QUESTION_KIND_OPTIONS)} onChange={(value) => updateQuestion(form.id, question.id, { kind: value })} />
            <label className="check-field">
              <input type="checkbox" checked={Boolean(question.required)} onChange={(event) => updateQuestion(form.id, question.id, { required: event.target.checked })} />
              必須
            </label>
            <button className="icon-danger" onClick={() => removeQuestion(form.id, question.id)} aria-label="質問を削除"><Trash2 size={16} /></button>
            <Field label="補足" value={question.help || ""} onChange={(value) => updateQuestion(form.id, question.id, { help: value })} wide />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponsesPanel({ responses, syncResponses, syncState, lastResponseSyncAt }) {
  return (
    <div className="view-stack">
      <SectionTitle
        title="応募一覧"
        subtitle="GAS受信口からDriveに保存された応募JSONを同期して確認します。"
        action={<button className="primary" onClick={syncResponses} disabled={syncState.busy}><Download size={16} />{syncState.busy ? "同期中" : "新着応募を同期"}</button>}
      />
      {(syncState.message || lastResponseSyncAt) && (
        <p className="hint-text">{syncState.message}{lastResponseSyncAt ? ` 最終同期: ${lastResponseSyncAt}` : ""}</p>
      )}
      <div className="records">
        {responses.length === 0 ? (
          <article className="panel empty-state">まだ応募は取り込まれていません。</article>
        ) : (
          responses.map((response) => (
            <article className="record" key={response.id}>
              <div className="record-head">
                <div>
                  <strong>{response.respondent || "応募者名未入力"}</strong>
                  <p className="muted">{response.submittedAt || "-"} / {response.form?.name || response.formId || "-"}</p>
                </div>
                <span className="status-pill">{response.status || "未確認"}</span>
              </div>
              <div className="answer-list">
                {(response.rawAnswers || []).map((answer) => (
                  <div key={answer.id} className="answer-item">
                    <b>{answer.label}</b>
                    <span>{answer.answer || "-"}</span>
                    {answer.attachment?.driveUrl && <a href={answer.attachment.driveUrl} target="_blank" rel="noreferrer">Driveで開く</a>}
                  </div>
                ))}
              </div>
              {response.attachments?.length > 0 && (
                <div className="attachment-list">
                  {response.attachments.map((attachment) => (
                    <a href={attachment.driveUrl || attachment.dataUrl} target="_blank" rel="noreferrer" key={`${response.id}-${attachment.fileName}`}>
                      <FileAudio size={16} />{attachment.fileName}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, updateSettings, exportJson, importJson, resetSample }) {
  return (
    <div className="view-stack">
      <SectionTitle title="設定" subtitle="GAS受信口と既定のDrive保存先を設定します。" />
      <article className="panel">
        <div className="form-grid">
          <Field label="GAS WebアプリURL" value={settings.responseEndpointUrl || ""} onChange={(value) => updateSettings({ responseEndpointUrl: value })} placeholder="https://script.google.com/macros/s/.../exec" wide />
          <Field label="回答同期トークン" value={settings.responseSyncToken || ""} onChange={(value) => updateSettings({ responseSyncToken: value })} placeholder="Code.gs の SECRET_TOKEN と同じ文字列" wide />
          <Field label="既定の回答保存先DriveフォルダーURL" value={settings.responseDriveFolderUrl || ""} onChange={(value) => updateSettings({ responseDriveFolderUrl: value })} placeholder="https://drive.google.com/drive/folders/..." wide />
        </div>
        <div className="settings-note">
          <AlertTriangle size={18} />
          <p>短いURL `#/r/...` をオンラインで使う場合は、`public/app-config.json` の `formEndpointUrl` に同じGAS URLを入れてコミットします。圧縮URL `#/s/...` はURL内に送信先を含むため、先に動作確認できます。</p>
        </div>
        <div className="button-row">
          <button className="secondary" onClick={exportJson}><Download size={16} />JSON書き出し</button>
          <label className="secondary file-button">
            <Upload size={16} />JSON読み込み
            <input type="file" accept="application/json" onChange={importJson} />
          </label>
          <button className="danger" onClick={resetSample}><Trash2 size={16} />サンプルに戻す</button>
        </div>
      </article>
      <article className="panel split-panel">
        <div>
          <h2>Apps Script</h2>
          <p className="muted">`docs/google-apps-script/Code.gs` をGoogle Apps Scriptへ貼り付け、Webアプリとしてデプロイします。</p>
        </div>
        <Database size={48} />
      </article>
    </div>
  );
}

function PublicSubmissionForm({ logoSrc, payload, loading, error, message }) {
  const form = payload?.form;
  const period = payload?.period;
  const submission = payload?.submission || {};
  const [answers, setAnswers] = useState({});
  const [formError, setFormError] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const attachmentLimitMb = Number(form?.attachmentLimitMb || DEFAULT_ATTACHMENT_LIMIT_MB);
  const attachmentLimitBytes = attachmentLimitMb * 1024 * 1024;

  useEffect(() => {
    setAnswers({});
    setFormError("");
    setSubmitStatus("");
  }, [form?.id, period?.id]);

  if (loading) {
    return <PublicShell logoSrc={logoSrc}><article className="panel"><h2>公開フォームを読み込んでいます</h2><p className="muted">少し待ってから表示を確認してください。</p></article></PublicShell>;
  }

  if (error || !form) {
    return <PublicShell logoSrc={logoSrc}><article className="panel"><h2>共有フォームを開けませんでした</h2><p className="muted">{message || "URLが途中で切れている可能性があります。運営側へご連絡ください。"}</p></article></PublicShell>;
  }

  const today = formatLocalDate();
  const closedNotice = (() => {
    if (form.status && form.status !== "受付中") return `${form.name} は現在「${form.status}」です。`;
    if (period?.status && period.status !== "受付中") return `${period.title} は現在「${period.status}」です。`;
    const ranges = [
      ["フォーム受付期間", form.receptionStartDate, form.receptionEndDate],
      ["応募期間", period?.startDate, period?.endDate]
    ];
    for (const [label, startDate, endDate] of ranges) {
      if (startDate && today < startDate) return `${label}は ${formatDateRange(startDate, endDate)} です。`;
      if (endDate && today > endDate) return `${label}は終了しています（${formatDateRange(startDate, endDate)}）。`;
    }
    return "";
  })();

  const updateAnswer = (questionId, value) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const validateFile = (question, file, event) => {
    if (question.kind === "audio" && !isAudioUpload(file)) {
      setFormError("音声ファイルを選んでください。");
      event.target.value = "";
      return false;
    }
    if (question.kind === "image" && !isImageUpload(file)) {
      setFormError("PNG、JPG、WebP画像を選んでください。");
      event.target.value = "";
      return false;
    }
    if (file.size > attachmentLimitBytes) {
      setFormError(`添付ファイルは合計${attachmentLimitMb}MBまでです。「${file.name}」は${formatFileSizeMb(file.size)}あります。`);
      event.target.value = "";
      return false;
    }
    setFormError("");
    return true;
  };

  const updateFileAnswer = async (question, event) => {
    const file = event.target.files?.[0];
    if (!file || !validateFile(question, file, event)) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      updateAnswer(question.id, { fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl });
    } catch {
      setFormError("ファイルを読み込めませんでした。もう一度選び直してください。");
      event.target.value = "";
    }
  };

  const inferRespondent = () => {
    const question = form.questions.find((item) => /名前|name|活動名/i.test(item.label));
    return question ? String(answers[question.id] || "").trim() : "";
  };

  const buildPayload = () => {
    const attachments = form.questions
      .filter((question) => ["audio", "image"].includes(question.kind) && answers[question.id]?.dataUrl)
      .map((question) => ({
        questionId: question.id,
        questionLabel: question.label,
        kind: question.kind,
        fileName: answers[question.id].fileName,
        mimeType: answers[question.id].mimeType,
        size: answers[question.id].size,
        dataUrl: answers[question.id].dataUrl
      }));
    const rawAnswers = form.questions.map((question) => ({
      id: question.id,
      label: question.label,
      kind: question.kind,
      required: Boolean(question.required),
      answer: formatAnswerValue(answers[question.id]),
      attachment: ["audio", "image"].includes(question.kind) ? answers[question.id] || null : null
    }));
    return {
      version: 1,
      type: "voice-casting-studio-response",
      exportedAt: new Date().toISOString(),
      form: {
        id: form.id,
        name: form.name,
        status: form.status,
        receptionStartDate: form.receptionStartDate || "",
        receptionEndDate: form.receptionEndDate || "",
        submissionLimit: Number(form.submissionLimit || 0),
        attachmentLimitMb
      },
      period: period ? { ...period } : null,
      submission,
      response: {
        id: newId("res"),
        submittedAt: new Date().toISOString(),
        formId: form.id,
        periodId: period?.id || "",
        respondent: inferRespondent(),
        status: "未確認",
        summary: rawAnswers.filter((answer) => answer.answer).map((answer) => `${answer.label}: ${answer.answer}`).join("\n"),
        attachments
      },
      rawAnswers
    };
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    setSubmitStatus("");
    const responsePayload = buildPayload();
    const totalAttachmentBytes = responsePayload.response.attachments.reduce((sum, attachment) => sum + Number(attachment.size || 0), 0);
    if (totalAttachmentBytes > attachmentLimitBytes) {
      setFormError(`添付ファイルの合計が${attachmentLimitMb}MBを超えています。`);
      return;
    }
    const endpointUrl = String(submission.endpointUrl || "").trim();
    if (!endpointUrl) {
      setSubmitStatus("送信先が未設定です。運営側へご連絡ください。");
      return;
    }
    setSubmitBusy(true);
    try {
      const result = await postToGasEndpoint(endpointUrl, {
        action: "submitResponse",
        driveFolderUrl: String(submission.driveFolderUrl || "").trim(),
        ...responsePayload
      });
      const savedFiles = Array.isArray(result.savedFiles) ? result.savedFiles.length : 0;
      setSubmitStatus(`${form.thanksMessage || "ご応募ありがとうございました。"}（受付番号: ${result.savedAs || responsePayload.response.id}${savedFiles ? ` / 添付${savedFiles}件保存済み` : ""}）`);
      setAnswers({});
      event.currentTarget.reset();
    } catch (submitError) {
      setSubmitStatus(`送信できませんでした（${submitError?.message || "不明なエラー"}）。時間を置いて再送信するか、運営側へご連絡ください。`);
    } finally {
      setSubmitBusy(false);
    }
  };

  if (closedNotice) {
    return (
      <PublicShell logoSrc={logoSrc}>
        <article className="panel closed-form-panel">
          <p className="eyebrow slim">Shared Form</p>
          <h2>現在は受付できません</h2>
          <p className="muted">{closedNotice}</p>
        </article>
      </PublicShell>
    );
  }

  return (
    <PublicShell logoSrc={logoSrc}>
      <article className="panel public-form-panel">
        <div className="public-head">
          <div>
            <p className="eyebrow slim">Audition Form</p>
            <h2>{form.name}</h2>
            {form.description && <p className="muted">{form.description}</p>}
            <div className="public-context">
              {period && <span>{period.title} / {formatDateRange(period.startDate, period.endDate)}</span>}
              <span>添付: 合計{attachmentLimitMb}MBまで</span>
            </div>
          </div>
        </div>
        {formError && <p className="form-error">{formError}</p>}
        {submitStatus && <p className="submit-status">{submitStatus}</p>}
        <form className="public-form" onSubmit={submit}>
          {form.questions.map((question) => (
            <label className="field wide public-question" key={question.id}>
              <span>{question.label}{question.required ? " *" : ""}</span>
              {question.help && <small>{question.help}</small>}
              {question.kind === "long" ? (
                <textarea required={Boolean(question.required)} value={answers[question.id] || ""} onChange={(event) => updateAnswer(question.id, event.target.value)} />
              ) : question.kind === "audio" || question.kind === "image" ? (
                <div className="upload-field">
                  <input type="file" required={Boolean(question.required)} accept={question.kind === "audio" ? AUDIO_FILE_ACCEPT : IMAGE_FILE_ACCEPT} onChange={(event) => updateFileAnswer(question, event)} />
                  <small>{answers[question.id]?.fileName ? `選択済み: ${formatAnswerValue(answers[question.id])}` : question.kind === "audio" ? "音声ファイルをアップロード" : "画像をアップロード"}</small>
                </div>
              ) : question.kind === "checkbox" ? (
                <span className="inline-check"><input type="checkbox" required={Boolean(question.required)} checked={Boolean(answers[question.id])} onChange={(event) => updateAnswer(question.id, event.target.checked)} />確認しました</span>
              ) : (
                <input type={question.kind === "email" ? "email" : question.kind === "url" ? "url" : "text"} required={Boolean(question.required)} value={answers[question.id] || ""} onChange={(event) => updateAnswer(question.id, event.target.value)} />
              )}
            </label>
          ))}
          <div className="form-bottom-actions">
            <button className="primary" type="submit" disabled={submitBusy}><Send size={16} />{submitBusy ? "送信中" : "送信する"}</button>
          </div>
        </form>
      </article>
    </PublicShell>
  );
}

function PublicShell({ logoSrc, children }) {
  return (
    <main className="app-shell public-shell">
      <Header logoSrc={logoSrc} />
      {children}
    </main>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Field({ label, value, onChange = () => {}, type = "text", placeholder = "", readOnly = false, wide = false }) {
  return (
    <label className={wide ? "field wide" : "field"}>
      <span>{label}</span>
      <input type={type} value={value ?? ""} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="field wide">
      <span>{label}</span>
      <textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, labels = {} }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{labels[option] ?? option}</option>
        ))}
      </select>
    </label>
  );
}

createRoot(document.getElementById("root")).render(<App />);
