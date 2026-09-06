import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  CircleHelp,
  Download,
  Eye,
  ExternalLink,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FolderOpen,
  Globe2,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  Link,
  ListTodo,
  KeyRound,
  LoaderCircle,
  Layers3,
  Megaphone,
  MessageSquareText,
  Move,
  Music2,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users
} from "lucide-react";
import {
  getGoogleDriveFileId,
  isWebUrl,
  makeDirectAudioDownloadUrl,
  makeGoogleDrivePreviewUrl,
  makeImagePreviewUrl,
  newId
} from "../lib/core.js";
import {
  PRODUCTION_MATERIAL_CATEGORIES,
  PRODUCTION_MATERIAL_STATUSES,
  PRODUCTION_AUDITION_APPLICANT_STATUSES,
  PRODUCTION_CONTACT_TEMPLATE_CATEGORIES,
  PRODUCTION_QUESTION_STATUSES,
  PRODUCTION_SCHEDULE_STATUSES,
  PRODUCTION_SCHEDULE_TYPES,
  PRODUCTION_TASK_PRIORITIES,
  PRODUCTION_SOCIAL_TEMPLATE_CATEGORIES,
  SHARED_LINK_COLORS,
  addProductionAuditionStartSchedule,
  addProductionCharacterFromScriptSpeaker,
  applyProductionSocialRoleSelection,
  archiveScriptVersion,
  assignProductionActorName,
  assignProductionAuditionApplicant,
  buildMaterialSourceSearchUrl,
  buildProductionContactMessage,
  buildProductionRetakeList,
  buildProductionSocialMessage,
  buildProductionQuestionThreads,
  canResolveProductionQuestion,
  createRecordingAccessKey,
  getCharacterImageCropStyle,
  getCharacterDialogueCounts,
  getCharacterName,
  getCharacterScriptName,
  getDismissedProductionRequiredMaterials,
  getActorContactName,
  getActorContactHonorific,
  getProductionCharacterAppearanceLabel,
  getProductionCharacterRetakes,
  getProductionRequiredMaterialChapterGroups,
  getProductionRequiredMaterials,
  getRecordingProgress,
  getRecordingDisplayProject,
  groupProductionAuditionApplicantsByRole,
  getUnassignedProductionCharacters,
  getUnregisteredScriptSpeakers,
  isOtherRoleRequestContactTemplate,
  isRetakeRequestContactTemplate,
  mergeMissingProductionRetakesIntoDraft,
  mergeProductionAuditionApplicants,
  normalizeImagePosition,
  normalizeImageScale,
  normalizeXProfileUrl,
  parseRubyText,
  partitionCharactersByScript,
  renameProductionCharacter,
  renameProductionCharacterScriptName,
  reorderProductionCharacters,
  reorderProductionMaterialSourceSites,
  reorderProductionMaterials,
  reorderProductionRecordingFolders,
  reorderProductionSharedLinks,
  reorderProductionTemplates,
  sortProductionScheduleItems,
  sortProductionTasks
} from "../lib/recording.js";
import {
  generateWordPressElevenLabsSound,
  getWordPressElevenLabsSettings,
  getWordPressRuntime,
  makeWordPressMemberShareUrl,
  saveWordPressElevenLabsSettings,
  uploadWordPressImage
} from "../lib/services.js";
import { GasAuditionIntegrationSettings } from "./GasOwnerSettings.jsx";
import {
  finishAuditionFormOnPc,
  getAuditionFinisherStatus,
  openAuditionXLoginOnPc,
  prepareAuditionXPostOnPc
} from "../lib/audition-finisher.js";
import {
  buildAuditionDeadlineValue,
  buildAuditionSocialPost,
  buildXPostIntentUrl,
  createDefaultAuditionSocialTemplate,
  getAuditionDeadlineParts,
  getAuditionDisplayRoleName,
  getAuditionLineCandidateDetails,
  getAuditionRoleDescription,
  normalizeAuditionSocialTemplate
} from "../lib/audition-social.js";
import {
  SE_PROMPT_DISTANCE_OPTIONS,
  SE_PROMPT_INTENSITY_OPTIONS,
  SE_PROMPT_MODE_OPTIONS,
  SE_PROMPT_SPACE_OPTIONS,
  SE_PROMPT_STYLE_OPTIONS,
  buildSePromptOutputs,
  normalizeSePromptDraft
} from "../lib/se-prompts.js";
import {
  ELEVENLABS_PROMPT_MAX_LENGTH,
  ELEVENLABS_STARTER_GENERATION_GUIDE,
  countElevenLabsPromptCharacters,
  getElevenLabsUsageView,
  limitElevenLabsPrompt,
  makeElevenLabsAudioDataUrl,
  makeElevenLabsDownloadName,
  normalizeElevenLabsGenerationOptions
} from "../lib/elevenlabs.js";
import { groupRequiredMaterialsAsCommonSe, getRequiredMaterialCommonSeInfo } from "../lib/se-reuse.js";
import { PersistentAudioButton } from "./PersistentAudioPlayer.jsx";
import { BufferedTextarea, SectionTitle } from "./ui.jsx";

const EDITING_STATUS_OPTIONS = ["未着手", "脚本・配役調整中", "収録中", "音声編集中", "確認中", "公開準備中", "完了"];
const MATERIAL_ASPECT_RATIOS = ["", "16:9", "9:16", "1:1"];
const WORDPRESS_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const AUDITION_IMAGE_FOLDER_URL = "https://drive.google.com/drive/folders/11uxFA2aHVaKv99sRq7yXJKiR5blVn_s9";
const PUBLIC_QUESTIONER_NAME_KEY = "voice-casting-studio-questioner-name";

const readPublicQuestionerName = () => {
  try {
    return globalThis.localStorage?.getItem(PUBLIC_QUESTIONER_NAME_KEY) || "";
  } catch {
    return "";
  }
};

const formatDate = (value, withTime = false) => {
  if (!value) return "未設定";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", withTime
    ? { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "numeric", day: "numeric" });
};

const toDateInputValue = (value) => String(value || "").slice(0, 10);

const createScheduleItem = (overrides = {}) => ({
  id: newId("schedule"),
  type: "収録",
  title: "新しい予定",
  date: "",
  time: "",
  status: "予定",
  notes: "",
  ...overrides
});

const createDeadlineItem = (overrides = {}) => ({
  id: newId("deadline"),
  type: "リテイク締切",
  title: "新しい期日",
  date: "",
  time: "",
  status: "予定",
  notes: "",
  ...overrides
});

const createProductionTask = (overrides = {}) => ({
  id: newId("task"),
  title: "新しいタスク",
  completed: false,
  priority: "通常",
  dueDate: "",
  notes: "",
  createdAt: new Date().toISOString(),
  updatedAt: "",
  ...overrides
});

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("ファイルを読み取れませんでした。"));
  reader.readAsDataURL(file);
});

const getPlaybackUrl = (url = "") => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return getGoogleDriveFileId(trimmed) ? makeDirectAudioDownloadUrl(trimmed) : trimmed;
};

const getImageUrl = (url = "") => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  return makeImagePreviewUrl(trimmed) || trimmed;
};

function RubyText({ text = "" }) {
  return (
    <>
      {parseRubyText(text).map((segment, index) => segment.type === "ruby" ? (
        <ruby key={`${segment.base}-${segment.reading}-${index}`}>
          {segment.base}<rp>（</rp><rt>{segment.reading}</rt><rp>）</rp>
        </ruby>
      ) : <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>)}
    </>
  );
}

function ProjectBar({ projects, project, selectedProjectId, setSelectedProjectId, updateProject, canEditScript }) {
  return (
    <div className="production-project-bar">
      <div className="production-project-fields">
        <label>
          <span>表示中の作品</span>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        {canEditScript && (
          <label>
            <span>収録プロジェクト名</span>
            <input value={project.title} onChange={(event) => updateProject((current) => ({ ...current, title: event.target.value }))} />
          </label>
        )}
      </div>
      <div className="production-project-meta" aria-label="作品情報">
        <span>{project.scriptVersion}</span>
        <span>{project.status}</span>
        <span>{project.editingStatus}</span>
      </div>
    </div>
  );
}

function EmptyWorkspace({ setActive }) {
  return (
    <div className="view-stack">
      <SectionTitle title="制作ワークスペース" subtitle="最初に台本から収録プロジェクトを作成します。" />
      <div className="production-empty-state">
        <LayoutDashboard size={34} />
        <b>作品データがまだありません</b>
        <button type="button" className="primary" onClick={() => setActive("recording")}>台本を登録する</button>
      </div>
    </div>
  );
}

function MiniAudioPlayer({ url, fileName = "" }) {
  const drivePreviewUrl = makeGoogleDrivePreviewUrl(url);
  const playbackUrl = getPlaybackUrl(url);
  if (!playbackUrl) return <span className="production-empty-media"><FileAudio size={16} />音声URL未登録</span>;
  if (drivePreviewUrl) {
    return (
      <div className="production-drive-audio-player">
        <iframe title={`${fileName || "Google Drive音声"}を再生`} src={drivePreviewUrl} loading="lazy" allow="autoplay" />
        <a href={url} target="_blank" rel="noreferrer" title="Google Driveで開く"><ExternalLink size={15} /><span>Driveで開く</span></a>
      </div>
    );
  }
  return (
    <div className="production-audio-player">
      <audio controls preload="none" src={playbackUrl} />
      {!url.startsWith("data:") && (
        <a href={url} target="_blank" rel="noreferrer" title="元ファイルを開く"><ExternalLink size={15} /><span>{fileName || "元ファイル"}</span></a>
      )}
    </div>
  );
}

function ProgressMetric({ icon: Icon, label, value, detail, tone = "", onClick }) {
  return (
    <button type="button" className={`production-metric ${tone}`} onClick={onClick}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function ProductionKeyDates({ project, updateProject, canEditScript = true }) {
  return (
    <div className="production-key-dates">
      <label>
        <span>作品全体の収録締切</span>
        <div className="production-key-date-time">
          <input type="date" aria-label="作品全体の収録締切日" value={project.recordingDeadline} disabled={!canEditScript} onChange={(event) => updateProject({ recordingDeadline: event.target.value })} />
          <input type="time" aria-label="作品全体の収録締切時刻" value={project.recordingDeadlineTime || ""} disabled={!canEditScript} onChange={(event) => updateProject({ recordingDeadlineTime: event.target.value })} />
        </div>
      </label>
      <label>
        <span>公開予定日</span>
        <div className="production-key-date-time">
          <input type="date" aria-label="公開予定日" value={project.releaseDate} disabled={!canEditScript} onChange={(event) => updateProject({ releaseDate: event.target.value })} />
          <input type="time" aria-label="公開予定時刻" value={project.releaseTime || ""} disabled={!canEditScript} onChange={(event) => updateProject({ releaseTime: event.target.value })} />
        </div>
      </label>
      <label>
        <span>現在の編集状況</span>
        <select value={project.editingStatus} disabled={!canEditScript} onChange={(event) => updateProject({ editingStatus: event.target.value })}>
          {EDITING_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}
        </select>
      </label>
    </div>
  );
}

function ScheduleItemsEditor({ project, updateProject, canEditScript = true, compact = false, collectionKey = "scheduleItems", itemLabel = "予定" }) {
  const sourceItems = Array.isArray(project[collectionKey]) ? project[collectionKey] : [];
  const scheduleItems = [
    ...sourceItems.filter((item) => !item.date),
    ...sortProductionScheduleItems(sourceItems.filter((item) => item.date))
  ];
  const patchScheduleItem = (itemId, patch) => updateProject((current) => ({
    ...current,
    [collectionKey]: (current[collectionKey] || []).map((item) => item.id === itemId ? { ...item, ...patch } : item)
  }));
  const removeScheduleItem = (itemId) => {
    if (!confirm(`この${itemLabel}を削除しますか？`)) return;
    updateProject((current) => ({
      ...current,
      [collectionKey]: (current[collectionKey] || []).filter((item) => item.id !== itemId)
    }));
  };

  return (
    <div className={`schedule-editor-list${compact ? " home-deadline-editor-list" : ""}`}>
      {scheduleItems.map((item) => (
        <article key={item.id}>
          <label><span>日付</span><input type="date" value={item.date} disabled={!canEditScript} onChange={(event) => patchScheduleItem(item.id, { date: event.target.value })} /></label>
          <label><span>時刻（任意）</span><input type="time" value={item.time || ""} disabled={!canEditScript} onChange={(event) => patchScheduleItem(item.id, { time: event.target.value })} /></label>
          <label><span>種類</span><select value={item.type} disabled={!canEditScript} onChange={(event) => patchScheduleItem(item.id, { type: event.target.value })}>{PRODUCTION_SCHEDULE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="schedule-title-field"><span>{itemLabel}名</span><input value={item.title} readOnly={!canEditScript} onChange={(event) => patchScheduleItem(item.id, { title: event.target.value })} /></label>
          <label><span>状態</span><select value={item.status} disabled={!canEditScript} onChange={(event) => patchScheduleItem(item.id, { status: event.target.value })}>{PRODUCTION_SCHEDULE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="wide"><span>共有メモ</span><BufferedTextarea value={item.notes} readOnly={!canEditScript} onCommit={(notes) => patchScheduleItem(item.id, { notes })} /></label>
          {canEditScript && <button type="button" className="icon-button danger-icon" title={`${itemLabel}を削除`} aria-label={`${item.title || itemLabel}を削除`} onClick={() => removeScheduleItem(item.id)}><Trash2 size={16} /></button>}
        </article>
      ))}
      {!sourceItems.length && <p className="production-list-empty">{itemLabel}はまだ登録されていません。</p>}
    </div>
  );
}

function ProductionHome({ project, setActive, updateProject, canEditScript }) {
  const progress = getRecordingProgress(project);
  const unreviewedLines = project.lines.filter((line) =>
    line.kind !== "direction" && line.actorStatus !== "未収録" && ["未確認", "確認中"].includes(line.reviewStatus)
  );
  const unansweredQuestions = project.questions.filter((question) => question.status === "未回答");
  const schedule = sortProductionScheduleItems(project.scheduleItems.filter((item) => item.date && item.status !== "完了"));

  return (
    <div className="production-page-stack">
      <section className="production-home-key-dates">
        <header>
          <div><CalendarClock size={19} /><h3>締切・期日・制作状況</h3></div>
          <div className="production-home-key-date-actions">
            <button type="button" className="key-date-detail-button" onClick={() => setActive("schedule")}>予定の詳細</button>
            {canEditScript && <button type="button" className="secondary" onClick={() => updateProject((current) => ({ ...current, deadlineItems: [...(current.deadlineItems || []), createDeadlineItem()] }))}><Plus size={16} />期日を追加</button>}
          </div>
        </header>
        <ProductionKeyDates project={project} updateProject={updateProject} canEditScript={canEditScript} />
        <div className="production-home-deadlines">
          <div className="production-home-deadlines-heading"><span>追加した期日</span><strong>{(project.deadlineItems || []).length}件</strong></div>
          <ScheduleItemsEditor project={project} updateProject={updateProject} canEditScript={canEditScript} compact collectionKey="deadlineItems" itemLabel="期日" />
        </div>
      </section>

      <div className="production-metrics-grid">
        <ProgressMetric icon={CheckCircle2} label="収録済み" value={`${progress.recorded}/${progress.total}`} detail={`${progress.recordedPercent}% 完了`} onClick={() => setActive("recording")} />
        <ProgressMetric icon={FileAudio} label="未確認録音" value={unreviewedLines.length} detail="管理者の確認待ち" tone={unreviewedLines.length ? "attention" : ""} onClick={() => setActive("recording")} />
        <ProgressMetric icon={CircleHelp} label="未回答の質問" value={unansweredQuestions.length} detail="回答が必要" tone={unansweredQuestions.length ? "attention" : ""} onClick={() => setActive("questions")} />
        <ProgressMetric icon={AlertCircle} label="リテイク" value={progress.retakes} detail="再提出待ちを含む" tone={progress.retakes ? "danger" : ""} onClick={() => setActive("recording")} />
      </div>

      <section className="production-progress-band" aria-label="作品全体の進捗">
        <div>
          <span>作品全体の確認進捗</span>
          <strong>{progress.approvedPercent}%</strong>
        </div>
        <i><b style={{ width: `${progress.approvedPercent}%` }} /></i>
        <small>確認OK {progress.approved} / 全セリフ {progress.total}</small>
      </section>

      <div className="production-home-grid">
        <section className="panel production-dashboard-section">
          <header><div><FileAudio size={19} /><h3>未確認の録音</h3></div><button type="button" onClick={() => setActive("recording")}>台本で確認</button></header>
          <div className="production-dashboard-list">
            {unreviewedLines.slice(0, 5).map((line) => (
              <article key={line.id}>
                <div><b>{getCharacterName(project, line.characterId)}</b><span>{line.chapterTitle} / {line.sceneTitle} / {String(line.order).padStart(3, "0")}</span></div>
                <p><RubyText text={line.text} /></p>
                <MiniAudioPlayer url={line.recordingUrl} fileName={line.recordingFileName} />
              </article>
            ))}
            {!unreviewedLines.length && <p className="production-list-empty"><CheckCircle2 size={18} />未確認の録音はありません。</p>}
          </div>
        </section>

        <section className="panel production-dashboard-section">
          <header><div><MessageSquareText size={19} /><h3>未回答の質問</h3></div><button type="button" onClick={() => setActive("questions")}>質問を開く</button></header>
          <div className="production-dashboard-list compact">
            {unansweredQuestions.slice(0, 5).map((question) => {
              const line = project.lines.find((item) => item.id === question.lineId);
              return (
                <article key={question.id}>
                  <div><b>{question.authorName}</b><span>{line ? `${line.chapterTitle} / ${line.sceneTitle}` : "作品全体"}</span></div>
                  <p>{question.body}</p>
                </article>
              );
            })}
            {!unansweredQuestions.length && <p className="production-list-empty"><CheckCircle2 size={18} />未回答の質問はありません。</p>}
          </div>
        </section>

        <section className="panel production-dashboard-section">
          <header><div><CalendarClock size={19} /><h3>直近の予定</h3></div><button type="button" onClick={() => setActive("schedule")}>予定を開く</button></header>
          <div className="production-dashboard-list compact">
            {schedule.slice(0, 5).map((item) => (
              <article className="production-schedule-mini" key={item.id}>
                <time dateTime={`${item.date}${item.time ? `T${item.time}` : ""}`}><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString("ja-JP", { month: "short" })}</span></time>
                <div><b>{item.title}</b><span>{item.type} / {item.status}{item.time ? ` / ${item.time}` : ""}</span></div>
              </article>
            ))}
            {!schedule.length && <p className="production-list-empty">予定はまだ登録されていません。</p>}
          </div>
        </section>

        <section className="panel production-dashboard-section announcements">
          <header><div><Megaphone size={19} /><h3>Umbrella Paradeからのお知らせ</h3></div><button type="button" onClick={() => setActive("schedule")}>お知らせ管理</button></header>
          <div className="production-dashboard-list compact">
            {[...project.announcements].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 4).map((announcement) => (
              <article className={announcement.priority === "重要" ? "important" : ""} key={announcement.id}>
                <div><b>{announcement.title}</b><span>{formatDate(announcement.publishedAt)}</span></div>
                <p>{announcement.body}</p>
              </article>
            ))}
            {!project.announcements.length && <p className="production-list-empty">お知らせはまだありません。</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function CharacterImage({ character, patchCharacter, canEdit = true }) {
  const [message, setMessage] = useState("");
  const positionDragRef = useRef(null);
  const imageUrl = getImageUrl(character.imageUrl);
  const imagePositionX = normalizeImagePosition(character.imagePositionX);
  const imagePositionY = normalizeImagePosition(character.imagePositionY);
  const imageScale = normalizeImageScale(character.imageScale);

  const patchImagePosition = (x, y) => {
    if (!canEdit) return;
    const nextX = Math.round(normalizeImagePosition(x));
    const nextY = Math.round(normalizeImagePosition(y));
    patchCharacter({
      imagePositionX: nextX,
      imagePositionY: nextY,
      imageScale: imageScale <= 1 && (nextX !== 50 || nextY !== 50) ? 1.12 : imageScale
    });
  };

  const beginPositionDrag = (event) => {
    if (!canEdit || !imageUrl || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    positionDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      positionX: imagePositionX,
      positionY: imagePositionY,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveImagePosition = (event) => {
    const drag = positionDragRef.current;
    if (!drag) return;
    event.preventDefault();
    patchImagePosition(
      drag.positionX - ((event.clientX - drag.startX) / drag.width) * 100,
      drag.positionY - ((event.clientY - drag.startY) / drag.height) * 100
    );
  };

  const finishPositionDrag = (event) => {
    if (!positionDragRef.current) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    positionDragRef.current = null;
  };

  const uploadImage = async (file) => {
    if (!canEdit) return;
    try {
      const runtime = getWordPressRuntime();
      const imageUrl = runtime
        ? (await uploadWordPressImage(file)).url
        : await readFileAsDataUrl(file);
      patchCharacter({ imageUrl, imagePositionX: 50, imagePositionY: 50, imageScale: 1.12 });
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="character-image-editor">
      <div
        className={`character-image-preview${imageUrl && canEdit ? " can-position" : ""}`}
        style={{ "--character-color": character.color }}
        onPointerDown={beginPositionDrag}
        onPointerMove={moveImagePosition}
        onPointerUp={finishPositionDrag}
        onPointerCancel={finishPositionDrag}
      >
        {imageUrl ? <img src={imageUrl} alt={`${character.name}のキャラクター画像`} draggable="false" style={getCharacterImageCropStyle(character)} /> : <Users size={34} />}
        {imageUrl && canEdit && <span className="character-image-move-icon" title="画像位置をドラッグで調整"><Move size={15} /></span>}
      </div>
      {canEdit && <label className="secondary character-image-upload">
        <ImagePlus size={16} /><span>画像を選択</span>
        <input type="file" accept={WORDPRESS_IMAGE_ACCEPT} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadImage(file);
          event.target.value = "";
        }} />
      </label>}
      {imageUrl && canEdit && (
        <div className="character-image-position-controls">
          <label>
            <span>横位置</span>
            <input type="range" min="0" max="100" value={imagePositionX} aria-label={`${character.name}の画像の横位置`} onChange={(event) => patchImagePosition(event.target.value, imagePositionY)} />
          </label>
          <label>
            <span>縦位置</span>
            <input type="range" min="0" max="100" value={imagePositionY} aria-label={`${character.name}の画像の縦位置`} onChange={(event) => patchImagePosition(imagePositionX, event.target.value)} />
          </label>
          <label>
            <span>拡大</span>
            <input type="range" min="100" max="200" value={Math.round(imageScale * 100)} aria-label={`${character.name}の画像の拡大率`} onChange={(event) => patchCharacter({ imageScale: normalizeImageScale(Number(event.target.value) / 100) })} />
          </label>
          <button type="button" className="icon-button" title="画像位置を中央に戻す" aria-label={`${character.name}の画像位置を中央に戻す`} onClick={() => patchCharacter({ imagePositionX: 50, imagePositionY: 50, imageScale: 1.12 })}><RotateCcw size={15} /></button>
        </div>
      )}
      {message && <small className="production-field-error">{message}</small>}
    </div>
  );
}

function CharactersView({ project, updateProject, siteUsers = [], canEditScript = true }) {
  const [characterNameDrafts, setCharacterNameDrafts] = useState({});
  const [characterScriptNameDrafts, setCharacterScriptNameDrafts] = useState({});
  const [actorNameDrafts, setActorNameDrafts] = useState({});
  const [socialUrlDrafts, setSocialUrlDrafts] = useState({});
  const [draggingCharacterId, setDraggingCharacterId] = useState("");
  const [dragOverCharacterId, setDragOverCharacterId] = useState("");
  const [activeCharacterId, setActiveCharacterId] = useState("");
  const [message, setMessage] = useState("");
  const pointerDragRef = useRef(null);
  const characterTocNavRef = useRef(null);
  const characterTocButtonRefs = useRef(new Map());
  const { dialogueCounts, linkedCharacters, unlinkedCharacters } = useMemo(
    () => partitionCharactersByScript(project),
    [project.characters, project.lines]
  );
  const unregisteredSpeakers = useMemo(
    () => getUnregisteredScriptSpeakers(project),
    [project.characters, project.lines]
  );
  const linkedCharacterSignature = linkedCharacters.map((character) => character.id).join("|");

  useEffect(() => {
    if (!linkedCharacters.length || typeof IntersectionObserver === "undefined") {
      setActiveCharacterId(linkedCharacters[0]?.id || "");
      return undefined;
    }
    const elements = linkedCharacters
      .map((character) => document.getElementById(`character-${character.id}`))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      const characterId = visible[0]?.target?.dataset?.characterId;
      if (characterId) setActiveCharacterId(characterId);
    }, { rootMargin: "-12% 0px -70% 0px", threshold: [0, 0.1, 0.4] });
    elements.forEach((element) => observer.observe(element));
    setActiveCharacterId((current) => current && linkedCharacters.some((character) => character.id === current)
      ? current
      : linkedCharacters[0]?.id || "");
    return () => observer.disconnect();
  }, [linkedCharacterSignature]);

  useEffect(() => {
    const nav = characterTocNavRef.current;
    const button = characterTocButtonRefs.current.get(activeCharacterId);
    if (!nav || !button) return;
    const navRect = nav.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const topOffset = buttonRect.top < navRect.top
      ? buttonRect.top - navRect.top - 4
      : buttonRect.bottom > navRect.bottom
        ? buttonRect.bottom - navRect.bottom + 4
        : 0;
    const leftOffset = buttonRect.left < navRect.left
      ? buttonRect.left - navRect.left - 4
      : buttonRect.right > navRect.right
        ? buttonRect.right - navRect.right + 4
        : 0;
    if (topOffset || leftOffset) nav.scrollBy({ top: topOffset, left: leftOffset });
  }, [activeCharacterId]);

  const jumpToCharacter = (characterId) => {
    const target = document.getElementById(`character-${characterId}`);
    if (!target) return;
    setActiveCharacterId(characterId);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const patchCharacter = (characterId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      characters: current.characters.map((character) => character.id === characterId ? { ...character, ...patch } : character)
    }));
  };

  const clearCharacterNameDraft = (characterId) => {
    setCharacterNameDrafts((current) => {
      const next = { ...current };
      delete next[characterId];
      return next;
    });
  };

  const commitCharacterName = (characterId, value) => {
    if (!canEditScript) return;
    const character = project.characters.find((item) => item.id === characterId);
    const name = String(value || "").normalize("NFKC").trim();
    clearCharacterNameDraft(characterId);
    if (!name) {
      setMessage("キャラクター名は空にできません。元の名前に戻しました。");
      return;
    }
    if (name === character?.name) return;
    updateProject((current) => renameProductionCharacter(current, characterId, name));
    setMessage(`「${character?.name || "登場人物"}」の表示名を「${name}」に変更しました。台本内の元の話者名との紐づけは維持されます。`);
  };

  const commitCharacterScriptName = (characterId, value) => {
    if (!canEditScript) return;
    const character = project.characters.find((item) => item.id === characterId);
    const scriptName = String(value || "").normalize("NFKC").trim();
    setCharacterScriptNameDrafts((current) => {
      const next = { ...current };
      delete next[characterId];
      return next;
    });
    if (!scriptName) {
      setMessage("台本で使う名前は空にできません。元の名前に戻しました。");
      return;
    }
    if (scriptName === getCharacterScriptName(character)) return;
    updateProject((current) => renameProductionCharacterScriptName(current, characterId, scriptName));
    setMessage(`人物ボタンと台本の話者名を「${scriptName}」に変更しました。正式名称は「${character?.name || "登場人物"}」のままです。`);
  };

  const assignActorName = (characterId, actorName) => {
    if (!canEditScript) return;
    const name = String(actorName || "").trim();
    updateProject((current) => assignProductionActorName(current, characterId, name));
    setActorNameDrafts((current) => {
      const next = { ...current };
      delete next[characterId];
      return next;
    });
  };

  const moveCharacter = (sourceId, targetId) => {
    if (!canEditScript || !sourceId || !targetId || sourceId === targetId) return;
    const character = project.characters.find((item) => item.id === sourceId);
    updateProject((current) => ({
      ...current,
      characters: reorderProductionCharacters(current.characters, sourceId, targetId)
    }));
    setMessage(`「${character?.name || "登場人物"}」の並び順を保存しました。`);
  };

  const resetCharacterDrag = () => {
    pointerDragRef.current = null;
    setDraggingCharacterId("");
    setDragOverCharacterId("");
  };

  const beginCharacterDrag = (event, characterId) => {
    if (!canEditScript || event.button !== 0) return;
    pointerDragRef.current = {
      sourceId: characterId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: "",
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const trackCharacterDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    event.preventDefault();
    drag.moved = true;
    setDraggingCharacterId(drag.sourceId);
    if (event.clientY < 72) window.scrollBy({ top: -18 });
    if (event.clientY > window.innerHeight - 72) window.scrollBy({ top: 18 });
    const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-character-id]")?.dataset.characterId || "";
    drag.targetId = targetId && targetId !== drag.sourceId ? targetId : "";
    setDragOverCharacterId(drag.targetId);
  };

  const finishCharacterDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && drag.targetId) moveCharacter(drag.sourceId, drag.targetId);
    resetCharacterDrag();
  };

  const addCharacter = () => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      characters: [...current.characters, {
        id: newId("character"),
        name: `登場人物${current.characters.length + 1}`,
        scriptName: `登場人物${current.characters.length + 1}`,
        scriptAliases: [],
        color: "#168b9a",
        imageUrl: "",
        imagePositionX: 50,
        imagePositionY: 50,
        imageScale: 1.12,
        profile: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      }]
    }));
  };

  const addScriptSpeakerCandidate = (candidate) => {
    if (!canEditScript) return;
    updateProject((current) => addProductionCharacterFromScriptSpeaker(current, candidate.name));
    setMessage(`「${candidate.name}」をキャラクターに追加しました。台本内の${candidate.count}件のセリフと紐づきました。`);
  };

  const removeCharacter = (characterId) => {
    if (!canEditScript) return;
    const character = project.characters.find((item) => item.id === characterId);
    const linkedLines = project.lines.filter((line) => line.characterId === characterId);
    const lineNotice = linkedLines.length
      ? `\n\n紐づいている${linkedLines.length}件は本文として残します。削除前の状態は保存版から復元できます。`
      : "";
    if (!confirm(`「${character?.name || "この登場人物"}」を削除しますか？${lineNotice}`)) return;
    updateProject((current) => {
      const working = linkedLines.length
        ? archiveScriptVersion(current, {
          label: `${current.scriptVersion || "現在版"}（登場人物削除前）`,
          reason: `「${character?.name || "登場人物"}」を削除する直前`
        })
        : current;
      return {
        ...working,
        characters: working.characters.filter((item) => item.id !== characterId),
        lines: working.lines.map((line) => line.characterId === characterId
          ? { ...line, characterId: "", kind: "direction" }
          : line),
        castMembers: working.castMembers.map((member) => ({ ...member, characterIds: member.characterIds.filter((id) => id !== characterId) }))
      };
    });
    setMessage(`「${character?.name || "登場人物"}」を削除しました。`);
  };

  const addCastMember = () => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      castMembers: [...current.castMembers, { id: newId("cast"), actorName: "声優さん", contactName: "", contactHonorific: "さん", contact: "", socialUrl: "", characterIds: [], wpUserId: 0, accessKey: createRecordingAccessKey() }]
    }));
  };

  const patchCastMember = (memberId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      castMembers: current.castMembers.map((member) => member.id === memberId ? { ...member, ...patch } : member)
    }));
  };

  const commitCastMemberSocialUrl = (memberId, value) => {
    if (!canEditScript || !memberId) return;
    const socialUrl = normalizeXProfileUrl(value);
    setSocialUrlDrafts((current) => {
      const next = { ...current };
      delete next[memberId];
      return next;
    });
    patchCastMember(memberId, { socialUrl });
    setMessage(socialUrl ? "担当者SNSを保存しました。" : "担当者SNSを未登録に戻しました。");
  };

  const renderSocialField = (member, label = "担当者SNS") => {
    const memberId = member?.id || "";
    const socialUrl = socialUrlDrafts[memberId] ?? member?.socialUrl ?? "";
    const normalizedSocialUrl = normalizeXProfileUrl(socialUrl);
    const canOpen = isWebUrl(normalizedSocialUrl);
    return (
      <label className="cast-member-social-label">
        <span>{label}</span>
        <div className="character-social-field">
          <input
            type="text"
            value={socialUrl}
            placeholder={member ? "@ID または https://x.com/..." : "担当声優を先に入力"}
            readOnly={!canEditScript}
            disabled={!member}
            onChange={(event) => setSocialUrlDrafts((current) => ({ ...current, [memberId]: event.target.value }))}
            onBlur={(event) => commitCastMemberSocialUrl(memberId, event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <a
            className={`secondary character-social-open${canOpen ? "" : " disabled"}`}
            href={canOpen ? normalizedSocialUrl : undefined}
            target="_blank"
            rel="noreferrer"
            aria-label={canOpen ? `${member?.actorName || "担当者"}のSNSを開く` : "担当者SNSは未登録です"}
            aria-disabled={!canOpen}
            tabIndex={canOpen ? undefined : -1}
            title={canOpen ? "担当者SNSを開く" : "担当者SNSは未登録です"}
          ><ExternalLink size={16} />{canOpen ? "SNSを開く" : "未登録"}</a>
        </div>
      </label>
    );
  };

  const copyMemberShareUrl = async (member) => {
    const shareUrl = makeWordPressMemberShareUrl({
      projectId: project.id,
      memberId: member.id,
      accessKey: member.accessKey
    });
    if (!shareUrl) {
      setMessage("共有URLを作成できませんでした。アクセスキーを再発行してください。");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage(`${member.actorName || "声優さん"}用のログイン不要URLをコピーしました。`);
    } catch {
      setMessage("共有URLをコピーできませんでした。ブラウザのクリップボード許可をご確認ください。");
    }
  };

  const renderCharacterEditor = (character, characterIndex, orderedCharacters, isLinked = true) => {
    const assignedMember = project.castMembers.find((member) => member.characterIds.includes(character.id));
    const lineCount = dialogueCounts[character.id] || 0;
    return (
      <article
        id={`character-${character.id}`}
        className={`character-editor${isLinked ? "" : " script-unlinked"}${draggingCharacterId === character.id ? " dragging" : ""}${dragOverCharacterId === character.id ? " drag-over" : ""}`}
        data-character-id={character.id}
        key={character.id}
        style={{ "--character-color": character.color }}
      >
        <CharacterImage character={character} patchCharacter={(patch) => patchCharacter(character.id, patch)} canEdit={canEditScript} />
        <div className="character-editor-fields">
          <header>
            <div className="character-name-fields">
              <label>
                <span>正式名称</span>
                <input
                  value={characterNameDrafts[character.id] ?? character.name}
                  readOnly={!canEditScript}
                  onChange={(event) => setCharacterNameDrafts((current) => ({ ...current, [character.id]: event.target.value }))}
                  onBlur={(event) => commitCharacterName(character.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <label>
                <span>台本で使う名前</span>
                <input
                  value={characterScriptNameDrafts[character.id] ?? getCharacterScriptName(character)}
                  readOnly={!canEditScript}
                  onChange={(event) => setCharacterScriptNameDrafts((current) => ({ ...current, [character.id]: event.target.value }))}
                  onBlur={(event) => commitCharacterScriptName(character.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
              </label>
              <label className="character-color-field"><span>セリフ色</span><input type="color" value={character.color} disabled={!canEditScript} onChange={(event) => patchCharacter(character.id, { color: event.target.value })} /></label>
            </div>
            <div className="character-header-actions">
              {!isLinked && <span className="character-script-state">台本外</span>}
              <div className="character-line-count"><strong>{lineCount}</strong><span>セリフ</span></div>
              {canEditScript && (
                <div className="character-order-controls" aria-label={`${character.name}の並び替え`}>
                  <button
                    type="button"
                    className="icon-button character-drag-handle"
                    title="ドラッグして並べ替え"
                    aria-label={`${character.name}をドラッグして並べ替え`}
                    onPointerDown={(event) => beginCharacterDrag(event, character.id)}
                    onPointerMove={trackCharacterDrag}
                    onPointerUp={finishCharacterDrag}
                    onPointerCancel={resetCharacterDrag}
                  ><GripVertical size={17} /></button>
                  <button type="button" className="icon-button" title="一つ上へ" aria-label={`${character.name}を一つ上へ`} disabled={characterIndex === 0} onClick={() => moveCharacter(character.id, orderedCharacters[characterIndex - 1]?.id)}><ArrowUp size={16} /></button>
                  <button type="button" className="icon-button" title="一つ下へ" aria-label={`${character.name}を一つ下へ`} disabled={characterIndex === orderedCharacters.length - 1} onClick={() => moveCharacter(character.id, orderedCharacters[characterIndex + 1]?.id)}><ArrowDown size={16} /></button>
                  <button type="button" className="icon-button danger-icon" title="登場人物を削除" aria-label={`${character.name}を削除`} onClick={() => removeCharacter(character.id)}><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          </header>
          <div className="character-field-grid">
            <div className="character-actor-fields">
              <label><span>担当声優</span><input value={actorNameDrafts[character.id] ?? assignedMember?.actorName ?? ""} placeholder="声優さんの名前を入力" readOnly={!canEditScript} onChange={(event) => setActorNameDrafts((current) => ({ ...current, [character.id]: event.target.value }))} onBlur={(event) => assignActorName(character.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
              <div className="character-contact-fields">
                <label><span>連絡用の呼び名</span><input value={assignedMember?.contactName || ""} placeholder={assignedMember ? getActorContactName(assignedMember) : "担当声優を先に入力"} readOnly={!canEditScript} disabled={!assignedMember} onChange={(event) => patchCastMember(assignedMember.id, { contactName: event.target.value })} /></label>
                <label><span>呼称</span><input value={assignedMember ? getActorContactHonorific(assignedMember) : "さん"} placeholder="さん" readOnly={!canEditScript} disabled={!assignedMember} onChange={(event) => patchCastMember(assignedMember.id, { contactHonorific: event.target.value })} /></label>
              </div>
              {renderSocialField(assignedMember)}
            </div>
            <div className="character-folder-column">
              <label className="character-folder-label"><span>収録フォルダー</span><div className="character-folder-field"><input value={character.recordingFolderUrl} placeholder="Google DriveフォルダーURL" readOnly={!canEditScript} onChange={(event) => patchCharacter(character.id, { recordingFolderUrl: event.target.value })} /><a className={`icon-button character-folder-open${isWebUrl(character.recordingFolderUrl) ? "" : " disabled"}`} href={isWebUrl(character.recordingFolderUrl) ? character.recordingFolderUrl : undefined} target="_blank" rel="noreferrer" aria-label={`${character.name}の収録フォルダーを開く`} aria-disabled={!isWebUrl(character.recordingFolderUrl)} title="収録フォルダーを開く"><FolderOpen size={16} /></a></div></label>
              <div className="recording-delivery-notes" role="note" aria-label="収録物の注意点">
                <strong><AlertCircle size={15} />収録物の注意点</strong>
                <ul>
                  <li>形式: wav形式（モノラル）</li>
                  <li>ビットレート: 24bit</li>
                  <li>サンプリングレート: 44.1kHz</li>
                  <li>ファイル名に氏名（SNS名）を記載し章ごとに分けてアップロード</li>
                  <li>リテイク時は、ファイル名の末尾に「re1」（1回目）、「re2」（2回目）のように回数に応じた番号を付ける</li>
                </ul>
              </div>
            </div>
            <label className="wide"><span>設定・人物像</span><BufferedTextarea value={character.profile} readOnly={!canEditScript} onCommit={(profile) => patchCharacter(character.id, { profile })} /></label>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="character-page-layout">
      <aside className="character-toc" aria-label="役目次">
        <header><Users size={18} /><div><b>役目次</b><span>{linkedCharacters.length}役</span></div></header>
        <label className="character-toc-picker">
          <span>役名から移動</span>
          <select value={activeCharacterId} onChange={(event) => jumpToCharacter(event.target.value)}>
            {linkedCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
          </select>
        </label>
        <nav ref={characterTocNavRef}>
          {linkedCharacters.map((character) => {
            const assignedMember = project.castMembers.find((member) => member.characterIds.includes(character.id));
            return (
              <button
                type="button"
                key={character.id}
                ref={(element) => {
                  if (element) characterTocButtonRefs.current.set(character.id, element);
                  else characterTocButtonRefs.current.delete(character.id);
                }}
                className={activeCharacterId === character.id ? "active" : ""}
                onClick={() => jumpToCharacter(character.id)}
                aria-current={activeCharacterId === character.id ? "location" : undefined}
              >
                <i style={{ background: character.color }} />
                <span><b>{character.name}</b><small>{assignedMember?.actorName || `${dialogueCounts[character.id] || 0}セリフ`}</small></span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="production-page-stack character-page-main">
      <div className="production-section-toolbar">
        <div><Users size={19} /><span>台本に登場 {linkedCharacters.length}人{unlinkedCharacters.length ? ` / 台本外 ${unlinkedCharacters.length}人` : ""}</span></div>
        {canEditScript && <button type="button" className="primary" onClick={addCharacter}><Plus size={16} />登場人物</button>}
      </div>
      {message && <p className="production-inline-message">{message}</p>}
      {canEditScript && unregisteredSpeakers.length > 0 && (
        <section className="script-speaker-suggestions" aria-labelledby="script-speaker-suggestions-title">
          <header>
            <div>
              <AlertCircle size={20} />
              <div>
                <h3 id="script-speaker-suggestions-title">台本で見つかった未登録人物</h3>
                <p>内容を確認し、登場人物として扱う名前だけ追加してください。</p>
              </div>
            </div>
            <strong>{unregisteredSpeakers.length}名</strong>
          </header>
          <div className="script-speaker-suggestion-list">
            {unregisteredSpeakers.map((candidate) => (
              <div className="script-speaker-suggestion" key={candidate.name}>
                <div>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.count}セリフ</span>
                  <p>{candidate.locations.map((location) => `${location.chapterTitle} / ${location.sceneTitle}`).join("、")}</p>
                </div>
                <button type="button" className="primary" onClick={() => addScriptSpeakerCandidate(candidate)}><UserPlus size={16} />キャラクターに追加</button>
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="character-editor-list">
        {linkedCharacters.map((character, characterIndex) => renderCharacterEditor(character, characterIndex, linkedCharacters))}
        {!linkedCharacters.length && <div className="production-empty-state"><Users size={30} /><b>現在の台本に登場するキャラクターはいません</b></div>}
      </div>

      {unlinkedCharacters.length > 0 && (
        <details className="character-unlinked-section">
          <summary>
            <div><AlertCircle size={19} /><div><h3>台本外のキャラクター</h3><p>現在の台本にセリフがない人物です。設定と画像はそのまま保存されています。</p></div></div>
            <span>{unlinkedCharacters.length}人<ChevronDown size={18} /></span>
          </summary>
          <div className="character-editor-list">
            {unlinkedCharacters.map((character, characterIndex) => renderCharacterEditor(character, characterIndex, unlinkedCharacters, false))}
          </div>
        </details>
      )}

      <section className="panel cast-roster-panel">
        <header><div><UserPlus size={19} /><div><h3>担当声優</h3><p>登場人物へ割り当てるメンバーを管理します。</p></div></div>{canEditScript && <button type="button" className="secondary" onClick={addCastMember}><Plus size={16} />声優さん</button>}</header>
        <div className="cast-roster-list">
          {project.castMembers.map((member) => {
            const shareUrl = makeWordPressMemberShareUrl({ projectId: project.id, memberId: member.id, accessKey: member.accessKey });
            return (
            <div className={siteUsers.length ? "has-wordpress-users" : ""} key={member.id}>
              <label><span>表示名</span><input value={member.actorName || ""} readOnly={!canEditScript} onChange={(event) => patchCastMember(member.id, { actorName: event.target.value })} /></label>
              <label><span>連絡用の呼び名</span><input value={member.contactName || ""} readOnly={!canEditScript} placeholder={getActorContactName(member)} onChange={(event) => patchCastMember(member.id, { contactName: event.target.value })} /></label>
              <label><span>呼称</span><input value={getActorContactHonorific(member)} readOnly={!canEditScript} placeholder="さん" onChange={(event) => patchCastMember(member.id, { contactHonorific: event.target.value })} /></label>
              <label><span>連絡先メモ</span><input value={member.contact || ""} readOnly={!canEditScript} onChange={(event) => patchCastMember(member.id, { contact: event.target.value })} /></label>
              {siteUsers.length > 0 && (
                <label><span>WordPressアカウント</span><select value={member.wpUserId || 0} onChange={(event) => patchCastMember(member.id, { wpUserId: Number(event.target.value) || 0 })}><option value="0">未連携</option>{siteUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              )}
              <span>{member.characterIds.map((id) => getCharacterName(project, id)).join("・") || "担当未設定"}</span>
              {canEditScript && <button type="button" className="icon-button danger-icon" title="担当声優を削除" onClick={() => {
                if (!confirm(`${member.actorName}を担当声優一覧から削除しますか？`)) return;
                updateProject((current) => ({ ...current, castMembers: current.castMembers.filter((item) => item.id !== member.id) }));
              }}><Trash2 size={16} /></button>}
              {renderSocialField(member)}
              {canEditScript && getWordPressRuntime() && (
                <div className="cast-member-share-field">
                  <input value={shareUrl} readOnly aria-label={`${member.actorName || "声優さん"}用のログイン不要共有URL`} />
                  <button type="button" className="secondary" disabled={!shareUrl} onClick={() => copyMemberShareUrl(member)}><ClipboardCopy size={16} />URLをコピー</button>
                  <button type="button" className="icon-button" title="共有URLを再発行" aria-label={`${member.actorName || "声優さん"}用の共有URLを再発行`} onClick={() => {
                    if (!confirm("現在の共有URLは使えなくなります。再発行しますか？")) return;
                    patchCastMember(member.id, { accessKey: createRecordingAccessKey() });
                  }}><KeyRound size={16} /></button>
                </div>
              )}
            </div>
            );
          })}
          {!project.castMembers.length && <p className="production-list-empty">担当声優はまだ登録されていません。</p>}
        </div>
      </section>
      </div>
    </div>
  );
}

function CharacterLinkField({ icon: Icon, label, service, value = "", placeholder, onChange, readOnly = false }) {
  const canOpen = isWebUrl(value);
  return (
    <div className="production-link-field">
      <div className="production-link-label">
        <Icon size={18} />
        <div><b>{label}</b><span>{service}</span></div>
      </div>
      <div className="production-link-control">
        <input type="url" aria-label={label} value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
        <a
          className={`icon-button production-link-open${canOpen ? "" : " disabled"}`}
          href={canOpen ? value : undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`${label}を開く`}
          aria-disabled={!canOpen}
          tabIndex={canOpen ? undefined : -1}
          title={canOpen ? `${label}を開く` : `${label}のURLが未登録です`}
        >
          <ExternalLink size={16} />
        </a>
      </div>
    </div>
  );
}

function LinksView({ project, updateProject, canEditScript = true }) {
  const [draggingFolderId, setDraggingFolderId] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState("");
  const [draggingLinkId, setDraggingLinkId] = useState("");
  const [dragOverLinkId, setDragOverLinkId] = useState("");
  const [message, setMessage] = useState("");
  const folderDragRef = useRef("");
  const linkDragRef = useRef("");
  const { linkedCharacters } = useMemo(
    () => partitionCharactersByScript(project),
    [project.characters, project.lines]
  );
  const orderedLinkedCharacters = useMemo(() => {
    const order = new Map((project.recordingFolderOrder || []).map((characterId, index) => [characterId, index]));
    return [...linkedCharacters].sort((left, right) =>
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  }, [linkedCharacters, project.recordingFolderOrder]);

  const patchCharacterLink = (characterId, key, value) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      characters: current.characters.map((character) => character.id === characterId
        ? { ...character, [key]: value }
        : character)
    }));
  };

  const addSharedLink = () => {
    if (!canEditScript) return;
    updateProject((current) => {
    const sharedLinks = current.sharedLinks || [];
    const usedColors = new Set(sharedLinks.map((link) => link.color));
    const color = SHARED_LINK_COLORS.find((candidate) => !usedColors.has(candidate))
      || SHARED_LINK_COLORS[sharedLinks.length % SHARED_LINK_COLORS.length];
    return {
      ...current,
      sharedLinks: [...sharedLinks, {
        id: newId("shared_link"),
        title: "新しい共有URL",
        url: "",
        notes: "",
        color
      }]
      };
    });
  };

  const patchSharedLink = (linkId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      sharedLinks: (current.sharedLinks || []).map((link) => link.id === linkId ? { ...link, ...patch } : link)
    }));
  };

  const removeSharedLink = (linkId) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      sharedLinks: (current.sharedLinks || []).filter((link) => link.id !== linkId)
    }));
  };

  const moveSharedLink = (sourceId, targetId) => {
    if (!canEditScript || !sourceId || !targetId || sourceId === targetId) return;
    const movedLink = (project.sharedLinks || []).find((link) => link.id === sourceId);
    updateProject((current) => ({
      ...current,
      sharedLinks: reorderProductionSharedLinks(current.sharedLinks || [], sourceId, targetId)
    }));
    setMessage(`「${movedLink?.title || "共有URL"}」の並び順を保存しました。`);
  };

  const moveRecordingFolder = (sourceId, targetId) => {
    if (!canEditScript || !sourceId || !targetId || sourceId === targetId) return;
    const movedCharacter = project.characters.find((character) => character.id === sourceId);
    updateProject((current) => {
      const characterIds = current.characters.map((character) => character.id);
      const configured = (current.recordingFolderOrder || []).filter((id) => characterIds.includes(id));
      const order = [...configured, ...characterIds.filter((id) => !configured.includes(id))];
      return {
        ...current,
        recordingFolderOrder: reorderProductionRecordingFolders(order, sourceId, targetId)
      };
    });
    setMessage(`「${movedCharacter?.name || "収録フォルダー"}」の並び順を保存しました。`);
  };

  const beginFolderDrag = (event, characterId) => {
    if (!canEditScript) return;
    folderDragRef.current = characterId;
    setDraggingFolderId(characterId);
    setDragOverFolderId("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", characterId);
  };

  const hoverFolder = (event, characterId) => {
    if (!folderDragRef.current || folderDragRef.current === characterId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverFolderId(characterId);
  };

  const finishFolderDrag = (event, targetId = "") => {
    event.preventDefault();
    const sourceId = folderDragRef.current;
    if (sourceId && targetId && sourceId !== targetId) moveRecordingFolder(sourceId, targetId);
    folderDragRef.current = "";
    setDraggingFolderId("");
    setDragOverFolderId("");
  };

  const beginLinkDrag = (event, linkId) => {
    if (!canEditScript) return;
    linkDragRef.current = linkId;
    setDraggingLinkId(linkId);
    setDragOverLinkId("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", linkId);
  };

  const hoverLink = (event, linkId) => {
    if (!linkDragRef.current || linkDragRef.current === linkId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverLinkId(linkId);
  };

  const finishLinkDrag = (event, targetId = "") => {
    event.preventDefault();
    const sourceId = linkDragRef.current;
    if (sourceId && targetId && sourceId !== targetId) moveSharedLink(sourceId, targetId);
    linkDragRef.current = "";
    setDraggingLinkId("");
    setDragOverLinkId("");
  };

  return (
    <div className="production-page-stack">
      {message && <p className="production-inline-message">{message}</p>}
      <section className="production-link-section">
        <header>
          <div><Link size={20} /><div><h3>共有URL</h3><p>作品全体で共有する連絡先や資料へのリンクです。</p></div></div>
          {canEditScript && <button type="button" className="primary" onClick={addSharedLink}><Plus size={16} />共有URL</button>}
        </header>
        <div className="production-shared-url-list">
          {(project.sharedLinks || []).map((link, linkIndex) => {
            const canOpen = isWebUrl(link.url);
            return (
              <article
                className={`production-shared-url-row${draggingLinkId === link.id ? " dragging" : ""}${dragOverLinkId === link.id ? " drag-over" : ""}`}
                data-shared-link-id={link.id}
                key={link.id}
                style={{ "--shared-link-color": link.color || SHARED_LINK_COLORS[linkIndex % SHARED_LINK_COLORS.length] }}
                onDragOver={(event) => hoverLink(event, link.id)}
                onDrop={(event) => finishLinkDrag(event, link.id)}
              >
                <div className="production-shared-url-fields">
                  <label><span>リンク名</span><input value={link.title} readOnly={!canEditScript} onChange={(event) => patchSharedLink(link.id, { title: event.target.value })} /></label>
                  <label className="shared-link-color-field"><span>表示色</span><input type="color" aria-label={`${link.title || "共有URL"}の表示色`} value={link.color || SHARED_LINK_COLORS[linkIndex % SHARED_LINK_COLORS.length]} disabled={!canEditScript} onChange={(event) => patchSharedLink(link.id, { color: event.target.value })} /></label>
                  <label className="wide"><span>URL</span><input type="url" value={link.url} placeholder="https://..." readOnly={!canEditScript} onChange={(event) => patchSharedLink(link.id, { url: event.target.value })} /></label>
                  <label className="wide"><span>補足</span><input value={link.notes} placeholder="用途や共有先" readOnly={!canEditScript} onChange={(event) => patchSharedLink(link.id, { notes: event.target.value })} /></label>
                </div>
                <div className="production-shared-url-actions">
                  {canEditScript && <button
                    type="button"
                    className="icon-button shared-link-drag-handle"
                    draggable
                    title="ドラッグして並べ替え"
                    aria-label={`${link.title || "共有URL"}をドラッグして並べ替え`}
                    onDragStart={(event) => beginLinkDrag(event, link.id)}
                    onDragEnd={(event) => finishLinkDrag(event)}
                  ><GripVertical size={17} /></button>}
                  {canEditScript && <button type="button" className="icon-button" title="一つ上へ" aria-label={`${link.title || "共有URL"}を一つ上へ`} disabled={linkIndex === 0} onClick={() => moveSharedLink(link.id, project.sharedLinks[linkIndex - 1]?.id)}><ArrowUp size={16} /></button>}
                  {canEditScript && <button type="button" className="icon-button" title="一つ下へ" aria-label={`${link.title || "共有URL"}を一つ下へ`} disabled={linkIndex === project.sharedLinks.length - 1} onClick={() => moveSharedLink(link.id, project.sharedLinks[linkIndex + 1]?.id)}><ArrowDown size={16} /></button>}
                  <a className={`icon-button${canOpen ? "" : " disabled"}`} href={canOpen ? link.url : undefined} target="_blank" rel="noreferrer" title={canOpen ? "共有URLを開く" : "URLが未登録です"} aria-label={`${link.title || "共有URL"}を開く`} aria-disabled={!canOpen}><ExternalLink size={16} /></a>
                  {canEditScript && <button type="button" className="icon-button danger-icon" title="共有URLを削除" aria-label={`${link.title || "共有URL"}を削除`} onClick={() => removeSharedLink(link.id)}><Trash2 size={16} /></button>}
                </div>
              </article>
            );
          })}
          {!project.sharedLinks?.length && <div className="production-empty-state"><Link size={30} /><b>共有URLはまだありません</b></div>}
        </div>
      </section>

      <details className="production-link-section production-folder-section">
        <summary>
          <div><FolderOpen size={20} /><div><h3>収録フォルダー一覧</h3><p>キャラクターごとのGoogle Drive録音先です。</p></div></div>
          <span>{orderedLinkedCharacters.length}フォルダー<ChevronDown size={18} /></span>
        </summary>
        <div className="production-link-list">
          {orderedLinkedCharacters.map((character, characterIndex) => {
            const assignedMember = project.castMembers.find((member) => member.characterIds.includes(character.id));
            return (
              <article
                className={`production-link-row${draggingFolderId === character.id ? " dragging" : ""}${dragOverFolderId === character.id ? " drag-over" : ""}`}
                data-recording-folder-id={character.id}
                key={character.id}
                style={{ "--character-color": character.color }}
                onDragOver={(event) => hoverFolder(event, character.id)}
                onDrop={(event) => finishFolderDrag(event, character.id)}
              >
                <header className="production-link-character">
                  <i />
                  <div><h3>{character.name}</h3><span>{assignedMember?.actorName || "担当声優未設定"}</span></div>
                </header>
                <div className="production-link-fields">
                  <CharacterLinkField
                    icon={FolderOpen}
                    label="収録フォルダー"
                    service="Google Drive"
                    value={character.recordingFolderUrl}
                    placeholder="https://drive.google.com/..."
                    readOnly={!canEditScript}
                    onChange={(value) => patchCharacterLink(character.id, "recordingFolderUrl", value)}
                  />
                </div>
                {canEditScript && (
                  <div className="recording-folder-reorder-actions" aria-label={`${character.name}の並び替え`}>
                    <button
                      type="button"
                      className="icon-button recording-folder-drag-handle"
                      draggable
                      title="ドラッグして並べ替え"
                      aria-label={`${character.name}をドラッグして並べ替え`}
                      onDragStart={(event) => beginFolderDrag(event, character.id)}
                      onDragEnd={(event) => finishFolderDrag(event)}
                    ><GripVertical size={17} /></button>
                    <button type="button" className="icon-button" title="一つ上へ" aria-label={`${character.name}を一つ上へ`} disabled={characterIndex === 0} onClick={() => moveRecordingFolder(character.id, orderedLinkedCharacters[characterIndex - 1]?.id)}><ArrowUp size={16} /></button>
                    <button type="button" className="icon-button" title="一つ下へ" aria-label={`${character.name}を一つ下へ`} disabled={characterIndex === orderedLinkedCharacters.length - 1} onClick={() => moveRecordingFolder(character.id, orderedLinkedCharacters[characterIndex + 1]?.id)}><ArrowDown size={16} /></button>
                  </div>
                )}
              </article>
            );
          })}
          {!linkedCharacters.length && <div className="production-empty-state"><FolderOpen size={30} /><b>現在の台本に登場するキャラクターがいません</b></div>}
        </div>
      </details>
    </div>
  );
}

function MaterialPreview({ material }) {
  if (!material.url) return <div className={`material-preview empty ratio-${material.aspectRatio.replace(":", "-") || "audio"}`}>{material.category === "サムネイル" ? <FileImage size={26} /> : <FileAudio size={26} />}</div>;
  if (material.category === "サムネイル") {
    return <div className={`material-preview ratio-${material.aspectRatio.replace(":", "-") || "16-9"}`}><img src={getImageUrl(material.url)} alt={material.title} /></div>;
  }
  return <PersistentAudioButton material={material} />;
}

function ConfirmedMaterialsView({ project, updateProject, canEditScript = true }) {
  const [filter, setFilter] = useState("すべて");
  const [message, setMessage] = useState("");
  const [draggingMaterialId, setDraggingMaterialId] = useState("");
  const [dragOverMaterialId, setDragOverMaterialId] = useState("");
  const pointerDragRef = useRef(null);
  const visibleMaterials = filter === "すべて" ? project.materials : project.materials.filter((material) => material.category === filter);

  const addMaterial = (category = filter === "すべて" ? "主題歌" : filter) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      materials: [{
        id: newId("material"), category, title: `${category} 新規素材`, url: "", fileName: "",
        aspectRatio: category === "サムネイル" ? "16:9" : "", status: "準備中", notes: "", updatedAt: new Date().toISOString()
      }, ...current.materials]
    }));
  };

  const patchMaterial = (materialId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      materials: current.materials.map((material) => material.id === materialId ? { ...material, ...patch, updatedAt: new Date().toISOString() } : material)
    }));
  };

  const moveMaterial = (sourceId, targetId) => {
    if (!canEditScript || !sourceId || !targetId || sourceId === targetId) return;
    const movedMaterial = project.materials.find((material) => material.id === sourceId);
    updateProject((current) => ({
      ...current,
      materials: reorderProductionMaterials(current.materials, sourceId, targetId)
    }));
    setMessage(`「${movedMaterial?.title || "素材"}」の並び順を保存しました。`);
  };

  const resetMaterialDrag = () => {
    pointerDragRef.current = null;
    setDraggingMaterialId("");
    setDragOverMaterialId("");
  };

  const beginMaterialDrag = (event, materialId) => {
    if (!canEditScript || event.button !== 0) return;
    pointerDragRef.current = {
      sourceId: materialId,
      startX: event.clientX,
      startY: event.clientY,
      targetId: "",
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const trackMaterialDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    event.preventDefault();
    drag.moved = true;
    setDraggingMaterialId(drag.sourceId);
    if (event.clientY < 72) window.scrollBy({ top: -18 });
    if (event.clientY > window.innerHeight - 72) window.scrollBy({ top: 18 });
    const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-material-id]")?.dataset.materialId || "";
    drag.targetId = targetId && targetId !== drag.sourceId ? targetId : "";
    setDragOverMaterialId(drag.targetId);
  };

  const finishMaterialDrag = (event) => {
    const drag = pointerDragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved && drag.targetId) moveMaterial(drag.sourceId, drag.targetId);
    resetMaterialDrag();
  };

  const uploadMaterial = async (material, file) => {
    if (!canEditScript || material.category !== "サムネイル") return;
    try {
      const runtime = getWordPressRuntime();
      const imageUrl = runtime
        ? (await uploadWordPressImage(file)).url
        : await readFileAsDataUrl(file);
      patchMaterial(material.id, { url: imageUrl, fileName: file.name });
      setMessage(`${file.name} を登録しました。`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="production-page-stack">
      <div className="material-toolbar">
        <div className="material-filters" role="tablist" aria-label="素材の種類">
          {["すべて", ...PRODUCTION_MATERIAL_CATEGORIES].map((category) => (
            <button type="button" className={filter === category ? "active" : ""} key={category} onClick={() => setFilter(category)}>{category}<span>{category === "すべて" ? project.materials.length : project.materials.filter((material) => material.category === category).length}</span></button>
          ))}
        </div>
        {canEditScript && <button type="button" className="primary" onClick={() => addMaterial()}><Plus size={16} />素材</button>}
      </div>
      {message && <p className="production-inline-message">{message}</p>}
      <div className="material-library-grid">
        {visibleMaterials.map((material) => (
          <article
            className={`material-editor${draggingMaterialId === material.id ? " dragging" : ""}${dragOverMaterialId === material.id ? " drag-over" : ""}`}
            data-material-id={material.id}
            key={material.id}
          >
            <header>
              {canEditScript && <button
                type="button"
                className="icon-button material-drag-handle"
                aria-label={`「${material.title}」を並べ替え`}
                title="ドラッグして並べ替え"
                onPointerDown={(event) => beginMaterialDrag(event, material.id)}
                onPointerMove={trackMaterialDrag}
                onPointerUp={finishMaterialDrag}
                onPointerCancel={resetMaterialDrag}
                onKeyDown={(event) => {
                  if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const visibleIndex = visibleMaterials.findIndex((item) => item.id === material.id);
                  const target = visibleMaterials[visibleIndex + (event.key === "ArrowUp" ? -1 : 1)];
                  if (target) moveMaterial(material.id, target.id);
                }}
              ><GripVertical size={17} /></button>}
              <span className={`material-category category-${material.category}`}>{material.category}</span>
              <select aria-label="素材の状態" value={material.status} disabled={!canEditScript} onChange={(event) => patchMaterial(material.id, { status: event.target.value })}>{PRODUCTION_MATERIAL_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              {canEditScript && <button type="button" className="icon-button danger-icon" title="素材を削除" onClick={() => {
                if (!confirm(`「${material.title}」を削除しますか？`)) return;
                updateProject((current) => ({ ...current, materials: current.materials.filter((item) => item.id !== material.id) }));
              }}><Trash2 size={16} /></button>}
            </header>
            <MaterialPreview material={material} />
            <div className="material-fields">
              <label><span>素材名</span><input value={material.title} readOnly={!canEditScript} onChange={(event) => patchMaterial(material.id, { title: event.target.value })} /></label>
              <label><span>種類</span><select value={material.category} disabled={!canEditScript} onChange={(event) => patchMaterial(material.id, { category: event.target.value, aspectRatio: event.target.value === "サムネイル" ? material.aspectRatio || "16:9" : "" })}>{PRODUCTION_MATERIAL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              {material.category === "サムネイル" && <label><span>比率</span><select value={material.aspectRatio} disabled={!canEditScript} onChange={(event) => patchMaterial(material.id, { aspectRatio: event.target.value })}>{MATERIAL_ASPECT_RATIOS.filter(Boolean).map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>}
              <label className="wide"><span>{material.category === "サムネイル" ? "画像URL" : "Google Drive共有URL"}</span><input value={material.url.startsWith("data:") ? "" : material.url} placeholder={material.url.startsWith("data:") ? `${material.fileName} を登録済み` : "https://drive.google.com/..."} readOnly={!canEditScript} onChange={(event) => patchMaterial(material.id, { url: event.target.value, fileName: "" })} /></label>
              <label className="wide"><span>メモ</span><BufferedTextarea value={material.notes} readOnly={!canEditScript} onCommit={(notes) => patchMaterial(material.id, { notes })} /></label>
            </div>
            <footer>
              {canEditScript && (material.category === "サムネイル" ? (
                <label className="secondary material-upload-button"><Upload size={16} /><span>画像を選択</span><input type="file" accept={WORDPRESS_IMAGE_ACCEPT} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadMaterial(material, file);
                  event.target.value = "";
                }} /></label>
              ) : <span className="material-drive-note"><FolderOpen size={16} />音声はGoogle Driveで管理</span>)}
              {canEditScript && material.url && !material.url.startsWith("data:") && <a href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />元ファイル</a>}
            </footer>
          </article>
        ))}
      </div>
      {!visibleMaterials.length && <div className="production-empty-state"><Music2 size={30} /><b>{filter === "すべて" ? "素材はまだありません" : `${filter}はまだありません`}</b>{canEditScript && <button type="button" className="secondary" onClick={() => addMaterial()}>追加する</button>}</div>}
    </div>
  );
}

const makeSePromptEditorDraft = (material) => {
  const normalized = normalizeSePromptDraft(material.sePrompt, material);
  const generated = buildSePromptOutputs(material, normalized, material.locations || []);
  return {
    ...normalized,
    codexPrompt: normalized.codexPrompt || generated.codexPrompt,
    elevenLabsPrompt: normalized.elevenLabsPrompt || generated.elevenLabsPrompt,
    fireflyPrompt: normalized.fireflyPrompt
  };
};

const copySePromptText = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
};

function ElevenLabsConnectionPanel({ settings, loading, error, onSave, onClear, onRefresh }) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const usage = getElevenLabsUsageView(settings || {});
  const connected = Boolean(settings?.connected);
  const hasApiKey = Boolean(settings?.hasApiKey);
  const tierLabel = settings?.tier
    ? settings.tier.charAt(0).toUpperCase() + settings.tier.slice(1)
    : "プラン未確認";

  const saveApiKey = async () => {
    const value = apiKey.trim();
    if (!value) {
      setNotice("ElevenLabs APIキーを入力してください。");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await onSave(value);
      setApiKey("");
      setNotice("このオーナーのElevenLabs APIキーを安全に保存しました。");
    } catch (saveError) {
      setNotice(saveError.message || "APIキーを保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const clearApiKey = async () => {
    if (!globalThis.confirm("このオーナーに保存したElevenLabs APIキーを削除しますか？")) return;
    setBusy(true);
    setNotice("");
    try {
      await onClear();
      setApiKey("");
      setNotice("保存していたAPIキーを削除しました。");
    } catch (clearError) {
      setNotice(clearError.message || "APIキーを削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className={`elevenlabs-connection${connected ? " connected" : ""}`} defaultOpen={!hasApiKey}>
      <summary>
        <div><Sparkles size={19} /><span><b>ElevenLabs Sound Effects連携</b><small>オーナー本人のプランからSEを直接生成</small></span></div>
        <div><em className={connected ? "connected" : "disconnected"}>{loading ? "確認中" : connected ? `${tierLabel} 接続済み` : hasApiKey ? "再確認が必要" : "未接続"}</em><ChevronDown size={18} /></div>
      </summary>
      <div className="elevenlabs-connection-body">
        <div className="elevenlabs-privacy-note"><ShieldCheck size={18} /><span><b>APIキーは制作オーナー専用の保存先で管理</b><small>声優さんには表示されず、配布データにも含めません。</small></span></div>

        {hasApiKey && (
          <div className="elevenlabs-usage">
            <div><span>契約プラン</span><b>{tierLabel}</b></div>
            <div><span>全体の利用量</span><b>{usage.limit ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()}` : "取得待ち"}</b></div>
            <div><span>このツールから</span><b>{usage.toolGenerations}回生成</b></div>
            <div><span>次回リセット</span><b>{settings?.nextResetAt ? formatDate(settings.nextResetAt) : "未確認"}</b></div>
            {usage.limit > 0 && <span className="elevenlabs-usage-bar" aria-label={`ElevenLabs利用率 ${usage.percent}%`}><i style={{ width: `${usage.percent}%` }} /></span>}
          </div>
        )}

        <div className="elevenlabs-key-row">
          <label><span>{hasApiKey ? "APIキーを入れ替える" : "ElevenLabs APIキー"}</span><input type="password" autoComplete="off" spellCheck="false" value={apiKey} placeholder="sk_..." onChange={(event) => setApiKey(event.target.value)} /></label>
          <button type="button" className="primary" disabled={busy || !apiKey.trim()} onClick={saveApiKey}>{busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}キーを保存</button>
          {hasApiKey && <button type="button" className="secondary" disabled={busy || loading} onClick={onRefresh}><RotateCcw size={16} />残量を更新</button>}
          {hasApiKey && <button type="button" className="danger" disabled={busy} onClick={clearApiKey}><Trash2 size={16} />キーを削除</button>}
        </div>
        <p className="elevenlabs-key-help">ElevenLabsで「Sound Effectsの生成」と「Userの読み取り」を許可したキーを作り、念のためキー側の利用上限も設定してください。Starterの目安は月約{ELEVENLABS_STARTER_GENERATION_GUIDE}回ですが、音の長さなどで消費量は変わります。</p>
        <a className="secondary elevenlabs-key-link" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer"><ExternalLink size={16} />ElevenLabsでAPIキーを作る</a>
        {(notice || error || settings?.connectionWarning) && <p className={`se-prompt-status${error || settings?.connectionWarning ? " error" : ""}`} aria-live="polite">{notice || error || settings?.connectionWarning}</p>}
      </div>
    </details>
  );
}

function SePromptBuilder({ material, canEdit = true, onSave, elevenLabsSettings, onElevenLabsSettingsChange }) {
  const [draft, setDraft] = useState(() => makeSePromptEditorDraft(material));
  const [activeTarget, setActiveTarget] = useState("codex");
  const [status, setStatus] = useState("");
  const [generation, setGeneration] = useState({ loading: false, error: "", result: null });

  useEffect(() => {
    setDraft(makeSePromptEditorDraft(material));
    setActiveTarget("codex");
    setStatus("");
    setGeneration({ loading: false, error: "", result: null });
  }, [material.id]);

  const promptTargets = {
    codex: {
      key: "codexPrompt",
      name: "Codex",
      outputLabel: "Codexへ渡す指示",
      copyLabel: "Codex用をコピー"
    },
    elevenlabs: {
      key: "elevenLabsPrompt",
      name: "ElevenLabs",
      outputLabel: "ElevenLabsへ貼るプロンプト",
      copyLabel: "ElevenLabs用をコピー"
    },
    firefly: {
      key: "fireflyPrompt",
      name: "Adobe Firefly",
      outputLabel: "Adobe Fireflyへ貼る英語プロンプト",
      copyLabel: "Firefly用をコピー"
    }
  };
  const activePromptTarget = promptTargets[activeTarget] || promptTargets.codex;

  const updateSettings = (patch) => {
    setDraft((current) => {
      const next = normalizeSePromptDraft({ ...current, ...patch }, material);
      return { ...next, ...buildSePromptOutputs(material, next, material.locations || []) };
    });
    setStatus("条件に合わせてCodex用とElevenLabs用のプロンプトを更新しました。Firefly用の英語は保持しています。");
  };

  const rebuildPrompts = () => {
    setDraft((current) => ({
      ...current,
      ...buildSePromptOutputs(material, current, material.locations || [])
    }));
    setStatus("現在の素材情報からプロンプトを作り直しました。");
  };

  const savePrompts = () => {
    onSave(normalizeSePromptDraft(draft, material));
    setStatus("SEプロンプトを保存しました。");
  };

  const copyPrompt = async () => {
    const value = draft[activePromptTarget.key] || "";
    try {
      const copied = await copySePromptText(value);
      if (!copied) throw new Error("copy failed");
      setStatus(`${activePromptTarget.name}用プロンプトをコピーしました。`);
    } catch {
      setStatus("コピーできませんでした。文章を選択してコピーしてください。");
    }
  };

  const generateWithElevenLabs = async () => {
    const options = normalizeElevenLabsGenerationOptions({
      prompt: draft.elevenLabsPrompt,
      durationSeconds: draft.durationSeconds,
      promptInfluence: draft.promptInfluence,
      loop: draft.mode === "loop"
    });
    if (!options.prompt) {
      setGeneration({ loading: false, error: "ElevenLabs用プロンプトを入力してください。", result: null });
      return;
    }
    const confirmed = globalThis.confirm(
      `ElevenLabsのご自身の利用枠を使い、${options.durationSeconds}秒のSEを1音生成します。よろしいですか？`
    );
    if (!confirmed) return;

    setGeneration({ loading: true, error: "", result: null });
    try {
      const result = await generateWordPressElevenLabsSound({
        ...options,
        fileName: makeElevenLabsDownloadName(material),
        confirmed: true
      });
      setGeneration({ loading: false, error: "", result });
      if (result.settings) onElevenLabsSettingsChange?.(result.settings);
      setStatus("ElevenLabsでSEを生成しました。試聴して、必要ならMP3を保存してください。");
    } catch (generationError) {
      setGeneration({ loading: false, error: generationError.message || "SEを生成できませんでした。", result: null });
    }
  };

  const activePrompt = draft[activePromptTarget.key] || "";
  const activePromptKey = activePromptTarget.key;
  const activePromptLength = countElevenLabsPromptCharacters(activePrompt);
  const generatedAudioUrl = makeElevenLabsAudioDataUrl(generation.result || {});

  return (
    <details className="se-prompt-builder">
      <summary>
        <div><Sparkles size={17} /><span><b>SE制作プロンプト</b><small>Codex / ElevenLabs / Adobe Firefly</small></span></div>
        <div><em>プロンプト作成はAPI不使用</em><ChevronDown size={17} /></div>
      </summary>
      <div className="se-prompt-builder-body">
        <div className="se-prompt-settings">
          <label><span>音の形</span><select value={draft.mode} disabled={!canEdit} onChange={(event) => updateSettings({ mode: event.target.value })}>{SE_PROMPT_MODE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <label><span>長さ（秒）</span><input type="number" min="0.5" max="30" step="0.5" value={draft.durationSeconds} readOnly={!canEdit} onChange={(event) => updateSettings({ durationSeconds: event.target.value })} /></label>
          <label><span>距離感</span><select value={draft.distance} disabled={!canEdit} onChange={(event) => updateSettings({ distance: event.target.value })}>{SE_PROMPT_DISTANCE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <label><span>空間</span><select value={draft.space} disabled={!canEdit} onChange={(event) => updateSettings({ space: event.target.value })}>{SE_PROMPT_SPACE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <label><span>強さ</span><select value={draft.intensity} disabled={!canEdit} onChange={(event) => updateSettings({ intensity: event.target.value })}>{SE_PROMPT_INTENSITY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <label><span>質感</span><select value={draft.style} disabled={!canEdit} onChange={(event) => updateSettings({ style: event.target.value })}>{SE_PROMPT_STYLE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          <label className="se-prompt-influence"><span>指示への忠実度 <b>{Math.round(draft.promptInfluence * 100)}%</b></span><input type="range" min="0" max="1" step="0.1" value={draft.promptInfluence} disabled={!canEdit} onChange={(event) => updateSettings({ promptInfluence: event.target.value })} /></label>
          <label className="wide"><span>追加したい音・タイミング</span><textarea value={draft.detail} readOnly={!canEdit} placeholder="例：最初は小さく、3秒後に雷を一度だけ鳴らす" onChange={(event) => updateSettings({ detail: event.target.value })} /></label>
        </div>

        <div className="se-prompt-target-tabs" role="tablist" aria-label="SEプロンプトの出力先">
          <button type="button" role="tab" aria-selected={activeTarget === "codex"} className={activeTarget === "codex" ? "active" : ""} onClick={() => setActiveTarget("codex")}><b>Codex用</b><small>ローカルでコード合成</small></button>
          <button type="button" role="tab" aria-selected={activeTarget === "elevenlabs"} className={activeTarget === "elevenlabs" ? "active" : ""} onClick={() => setActiveTarget("elevenlabs")}><b>ElevenLabs用</b><small>自然音・フォーリー向け</small></button>
          <button type="button" role="tab" aria-selected={activeTarget === "firefly"} className={activeTarget === "firefly" ? "active" : ""} onClick={() => setActiveTarget("firefly")}><b>Adobe Firefly用</b><small>Codexが英語を入力</small></button>
        </div>

        <label className="se-prompt-output">
          <span className="se-prompt-output-label">
            <span>{activePromptTarget.outputLabel}</span>
            {activeTarget === "elevenlabs" && <b>{activePromptLength} / {ELEVENLABS_PROMPT_MAX_LENGTH}文字</b>}
          </span>
          <textarea
            value={activePrompt}
            readOnly={!canEdit}
            placeholder={activeTarget === "firefly" ? "Codexが作成した英語プロンプトをここへ入力して保存します。" : undefined}
            maxLength={activeTarget === "elevenlabs" ? ELEVENLABS_PROMPT_MAX_LENGTH : undefined}
            onChange={(event) => setDraft((current) => ({
              ...current,
              [activePromptKey]: activeTarget === "elevenlabs"
                ? limitElevenLabsPrompt(event.target.value)
                : event.target.value
            }))}
          />
        </label>

        <div className="se-prompt-actions">
          {canEdit && activeTarget !== "firefly" && <button type="button" className="secondary" onClick={rebuildPrompts}><RotateCcw size={16} />素材情報から作り直す</button>}
          <button type="button" className="secondary" disabled={!activePrompt.trim()} onClick={copyPrompt}><ClipboardCopy size={16} />{activePromptTarget.copyLabel}</button>
          {activeTarget === "elevenlabs" && canEdit && elevenLabsSettings?.connected && <button type="button" className="primary" disabled={generation.loading} onClick={generateWithElevenLabs}>{generation.loading ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{generation.loading ? "生成中..." : "このツールで1音生成"}</button>}
          {activeTarget === "elevenlabs" && !elevenLabsSettings?.connected && <a className="secondary" href="https://elevenlabs.io/app/sound-effects" target="_blank" rel="noreferrer"><ExternalLink size={16} />ElevenLabsを開く</a>}
          {activeTarget === "firefly" && <a className="secondary" href="https://firefly.adobe.com/generate/sound-effects" target="_blank" rel="noreferrer"><ExternalLink size={16} />Adobe Fireflyを開く</a>}
          {canEdit && <button type="button" className="primary" onClick={savePrompts}><Save size={16} />保存</button>}
        </div>
        {activeTarget === "elevenlabs" && canEdit && !elevenLabsSettings?.connected && <p className="se-prompt-status">上の「ElevenLabs Sound Effects連携」でAPIキーを保存すると、ここから直接生成できます。</p>}
        {activeTarget === "firefly" && <p className="se-prompt-status">APIは使いません。Codexが作成・入力した英語プロンプトを、SEごとにこの欄へ保存します。</p>}
        {generation.error && <p className="se-prompt-status error" aria-live="polite">{generation.error}</p>}
        {generatedAudioUrl && (
          <div className="elevenlabs-generation-result">
            <div><CheckCircle2 size={18} /><span><b>生成したSE</b><small>{generation.result.durationSeconds}秒{generation.result.creditsUsed ? ` / 今回 ${Number(generation.result.creditsUsed).toLocaleString()}クレジット` : ""}</small></span></div>
            <audio controls preload="metadata" src={generatedAudioUrl}>音声を再生できないブラウザです。</audio>
            <a className="primary" href={generatedAudioUrl} download={generation.result.fileName || makeElevenLabsDownloadName(material)}><Download size={16} />MP3を保存</a>
            <small>この音声はWordPressには保存されていません。必要な音はMP3で保存してください。</small>
          </div>
        )}
        {status && <p className="se-prompt-status" aria-live="polite">{status}</p>}
      </div>
    </details>
  );
}

const toStoredRequiredMaterial = (material, patch = {}) => ({
  id: material.id,
  source: material.source === "script" ? "script" : "manual",
  cueKey: material.cueKey || `manual:${material.id}`,
  chapterId: material.chapterId || "",
  chapterTitle: material.chapterTitle || "",
  category: material.category || "SE",
  title: material.title || "必要なSE",
  searchQuery: material.searchQuery || material.title || "",
  notes: material.notes || "",
  sourceSiteId: material.sourceSiteId || "",
  candidateTitle: material.candidateTitle || "",
  candidatePageUrl: material.candidatePageUrl || "",
  previewUrl: material.previewUrl || "",
  downloadUrl: material.downloadUrl || "",
  confirmedMaterialId: material.confirmedMaterialId || "",
  commonSeName: material.commonSeName || "",
  sePrompt: normalizeSePromptDraft(material.sePrompt, material),
  ...patch,
  updatedAt: new Date().toISOString()
});

const getRequiredMaterialChapterFolderKey = (title) => {
  const compact = String(title || "").replace(/\s+/g, "").trim();
  const chapterMatch = compact.match(/^第([^章]+)章/);
  return chapterMatch ? `chapter:${chapterMatch[1]}` : compact.toLocaleLowerCase("ja-JP");
};

const isRequiredMaterialChapterFolderMatch = (folder, chapter) => Boolean(
  (chapter?.id && String(folder?.chapterId || "") === String(chapter.id))
  || (chapter?.title && String(folder?.chapterTitle || "") === String(chapter.title))
  || (
    getRequiredMaterialChapterFolderKey(folder?.chapterTitle)
    && getRequiredMaterialChapterFolderKey(folder?.chapterTitle) === getRequiredMaterialChapterFolderKey(chapter?.title)
  )
);

const findRequiredMaterialChapterFolder = (folders, chapter) => (
  (Array.isArray(folders) ? folders : []).find((folder) => isRequiredMaterialChapterFolderMatch(folder, chapter)) || null
);

function RequiredMaterialsView({
  project,
  updateProject,
  requiredMaterials,
  dismissedMaterials,
  canEditScript = true,
  onOpenConfirmed
}) {
  const [message, setMessage] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [listMode, setListMode] = useState("original");
  const [reusableOnly, setReusableOnly] = useState(false);
  const [draggingSourceSiteId, setDraggingSourceSiteId] = useState("");
  const [dragOverSourceSiteId, setDragOverSourceSiteId] = useState("");
  const [storageFoldersOpen, setStorageFoldersOpen] = useState(true);
  const [elevenLabsSettings, setElevenLabsSettings] = useState(null);
  const [elevenLabsLoading, setElevenLabsLoading] = useState(false);
  const [elevenLabsError, setElevenLabsError] = useState("");
  const sourceSiteDragRef = useRef("");
  const hasElevenLabsRuntime = Boolean(canEditScript && getWordPressRuntime());
  const chapterGroups = useMemo(
    () => getProductionRequiredMaterialChapterGroups(project, requiredMaterials),
    [project.lines, project.derivedLineProgress, requiredMaterials]
  );
  const selectedChapterGroup = chapterGroups.find((group) => group.id === chapterFilter) || null;
  const chapterOptions = chapterGroups.filter((group) => !group.unassigned);
  const visibleRequiredMaterials = selectedChapterGroup ? selectedChapterGroup.materials : requiredMaterials;
  const commonSeGroups = useMemo(
    () => groupRequiredMaterialsAsCommonSe(requiredMaterials),
    [requiredMaterials]
  );
  const selectedMaterialIds = useMemo(
    () => new Set(visibleRequiredMaterials.map((material) => material.id)),
    [visibleRequiredMaterials]
  );
  const visibleCommonSeGroups = commonSeGroups.filter((group) => (
    (chapterFilter === "all" || group.materials.some((material) => selectedMaterialIds.has(material.id)))
    && (!reusableOnly || group.reusable)
  ));
  const commonSeCountByChapterId = new Map(chapterGroups.map((chapter) => {
    const materialIds = new Set(chapter.materials.map((material) => material.id));
    return [chapter.id, commonSeGroups.filter((group) => group.materials.some((material) => materialIds.has(material.id))).length];
  }));
  const configuredChapterFolderCount = chapterOptions.filter((chapter) => (
    isWebUrl(findRequiredMaterialChapterFolder(project.requiredMaterialChapterFolders, chapter)?.url)
  )).length;

  useEffect(() => {
    setChapterFilter("all");
  }, [project.id]);

  useEffect(() => {
    if (chapterFilter !== "all" && !chapterGroups.some((group) => group.id === chapterFilter)) {
      setChapterFilter("all");
    }
  }, [chapterFilter, chapterGroups]);

  useEffect(() => {
    if (!hasElevenLabsRuntime) {
      setElevenLabsSettings(null);
      setElevenLabsError("");
      return undefined;
    }
    let active = true;
    setElevenLabsLoading(true);
    setElevenLabsError("");
    getWordPressElevenLabsSettings()
      .then((settings) => {
        if (active) setElevenLabsSettings(settings);
      })
      .catch((loadError) => {
        if (active) setElevenLabsError(loadError.message || "ElevenLabsの接続状態を確認できませんでした。");
      })
      .finally(() => {
        if (active) setElevenLabsLoading(false);
      });
    return () => { active = false; };
  }, [hasElevenLabsRuntime, project.id]);

  const refreshElevenLabsSettings = async () => {
    setElevenLabsLoading(true);
    setElevenLabsError("");
    try {
      const settings = await getWordPressElevenLabsSettings();
      setElevenLabsSettings(settings);
      return settings;
    } catch (refreshError) {
      setElevenLabsError(refreshError.message || "ElevenLabsの接続状態を確認できませんでした。");
      return null;
    } finally {
      setElevenLabsLoading(false);
    }
  };

  const saveElevenLabsApiKey = async (apiKey) => {
    setElevenLabsLoading(true);
    setElevenLabsError("");
    try {
      const settings = await saveWordPressElevenLabsSettings({ apiKey });
      setElevenLabsSettings(settings);
      return settings;
    } catch (saveError) {
      setElevenLabsError(saveError.message || "ElevenLabs APIキーを保存できませんでした。");
      throw saveError;
    } finally {
      setElevenLabsLoading(false);
    }
  };

  const clearElevenLabsApiKey = async () => {
    setElevenLabsLoading(true);
    setElevenLabsError("");
    try {
      const settings = await saveWordPressElevenLabsSettings({ clearApiKey: true });
      setElevenLabsSettings(settings);
      return settings;
    } catch (clearError) {
      setElevenLabsError(clearError.message || "ElevenLabs APIキーを削除できませんでした。");
      throw clearError;
    } finally {
      setElevenLabsLoading(false);
    }
  };

  const patchRequiredMaterial = (material, patch) => {
    if (!canEditScript) return;
    updateProject((current) => {
      const stored = toStoredRequiredMaterial(material, patch);
      const exists = current.requiredMaterials.some((item) => item.id === material.id);
      return {
        ...current,
        requiredMaterials: exists
          ? current.requiredMaterials.map((item) => item.id === material.id ? stored : item)
          : [stored, ...current.requiredMaterials]
      };
    });
  };

  const patchCommonSeGroup = (group, patch, nextMessage = "") => {
    if (!canEditScript) return;
    updateProject((current) => {
      const storedById = new Map(group.materials.map((material) => [
        material.id,
        toStoredRequiredMaterial(material, patch)
      ]));
      const existingIds = new Set(current.requiredMaterials.map((material) => material.id));
      const nextRequiredMaterials = current.requiredMaterials.map((material) => storedById.get(material.id) || material);
      group.materials.forEach((material) => {
        if (!existingIds.has(material.id)) nextRequiredMaterials.unshift(storedById.get(material.id));
      });
      return { ...current, requiredMaterials: nextRequiredMaterials };
    });
    if (nextMessage) setMessage(nextMessage);
  };

  const addRequiredMaterial = () => {
    if (!canEditScript) return;
    const id = newId("required_material");
    const assignedChapter = selectedChapterGroup && !selectedChapterGroup.unassigned
      ? selectedChapterGroup
      : null;
    updateProject((current) => ({
      ...current,
      requiredMaterials: [toStoredRequiredMaterial({
        id,
        source: "manual",
        cueKey: `manual:${id}`,
        chapterId: assignedChapter?.id || "",
        chapterTitle: assignedChapter?.title || "",
        category: "SE",
        title: "必要なSE",
        searchQuery: "必要なSE"
      }), ...current.requiredMaterials]
    }));
    setMessage(assignedChapter
      ? `${assignedChapter.title}へ必要素材を手動で追加しました。`
      : "必要素材を手動で追加しました。対象の章を選んでください。");
  };

  const patchManualMaterialChapter = (material, chapterId) => {
    const chapter = chapterOptions.find((group) => group.id === chapterId);
    patchRequiredMaterial(material, {
      chapterId: chapter?.id || "",
      chapterTitle: chapter?.title || ""
    });
    if (chapterFilter !== "all") setChapterFilter(chapter?.id || "required_material_chapter_unassigned");
  };

  const removeRequiredMaterial = (material) => {
    if (!canEditScript || !confirm(`「${material.title}」を必要素材から外しますか？`)) return;
    updateProject((current) => ({
      ...current,
      requiredMaterials: material.source === "script"
        ? current.requiredMaterials
        : current.requiredMaterials.filter((item) => item.id !== material.id),
      dismissedRequiredMaterialKeys: material.source === "script"
        ? [...new Set([...current.dismissedRequiredMaterialKeys, material.cueKey])]
        : current.dismissedRequiredMaterialKeys
    }));
    setMessage(material.source === "script" ? "台本からの自動抽出結果を非表示にしました。" : "手動追加した必要素材を削除しました。");
  };

  const restoreRequiredMaterial = (material) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      dismissedRequiredMaterialKeys: current.dismissedRequiredMaterialKeys.filter((key) => key !== material.cueKey)
    }));
    setMessage(`「${material.title}」を必要素材へ戻しました。`);
  };

  const patchRequiredMaterialFolderUrl = (url) => {
    if (!canEditScript) return;
    updateProject((current) => ({ ...current, requiredMaterialFolderUrl: url }));
  };

  const patchRequiredMaterialChapterFolder = (chapter, url) => {
    if (!canEditScript || !chapter) return;
    updateProject((current) => {
      const folders = Array.isArray(current.requiredMaterialChapterFolders)
        ? current.requiredMaterialChapterFolders
        : [];
      let replaced = false;
      const nextFolders = folders.reduce((items, folder) => {
        if (!isRequiredMaterialChapterFolderMatch(folder, chapter)) {
          items.push(folder);
          return items;
        }
        if (!replaced && url) {
          items.push({ chapterId: chapter.id, chapterTitle: chapter.title, url });
          replaced = true;
        }
        return items;
      }, []);
      if (!replaced && url) nextFolders.push({ chapterId: chapter.id, chapterTitle: chapter.title, url });
      return { ...current, requiredMaterialChapterFolders: nextFolders };
    });
  };

  const addSourceSite = () => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      materialSourceSites: [{
        id: newId("material_source"),
        name: `SE配布サイト${current.materialSourceSites.length + 1}`,
        homeUrl: "",
        searchUrlTemplate: "",
        licenseUrl: "",
        notes: ""
      }, ...current.materialSourceSites]
    }));
  };

  const patchSourceSite = (siteId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      materialSourceSites: current.materialSourceSites.map((site) => site.id === siteId ? { ...site, ...patch } : site)
    }));
  };

  const moveSourceSite = (sourceId, targetId) => {
    if (!canEditScript || !sourceId || !targetId || sourceId === targetId) return;
    const movedSite = project.materialSourceSites.find((site) => site.id === sourceId);
    updateProject((current) => ({
      ...current,
      materialSourceSites: reorderProductionMaterialSourceSites(current.materialSourceSites, sourceId, targetId)
    }));
    setMessage(`「${movedSite?.name || "SE配布サイト"}」の並び順を保存しました。`);
  };

  const beginSourceSiteDrag = (event, siteId) => {
    if (!canEditScript) return;
    sourceSiteDragRef.current = siteId;
    setDraggingSourceSiteId(siteId);
    setDragOverSourceSiteId("");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", siteId);
  };

  const hoverSourceSite = (event, siteId) => {
    if (!sourceSiteDragRef.current || sourceSiteDragRef.current === siteId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverSourceSiteId(siteId);
  };

  const finishSourceSiteDrag = (event, targetId = "") => {
    event.preventDefault();
    const sourceId = sourceSiteDragRef.current;
    if (sourceId && targetId && sourceId !== targetId) moveSourceSite(sourceId, targetId);
    sourceSiteDragRef.current = "";
    setDraggingSourceSiteId("");
    setDragOverSourceSiteId("");
  };

  const removeSourceSite = (site) => {
    if (!canEditScript || !confirm(`「${site.name}」をSE配布サイト一覧から削除しますか？`)) return;
    updateProject((current) => ({
      ...current,
      materialSourceSites: current.materialSourceSites.filter((item) => item.id !== site.id),
      requiredMaterials: current.requiredMaterials.map((material) => material.sourceSiteId === site.id
        ? { ...material, sourceSiteId: "" }
        : material)
    }));
  };

  const registerConfirmedMaterial = (requiredMaterial) => {
    if (!canEditScript) return;
    updateProject((current) => {
      const existing = current.materials.find((material) => material.id === requiredMaterial.confirmedMaterialId);
      const materialId = existing?.id || newId("material");
      const sourceNote = isWebUrl(requiredMaterial.candidatePageUrl)
        ? `配布ページ: ${requiredMaterial.candidatePageUrl}`
        : "";
      const confirmed = {
        id: materialId,
        category: requiredMaterial.category || "SE",
        title: requiredMaterial.candidateTitle || requiredMaterial.title,
        url: requiredMaterial.previewUrl || requiredMaterial.downloadUrl || "",
        fileName: "",
        aspectRatio: "",
        status: "完成",
        notes: [requiredMaterial.notes, sourceNote].filter(Boolean).join("\n"),
        updatedAt: new Date().toISOString()
      };
      const storedRequired = toStoredRequiredMaterial(requiredMaterial, { confirmedMaterialId: materialId });
      const hasStoredRequired = current.requiredMaterials.some((item) => item.id === requiredMaterial.id);
      return {
        ...current,
        materials: existing
          ? current.materials.map((material) => material.id === materialId ? confirmed : material)
          : [confirmed, ...current.materials],
        requiredMaterials: hasStoredRequired
          ? current.requiredMaterials.map((material) => material.id === requiredMaterial.id ? storedRequired : material)
          : [storedRequired, ...current.requiredMaterials]
      };
    });
    setMessage(`「${requiredMaterial.candidateTitle || requiredMaterial.title}」を確定素材へ登録しました。`);
  };

  const confirmedMaterialIds = new Set(project.materials.map((material) => material.id));
  const automaticCount = requiredMaterials.filter((material) => material.source === "script").length;
  const manualCount = requiredMaterials.length - automaticCount;
  const commonSeReductionCount = Math.max(0, requiredMaterials.length - commonSeGroups.length);

  return (
    <div className="production-page-stack required-materials-view">
      <div className="required-materials-toolbar">
        <div>
          <span><Sparkles size={17} />台本から自動抽出 {automaticCount}</span>
          <span><Plus size={17} />手動追加 {manualCount}</span>
        </div>
        {canEditScript && <button type="button" className="primary" onClick={addRequiredMaterial}><Plus size={16} />必要素材</button>}
      </div>
      {message && <p className="production-inline-message">{message}</p>}

      <div className="required-material-view-mode">
        <div role="tablist" aria-label="必要素材のまとめ方">
          <button type="button" role="tab" aria-selected={listMode === "original"} className={listMode === "original" ? "active" : ""} onClick={() => setListMode("original")}><ListTodo size={17} /><span><b>抽出一覧</b><small>{requiredMaterials.length}件</small></span></button>
          <button type="button" role="tab" aria-selected={listMode === "common"} className={listMode === "common" ? "active" : ""} onClick={() => setListMode("common")}><Layers3 size={17} /><span><b>共通SE</b><small>{commonSeGroups.length}音</small></span></button>
        </div>
        {listMode === "common" && (
          <div className="common-se-view-options">
            <span><b>{requiredMaterials.length}</b>件 → <b>{commonSeGroups.length}</b>音 <small>（{commonSeReductionCount}件分を統合）</small></span>
            <label className={reusableOnly ? "checked" : ""}><input type="checkbox" checked={reusableOnly} onChange={(event) => setReusableOnly(event.target.checked)} />複数回使えるSEだけ</label>
          </div>
        )}
      </div>

      <div className="required-material-chapter-tabs" role="tablist" aria-label="必要素材を章で絞り込む">
        <button type="button" role="tab" aria-selected={chapterFilter === "all"} className={chapterFilter === "all" ? "active" : ""} onClick={() => setChapterFilter("all")}>
          <b>全章</b><small>{listMode === "common" ? `${commonSeGroups.length}音` : `${requiredMaterials.length}件`}</small>
        </button>
        {chapterGroups.map((group) => (
          <button type="button" role="tab" aria-selected={chapterFilter === group.id} className={chapterFilter === group.id ? "active" : ""} key={group.id} onClick={() => setChapterFilter(group.id)}>
            <b>{group.title}</b><small>{listMode === "common" ? `${commonSeCountByChapterId.get(group.id) || 0}音` : `${group.materials.length}件`}</small>
          </button>
        ))}
      </div>

      <details
        className="required-material-storage"
        open={storageFoldersOpen}
        onToggle={(event) => setStorageFoldersOpen(event.currentTarget.open)}
      >
        <summary>
          <div><FolderOpen size={19} /><span><b>SE保存フォルダー</b><small>章別 {configuredChapterFolderCount}/{chapterOptions.length}件登録</small></span></div>
          <ChevronDown size={18} />
        </summary>
        <div className="required-material-storage-body">
          <p>生成・採用したSEをGoogle Driveへ保存します。URLの編集は制作オーナーだけが行えます。</p>
          <article className="required-material-storage-row parent-folder">
            <div><b>全体の親フォルダー</b><small>章フォルダーをまとめる場所</small></div>
            <input
              type="url"
              aria-label="SE保存先の親フォルダーURL"
              value={project.requiredMaterialFolderUrl}
              readOnly={!canEditScript}
              placeholder="https://drive.google.com/drive/folders/..."
              onChange={(event) => patchRequiredMaterialFolderUrl(event.target.value)}
            />
            <a
              className={`icon-button${isWebUrl(project.requiredMaterialFolderUrl) ? "" : " disabled"}`}
              href={isWebUrl(project.requiredMaterialFolderUrl) ? project.requiredMaterialFolderUrl : undefined}
              target="_blank"
              rel="noreferrer"
              title={isWebUrl(project.requiredMaterialFolderUrl) ? "親フォルダーを開く" : "URLが未登録です"}
              aria-label="SE保存先の親フォルダーを開く"
              aria-disabled={!isWebUrl(project.requiredMaterialFolderUrl)}
            ><ExternalLink size={16} /></a>
          </article>
          <div className="required-material-chapter-folder-grid">
            {chapterOptions.map((chapter) => {
              const folder = findRequiredMaterialChapterFolder(project.requiredMaterialChapterFolders, chapter);
              const folderUrl = folder?.url || "";
              const canOpenFolder = isWebUrl(folderUrl);
              const isActiveChapter = selectedChapterGroup?.id === chapter.id;
              return (
                <article className={`required-material-storage-row${isActiveChapter ? " active" : ""}`} key={chapter.id}>
                  <div><b>{chapter.title}</b><small>{canOpenFolder ? "登録済み" : "未登録"}</small></div>
                  <input
                    type="url"
                    aria-label={`${chapter.title}のSE保存フォルダーURL`}
                    value={folderUrl}
                    readOnly={!canEditScript}
                    placeholder="Google DriveフォルダーURL"
                    onChange={(event) => patchRequiredMaterialChapterFolder(chapter, event.target.value)}
                  />
                  <a
                    className={`icon-button${canOpenFolder ? "" : " disabled"}`}
                    href={canOpenFolder ? folderUrl : undefined}
                    target="_blank"
                    rel="noreferrer"
                    title={canOpenFolder ? `${chapter.title}の保存先を開く` : "URLが未登録です"}
                    aria-label={`${chapter.title}のSE保存フォルダーを開く`}
                    aria-disabled={!canOpenFolder}
                  ><ExternalLink size={16} /></a>
                </article>
              );
            })}
          </div>
        </div>
      </details>

      {hasElevenLabsRuntime && (
        <ElevenLabsConnectionPanel
          settings={elevenLabsSettings}
          loading={elevenLabsLoading}
          error={elevenLabsError}
          onSave={saveElevenLabsApiKey}
          onClear={clearElevenLabsApiKey}
          onRefresh={refreshElevenLabsSettings}
        />
      )}

      <details className="material-source-sites">
        <summary><div><Globe2 size={19} /><span><b>SE配布サイト</b><small>{project.materialSourceSites.length}サイト登録</small></span></div><ChevronDown size={18} /></summary>
        <div className="material-source-sites-body">
          {canEditScript && <button type="button" className="secondary" onClick={addSourceSite}><Plus size={16} />サイトを登録</button>}
          <div className="material-source-site-list">
            {project.materialSourceSites.map((site, siteIndex) => {
              const siteUrl = site.homeUrl || site.searchUrlTemplate || "";
              const canOpenSite = isWebUrl(siteUrl);
              return <article
                className={`material-source-site-row${draggingSourceSiteId === site.id ? " dragging" : ""}${dragOverSourceSiteId === site.id ? " drag-over" : ""}`}
                key={site.id}
                onDragOver={(event) => hoverSourceSite(event, site.id)}
                onDrop={(event) => finishSourceSiteDrag(event, site.id)}
              >
                <label><span>サイト名</span><input value={site.name} readOnly={!canEditScript} onChange={(event) => patchSourceSite(site.id, { name: event.target.value })} /></label>
                <label><span>URL</span><input type="url" value={siteUrl} readOnly={!canEditScript} placeholder="https://..." onChange={(event) => patchSourceSite(site.id, { homeUrl: event.target.value, searchUrlTemplate: event.target.value })} /></label>
                <div className="material-source-site-actions">
                  {canEditScript && <button
                    type="button"
                    className="icon-button material-source-site-drag-handle"
                    draggable
                    title="ドラッグして並べ替え"
                    aria-label={`${site.name || "SE配布サイト"}をドラッグして並べ替え`}
                    onDragStart={(event) => beginSourceSiteDrag(event, site.id)}
                    onDragEnd={(event) => finishSourceSiteDrag(event)}
                  ><GripVertical size={17} /></button>}
                  {canEditScript && <button type="button" className="icon-button" title="一つ上へ" aria-label={`${site.name || "SE配布サイト"}を一つ上へ`} disabled={siteIndex === 0} onClick={() => moveSourceSite(site.id, project.materialSourceSites[siteIndex - 1]?.id)}><ArrowUp size={16} /></button>}
                  {canEditScript && <button type="button" className="icon-button" title="一つ下へ" aria-label={`${site.name || "SE配布サイト"}を一つ下へ`} disabled={siteIndex === project.materialSourceSites.length - 1} onClick={() => moveSourceSite(site.id, project.materialSourceSites[siteIndex + 1]?.id)}><ArrowDown size={16} /></button>}
                  <a className={`icon-button${canOpenSite ? "" : " disabled"}`} href={canOpenSite ? siteUrl : undefined} target="_blank" rel="noreferrer" title={canOpenSite ? `${site.name}を開く` : "URLが未登録です"} aria-label={`${site.name || "SE配布サイト"}を開く`} aria-disabled={!canOpenSite}><ExternalLink size={16} /></a>
                  {canEditScript && <button type="button" className="icon-button danger-icon" title={`${site.name}を削除`} onClick={() => removeSourceSite(site)}><Trash2 size={16} /></button>}
                </div>
              </article>;
            })}
            {!project.materialSourceSites.length && <p className="production-list-empty">SE配布サイトはまだ登録されていません。</p>}
          </div>
        </div>
      </details>

      <div className="required-material-list">
        {listMode === "common" && visibleCommonSeGroups.map((group) => {
          const promptMaterial = group.materials.find((material) => (
            material.sePrompt?.codexPrompt || material.sePrompt?.elevenLabsPrompt || material.sePrompt?.fireflyPrompt
          )) || group.materials[0];
          const commonMaterial = {
            ...promptMaterial,
            id: group.id,
            title: group.title,
            searchQuery: group.title,
            locations: group.locations,
            occurrenceCount: group.occurrenceCount
          };
          const hasConfirmed = group.materials.some((material) => material.confirmedMaterialId && confirmedMaterialIds.has(material.confirmedMaterialId));
          const hasCandidate = group.materials.some((material) => material.candidateTitle || material.candidatePageUrl || material.previewUrl || material.downloadUrl);
          const groupStatus = hasConfirmed ? "確定素材あり" : hasCandidate ? "候補あり" : group.reusable ? "共通化候補" : "個別SE";
          return (
            <details className={`required-material-item common-se-group status-${hasConfirmed ? "confirmed" : hasCandidate ? "candidate" : "open"}`} key={group.id}>
              <summary>
                <div><span className="required-material-source common">共通</span><strong>{group.title}</strong></div>
                <div><small>{group.sourceCount}種類 / {group.chapterCount}章 / {group.occurrenceCount}か所</small><span>{groupStatus}</span><ChevronDown size={17} /></div>
              </summary>
              <div className="required-material-body common-se-group-body">
                <div className="common-se-summary-metrics">
                  <span><b>{group.sourceCount}</b>種類をまとめて確認</span>
                  <span><b>{group.chapterCount}</b>章で使用</span>
                  <span><b>{group.occurrenceCount}</b>か所で使用</span>
                </div>
                <div className="common-se-name-row">
                  <label>
                    <span>共通SE名</span>
                    <input
                      key={`${group.id}:${group.title}`}
                      defaultValue={group.title}
                      readOnly={!canEditScript}
                      onBlur={(event) => {
                        const commonSeName = event.target.value.trim();
                        if (!commonSeName || commonSeName === group.title) return;
                        patchCommonSeGroup(group, { commonSeName }, `「${commonSeName}」へまとめ方を変更しました。`);
                      }}
                    />
                  </label>
                  {canEditScript && group.manuallyNamed && <button type="button" className="secondary" onClick={() => patchCommonSeGroup(group, { commonSeName: "" }, "共通SE名を自動判定へ戻しました。") }><RotateCcw size={15} />自動判定へ戻す</button>}
                </div>
                <details className="common-se-source-list">
                  <summary><span>元の抽出SE</span><b>{group.materials.length}件</b><ChevronDown size={16} /></summary>
                  <div>
                    {group.materials.map((material) => {
                      const chapterTitles = [...new Set([
                        ...(material.locations || []).map((location) => location.chapterTitle).filter(Boolean),
                        material.chapterTitle
                      ].filter(Boolean))];
                      return (
                        <article key={material.id}>
                          <div><strong>{material.title}</strong><small>{chapterTitles.join("、") || "章未設定"} / {Math.max(1, Number(material.occurrenceCount) || 0)}か所</small></div>
                          {canEditScript && group.materials.length > 1 && <button type="button" className="secondary" title="このSEだけ別素材として扱う" onClick={() => patchRequiredMaterial(material, { commonSeName: material.title })}>個別に分ける</button>}
                        </article>
                      );
                    })}
                  </div>
                </details>
                <SePromptBuilder
                  material={commonMaterial}
                  canEdit={canEditScript}
                  elevenLabsSettings={elevenLabsSettings}
                  onElevenLabsSettingsChange={setElevenLabsSettings}
                  onSave={(sePrompt) => patchCommonSeGroup(group, { sePrompt }, `「${group.title}」の共通プロンプトを保存しました。`)}
                />
              </div>
            </details>
          );
        })}
        {listMode === "original" && visibleRequiredMaterials.map((material) => {
          const selectedSite = project.materialSourceSites.find((site) => site.id === material.sourceSiteId);
          const searchUrl = selectedSite ? buildMaterialSourceSearchUrl(selectedSite, material.searchQuery || material.title) : "";
          const isConfirmed = Boolean(material.confirmedMaterialId && confirmedMaterialIds.has(material.confirmedMaterialId));
          const hasCandidate = Boolean(material.candidateTitle || material.candidatePageUrl || material.previewUrl || material.downloadUrl);
          const status = isConfirmed ? "確定素材登録済み" : hasCandidate ? "候補あり" : "未手配";
          const materialChapterIds = new Set((material.locations || []).map((location) => location.chapterId || location.chapterTitle));
          const matchingLocations = selectedChapterGroup && !selectedChapterGroup.unassigned
            ? (material.locations || []).filter((location) => (
              location.chapterId === selectedChapterGroup.id
              || (!location.chapterId && location.chapterTitle === selectedChapterGroup.title)
            ))
            : material.locations || [];
          const manualChapterValue = material.chapterId
            || chapterOptions.find((group) => group.title === material.chapterTitle)?.id
            || "";
          const automaticCommonSeName = getRequiredMaterialCommonSeInfo({ ...material, commonSeName: "" }).name;
          const scopeLabel = material.source === "script"
            ? `${materialChapterIds.size || 1}章 / ${material.occurrenceCount || 0}か所`
            : material.chapterTitle || "章未設定";
          return (
            <details className={`required-material-item status-${isConfirmed ? "confirmed" : hasCandidate ? "candidate" : "open"}`} key={material.id}>
              <summary>
                <div><span className={`required-material-source ${material.source}`}>{material.source === "script" ? "台本" : "手動"}</span><strong>{material.title}</strong></div>
                <div><small>{scopeLabel}</small><span>{status}</span><ChevronDown size={17} /></div>
              </summary>
              <div className="required-material-body">
                {matchingLocations.length > 0 && (
                  <div className="required-material-locations"><b>使用箇所</b><span>{matchingLocations.map((location) => `${location.chapterTitle} / ${location.sceneTitle}`).join("、")}</span></div>
                )}
                {material.source === "manual" && material.chapterTitle && <div className="required-material-locations"><b>対象章</b><span>{material.chapterTitle}</span></div>}
                <div className="required-material-fields">
                  <label><span>必要素材名</span><input value={material.title} readOnly={!canEditScript} onChange={(event) => patchRequiredMaterial(material, { title: event.target.value })} /></label>
                  <label><span>種類</span><select value={material.category} disabled={!canEditScript || material.source === "script"} onChange={(event) => patchRequiredMaterial(material, { category: event.target.value })}>{PRODUCTION_MATERIAL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                  {material.source === "manual" && <label><span>対象章</span><select value={manualChapterValue} disabled={!canEditScript} onChange={(event) => patchManualMaterialChapter(material, event.target.value)}><option value="">章未設定</option>{chapterOptions.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>}
                  <label><span>共通SE名（任意）</span><input key={`${material.id}:${material.commonSeName || "auto"}`} defaultValue={material.commonSeName || ""} readOnly={!canEditScript} placeholder={`自動: ${automaticCommonSeName}`} onBlur={(event) => {
                    const commonSeName = event.target.value.trim();
                    if (commonSeName !== String(material.commonSeName || "")) patchRequiredMaterial(material, { commonSeName });
                  }} /></label>
                  <label><span>検索語</span><input value={material.searchQuery} readOnly={!canEditScript} onChange={(event) => patchRequiredMaterial(material, { searchQuery: event.target.value })} /></label>
                  <label><span>検索サイト</span><select value={material.sourceSiteId} disabled={!canEditScript} onChange={(event) => patchRequiredMaterial(material, { sourceSiteId: event.target.value })}><option value="">未選択</option>{project.materialSourceSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
                  <label><span>候補音源名</span><input value={material.candidateTitle} readOnly={!canEditScript} placeholder="候補が決まったら入力" onChange={(event) => patchRequiredMaterial(material, { candidateTitle: event.target.value })} /></label>
                  <label><span>配布ページURL</span><input type="url" value={material.candidatePageUrl} readOnly={!canEditScript} placeholder="https://..." onChange={(event) => patchRequiredMaterial(material, { candidatePageUrl: event.target.value })} /></label>
                  <label><span>試聴用音声URL</span><input type="url" value={material.previewUrl} readOnly={!canEditScript} placeholder="直接再生URLまたはGoogle Drive" onChange={(event) => patchRequiredMaterial(material, { previewUrl: event.target.value })} /></label>
                  <label><span>ダウンロードURL</span><input type="url" value={material.downloadUrl} readOnly={!canEditScript} placeholder="https://..." onChange={(event) => patchRequiredMaterial(material, { downloadUrl: event.target.value })} /></label>
                  <label className="wide"><span>メモ</span><BufferedTextarea value={material.notes} readOnly={!canEditScript} onCommit={(notes) => patchRequiredMaterial(material, { notes })} /></label>
                </div>
                <SePromptBuilder
                  material={material}
                  canEdit={canEditScript}
                  elevenLabsSettings={elevenLabsSettings}
                  onElevenLabsSettingsChange={setElevenLabsSettings}
                  onSave={(sePrompt) => patchRequiredMaterial(material, { sePrompt })}
                />
                <div className="required-material-actions">
                  {searchUrl && <a className="secondary" href={searchUrl} target="_blank" rel="noreferrer"><Search size={16} />サイトで検索</a>}
                  {isWebUrl(material.previewUrl) && <PersistentAudioButton material={{ id: `required-${material.id}`, title: material.candidateTitle || material.title, category: `${material.category}候補`, url: material.previewUrl }} />}
                  {isWebUrl(material.candidatePageUrl) && <a className="secondary" href={material.candidatePageUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />配布ページ</a>}
                  {isWebUrl(material.downloadUrl) && <a className="secondary" href={material.downloadUrl} target="_blank" rel="noreferrer" download><Download size={16} />ダウンロード</a>}
                  {canEditScript && !isConfirmed && <button type="button" className="primary" onClick={() => registerConfirmedMaterial(material)}><CheckCircle2 size={16} />確定素材へ登録</button>}
                  {isConfirmed && <button type="button" className="secondary" onClick={onOpenConfirmed}><CheckCircle2 size={16} />確定素材を見る</button>}
                  {canEditScript && <button type="button" className="danger" onClick={() => removeRequiredMaterial(material)}><Trash2 size={16} />必要素材から外す</button>}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {!requiredMaterials.length && <div className="production-empty-state"><FileAudio size={30} /><b>必要素材はありません</b>{canEditScript && <button type="button" className="secondary" onClick={addRequiredMaterial}>手動で追加</button>}</div>}
      {listMode === "original" && requiredMaterials.length > 0 && !visibleRequiredMaterials.length && <div className="production-empty-state compact"><FileAudio size={28} /><b>{selectedChapterGroup?.title || "この章"}の必要素材はありません</b>{canEditScript && <button type="button" className="secondary" onClick={addRequiredMaterial}>この章へ追加</button>}</div>}
      {listMode === "common" && requiredMaterials.length > 0 && !visibleCommonSeGroups.length && <div className="production-empty-state compact"><Layers3 size={28} /><b>{reusableOnly ? "複数回使える共通SEはありません" : `${selectedChapterGroup?.title || "この章"}の共通SEはありません`}</b></div>}

      {canEditScript && dismissedMaterials.length > 0 && (
        <details className="dismissed-required-materials">
          <summary><span>非表示にした自動抽出</span><b>{dismissedMaterials.length}</b><ChevronDown size={17} /></summary>
          <div>{dismissedMaterials.map((material) => <button type="button" className="secondary" key={material.cueKey} onClick={() => restoreRequiredMaterial(material)}><RotateCcw size={15} />{material.title}</button>)}</div>
        </details>
      )}
    </div>
  );
}

function MaterialsView({ project, updateProject, canEditScript = true }) {
  const [libraryTab, setLibraryTab] = useState("confirmed");
  const requiredMaterials = useMemo(
    () => getProductionRequiredMaterials(project),
    [project.lines, project.derivedLineProgress, project.requiredMaterials, project.dismissedRequiredMaterialKeys]
  );
  const dismissedMaterials = useMemo(
    () => getDismissedProductionRequiredMaterials(project),
    [project.lines, project.derivedLineProgress, project.dismissedRequiredMaterialKeys]
  );
  return (
    <div className="production-page-stack">
      <div className="material-library-tabs" role="tablist" aria-label="素材管理">
        <button type="button" className={libraryTab === "confirmed" ? "active" : ""} onClick={() => setLibraryTab("confirmed")}><CheckCircle2 size={17} /><span><b>確定素材</b><small>{project.materials.length}件</small></span></button>
        <button type="button" className={libraryTab === "required" ? "active" : ""} onClick={() => setLibraryTab("required")}><ListTodo size={17} /><span><b>必要素材</b><small>{requiredMaterials.length}件</small></span></button>
      </div>
      {libraryTab === "confirmed" ? (
        <ConfirmedMaterialsView project={project} updateProject={updateProject} canEditScript={canEditScript} />
      ) : (
        <RequiredMaterialsView
          project={project}
          updateProject={updateProject}
          requiredMaterials={requiredMaterials}
          dismissedMaterials={dismissedMaterials}
          canEditScript={canEditScript}
          onOpenConfirmed={() => setLibraryTab("confirmed")}
        />
      )}
    </div>
  );
}

function QuestionContext({ project, question }) {
  const line = getRecordingDisplayProject(project).lines.find((item) => item.id === question.lineId);
  if (!line) return <span className="question-context-label">作品全体について</span>;
  const character = project.characters.find((item) => item.id === line.characterId);
  return (
    <div className="question-line-context" style={{ "--character-color": character?.color || "#5f6d7a" }}>
      <span>{line.chapterTitle} / {line.sceneTitle} / {line.kind === "direction" ? "ト書き" : character?.name || "話者未設定"} / {String(line.order).padStart(3, "0")}</span>
      <p><RubyText text={line.text} /></p>
    </div>
  );
}

function QuestionsView({
  project,
  updateProject,
  canEditScript = true,
  currentUser = {},
  onCreateQuestion = null,
  onResolveQuestion = null
}) {
  const [filter, setFilter] = useState("未回答");
  const [draft, setDraft] = useState(() => ({
    authorName: currentUser.accessMode === "guest" ? readPublicQuestionerName() : currentUser.name || "",
    lineId: "",
    body: ""
  }));
  const [message, setMessage] = useState("");
  const [busyQuestionId, setBusyQuestionId] = useState("");
  const [followUpQuestionId, setFollowUpQuestionId] = useState("");
  const [followUpDrafts, setFollowUpDrafts] = useState({});
  const isSharedMember = !canEditScript && typeof onCreateQuestion === "function";
  const currentMemberId = String(currentUser.castMemberId || "");
  const visibleQuestionThreads = buildProductionQuestionThreads(project.questions)
    .filter(({ question }) => filter === "すべて" || question.status === filter);

  const ownsQuestion = (question) => Boolean(question.isOwnedByCurrentVisitor) || (currentMemberId
    ? String(question.castMemberId || "") === currentMemberId
    : Number(currentUser.id) > 0 && Number(question.wpUserId) === Number(currentUser.id));

  const addQuestion = async () => {
    if (!draft.body.trim()) return;
    if (!canEditScript && !isSharedMember) {
      setMessage("質問の共有機能を読み込めませんでした。ページを再読み込みしてください。");
      return;
    }
    if (isSharedMember && !draft.authorName.trim()) {
      setMessage("質問者名を入力してください。");
      return;
    }
    if (isSharedMember) {
      setMessage("質問を送信しています…");
      try {
        await onCreateQuestion(project.id, draft.lineId, draft.body, "", draft.authorName.trim());
        try { globalThis.localStorage?.setItem(PUBLIC_QUESTIONER_NAME_KEY, draft.authorName.trim()); } catch { /* Keep questions usable without storage. */ }
        setDraft((current) => ({ ...current, lineId: "", body: "" }));
        setFilter("未回答");
        setMessage("質問を登録しました。");
      } catch (error) {
        setMessage(error.message);
      }
      return;
    }
    const line = project.lines.find((item) => item.id === draft.lineId);
    const now = new Date().toISOString();
    updateProject((current) => ({
      ...current,
      questions: [{ id: newId("question"), lineId: draft.lineId, characterId: line?.characterId || "", authorName: draft.authorName.trim() || "メンバー", wpUserId: 0, castMemberId: "", parentQuestionId: "", body: draft.body.trim(), answer: "", status: "未回答", createdAt: now, updatedAt: now }, ...current.questions]
    }));
    setDraft({ ...draft, lineId: "", body: "" });
    setFilter("未回答");
  };

  const patchQuestion = (questionId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? { ...question, ...patch, updatedAt: new Date().toISOString() } : question)
    }));
  };

  const resolveQuestion = async (questionId) => {
    if (!onResolveQuestion) return;
    setBusyQuestionId(questionId);
    setMessage("解決済みに更新しています…");
    try {
      await onResolveQuestion(project.id, questionId);
      setMessage("質問を解決済みにしました。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyQuestionId("");
    }
  };

  const submitFollowUp = async (question) => {
    const body = String(followUpDrafts[question.id] || "").trim();
    if (!body || !onCreateQuestion) return;
    setBusyQuestionId(question.id);
    setMessage("追加の質問を送信しています…");
    try {
      await onCreateQuestion(project.id, question.lineId, body, question.id, draft.authorName.trim());
      setFollowUpDrafts((current) => ({ ...current, [question.id]: "" }));
      setFollowUpQuestionId("");
      setFilter("未回答");
      setMessage("追加の質問を未回答へ送りました。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyQuestionId("");
    }
  };

  const lineOptions = useMemo(() => getRecordingDisplayProject(project).lines.filter((line) => line.kind !== "direction"), [project]);

  return (
    <div className="production-page-stack questions-workspace">
      <section className="question-composer">
        <header><CircleHelp size={20} /><div><h3>質問を送る</h3><p>作品全体、または台本のセリフを選んで質問できます。</p></div></header>
        <div className="question-composer-fields">
          <label><span>質問者名</span><input value={draft.authorName} placeholder="表示名" onChange={(event) => setDraft((current) => ({ ...current, authorName: event.target.value }))} /></label>
          <label><span>対象のセリフ</span><select value={draft.lineId} onChange={(event) => setDraft((current) => ({ ...current, lineId: event.target.value }))}><option value="">作品全体について</option>{lineOptions.map((line) => <option key={line.id} value={line.id}>{line.chapterTitle} / {line.sceneTitle} / {getCharacterName(project, line.characterId)} / {String(line.displayOrder ?? line.order).padStart(3, "0")} {line.text.slice(0, 24)}</option>)}</select></label>
          <label className="wide"><span>質問内容</span><textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
        </div>
        <button type="button" className="primary" disabled={!draft.body.trim() || !canEditScript && (!isSharedMember || !draft.authorName.trim())} onClick={addQuestion}><MessageSquareText size={16} />質問を登録</button>
        {message && <p className="production-inline-message">{message}</p>}
      </section>

      <div className="question-status-tabs" role="tablist">
        {["すべて", ...PRODUCTION_QUESTION_STATUSES].map((status) => <button type="button" className={filter === status ? "active" : ""} key={status} onClick={() => setFilter(status)}>{status}<span>{status === "すべて" ? project.questions.length : project.questions.filter((question) => question.status === status).length}</span></button>)}
      </div>

      <div className="question-thread-list">
        {visibleQuestionThreads.map(({ question, depth }) => {
          const isQuestioner = ownsQuestion(question);
          const canResolve = !canEditScript && isQuestioner && (question.isOwnedByCurrentVisitor
            ? question.status === "回答済み" && Boolean(String(question.answer || "").trim())
            : canResolveProductionQuestion(question, currentUser.id, currentMemberId));
          return <article className={`question-thread status-${question.status}${depth ? " is-follow-up" : ""}`} style={{ "--question-depth": Math.min(depth, 3) }} key={question.id}>
            <header>
              <div><b>{question.authorName}</b><time>{formatDate(question.createdAt, true)}</time></div>
              <div><span className={`question-status-label status-${question.status}`}>{question.status}</span>{canEditScript && <button type="button" className="icon-button danger-icon" title="質問を削除" onClick={() => {
                if (!confirm("この質問を削除しますか？")) return;
                updateProject((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id), deletedQuestionIds: [...new Set([...(current.deletedQuestionIds || []), question.id])] }));
              }}><Trash2 size={16} /></button>}</div>
            </header>
            {question.parentQuestionId && <div className="question-follow-up-label"><MessageSquareText size={15} />前の回答への追加質問</div>}
            <QuestionContext project={project} question={question} />
            <p className="question-body">{question.body}</p>
            {canEditScript ? (
              <label className="question-answer"><span>管理者からの回答</span><textarea value={question.answer} placeholder="回答を入力" onChange={(event) => patchQuestion(question.id, { answer: event.target.value })} /></label>
            ) : question.answer ? (
              <div className="member-question-answer">
                <b>管理者からの回答</b>
                <p>{question.answer}</p>
                {canResolve && (
                  <div className="member-question-resolution">
                    <span>回答を確認し、解決したか追加で確認したいかを選んでください。</span>
                    <div className="member-question-resolution-actions">
                      <button type="button" className="secondary" disabled={busyQuestionId === question.id} onClick={() => resolveQuestion(question.id)}><CheckCircle2 size={16} />解決しました</button>
                      <button type="button" className="secondary" disabled={busyQuestionId === question.id} onClick={() => setFollowUpQuestionId((current) => current === question.id ? "" : question.id)}><MessageSquareText size={16} />さらに質問</button>
                    </div>
                    {followUpQuestionId === question.id && (
                      <div className="member-follow-up-composer">
                        <label><span>追加の質問</span><textarea value={followUpDrafts[question.id] || ""} onChange={(event) => setFollowUpDrafts((current) => ({ ...current, [question.id]: event.target.value }))} /></label>
                        <button type="button" className="primary" disabled={!String(followUpDrafts[question.id] || "").trim() || busyQuestionId === question.id} onClick={() => submitFollowUp(question)}><MessageSquareText size={16} />未回答へ送る</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : <p className="question-answer-pending">管理者からの回答を待っています。</p>}
            <footer>
              <span>最終更新 {formatDate(question.updatedAt, true)}</span>
              {canEditScript && <button type="button" className="primary" disabled={!question.answer.trim()} onClick={() => patchQuestion(question.id, { status: question.status === "解決済み" ? "解決済み" : "回答済み" })}>
                <MessageSquareText size={16} />
                {question.status === "未回答" ? "回答を確定" : "回答内容を保存"}
              </button>}
            </footer>
          </article>;
        })}
      </div>
      {!visibleQuestionThreads.length && <div className="production-empty-state"><CheckCircle2 size={30} /><b>{filter}の質問はありません</b></div>}
    </div>
  );
}

function ScheduleView({ project, updateProject, canEditScript = true }) {
  const patchAnnouncement = (announcementId, patch) => updateProject((current) => ({
    ...current,
    announcements: current.announcements.map((item) => item.id === announcementId ? { ...item, ...patch } : item)
  }));

  return (
    <div className="production-page-stack schedule-workspace">
      <ProductionKeyDates project={project} updateProject={updateProject} canEditScript={canEditScript} />

      <section className="schedule-section">
        <header><div><CalendarClock size={20} /><div><h3>追加の期日</h3><p>リテイク期限や確認日など、守る必要がある期日を管理します。</p></div></div>{canEditScript && <button type="button" className="primary" onClick={() => updateProject((current) => ({ ...current, deadlineItems: [...(current.deadlineItems || []), createDeadlineItem()] }))}><Plus size={16} />期日を追加</button>}</header>
        <ScheduleItemsEditor project={project} updateProject={updateProject} canEditScript={canEditScript} collectionKey="deadlineItems" itemLabel="期日" />
      </section>

      <section className="schedule-section">
        <header><div><CalendarClock size={20} /><div><h3>直近の予定</h3><p>収録、編集、打ち合わせ、公開などの制作予定を共有します。</p></div></div>{canEditScript && <button type="button" className="secondary" onClick={() => updateProject((current) => ({ ...current, scheduleItems: [...current.scheduleItems, createScheduleItem()] }))}><Plus size={16} />予定を追加</button>}</header>
        <ScheduleItemsEditor project={project} updateProject={updateProject} canEditScript={canEditScript} itemLabel="予定" />
      </section>

      <section className="schedule-section announcements-editor">
        <header><div><Megaphone size={20} /><div><h3>メンバー全体へのお知らせ</h3><p>ホームの上部に表示する連絡事項です。</p></div></div>{canEditScript && <button type="button" className="secondary" onClick={() => updateProject((current) => ({ ...current, announcements: [{ id: newId("announcement"), title: "新しいお知らせ", body: "", priority: "通常", publishedAt: new Date().toISOString() }, ...current.announcements] }))}><Plus size={16} />お知らせ</button>}</header>
        <div className="announcement-editor-list">
          {project.announcements.map((announcement) => (
            <article className={announcement.priority === "重要" ? "important" : ""} key={announcement.id}>
              <div className="announcement-editor-head">
                <label><span>見出し</span><input value={announcement.title} readOnly={!canEditScript} onChange={(event) => patchAnnouncement(announcement.id, { title: event.target.value })} /></label>
                <label><span>優先度</span><select value={announcement.priority} disabled={!canEditScript} onChange={(event) => patchAnnouncement(announcement.id, { priority: event.target.value })}><option>通常</option><option>重要</option></select></label>
                <label><span>掲載日</span><input type="date" value={toDateInputValue(announcement.publishedAt)} disabled={!canEditScript} onChange={(event) => patchAnnouncement(announcement.id, { publishedAt: event.target.value ? `${event.target.value}T09:00:00.000Z` : "" })} /></label>
                {canEditScript && <button type="button" className="icon-button danger-icon" title="お知らせを削除" onClick={() => updateProject((current) => ({ ...current, announcements: current.announcements.filter((item) => item.id !== announcement.id) }))}><Trash2 size={16} /></button>}
              </div>
              <label><span>本文</span><BufferedTextarea value={announcement.body} readOnly={!canEditScript} onCommit={(body) => patchAnnouncement(announcement.id, { body })} /></label>
            </article>
          ))}
          {!project.announcements.length && <p className="production-list-empty">お知らせはまだありません。</p>}
        </div>
      </section>
    </div>
  );
}

const AUDITION_SOCIAL_TEMPLATE_FIELDS = [
  {
    key: "introductionText",
    label: "冒頭文",
    hint: "{{作品名}} と書いた部分には作品名が入ります。",
    rows: 3
  },
  {
    key: "unpaidNoticeText",
    label: "無償案件について",
    hint: "企画条件や応募前に伝えておきたい内容です。",
    rows: 4
  },
  {
    key: "audioUseNoticeText",
    label: "収録音源の使用について",
    hint: "ボイスドラマと今後のアニメ版での使用について記載します。",
    rows: 5
  },
  {
    key: "applicationConditionsText",
    label: "応募条件",
    hint: "収録環境や発音など、全ての役に共通する条件です。",
    rows: 5
  },
  {
    key: "resultNoticeText",
    label: "結果発表",
    hint: "選考結果の連絡方法を記載します。",
    rows: 3
  },
  {
    key: "closingText",
    label: "締めの文章",
    hint: "フォームURLの後に表示する最後の呼びかけです。",
    rows: 3
  },
  {
    key: "hashtagsText",
    label: "ハッシュタグ",
    hint: "空欄にするとハッシュタグを付けません。",
    rows: 2
  }
];

function AuditionSocialTemplateSettings({ project, updateProject }) {
  const [draft, setDraft] = useState(() => normalizeAuditionSocialTemplate(project.auditionSocialTemplate));
  const [activeTab, setActiveTab] = useState("edit");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(normalizeAuditionSocialTemplate(project.auditionSocialTemplate));
    setMessage("");
  }, [project.id]);

  const savedTemplate = normalizeAuditionSocialTemplate(project.auditionSocialTemplate);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(savedTemplate);
  const previewText = useMemo(() => buildAuditionSocialPost({
    workTitle: "Umbrella Parade",
    roleName: "サンプル役",
    roleSummary: "物語の鍵を握る人物の役です。",
    acceptsFemaleApplicants: true,
    acceptsMaleApplicants: true,
    auditionLines: "サンプルのセリフです。\nもう一つのセリフです。",
    deadline: "2026-08-31T23:59",
    formUrl: "https://docs.google.com/forms/d/e/FORM_ID/viewform",
    template: draft
  }), [draft]);

  const patchDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const saveTemplate = () => {
    const normalized = normalizeAuditionSocialTemplate(draft);
    setDraft(normalized);
    updateProject((current) => ({
      ...current,
      auditionSocialTemplate: normalized
    }));
    setMessage("基本テンプレートを保存しました。次に各役で「募集文を作成」を押した時から反映されます。");
  };

  const resetTemplate = () => {
    if (!globalThis.confirm("募集文の基本テンプレートを初期状態へ戻しますか？すでに作成した役別募集文は変更されません。")) return;
    const defaults = createDefaultAuditionSocialTemplate();
    setDraft(defaults);
    updateProject((current) => ({
      ...current,
      auditionSocialTemplate: defaults
    }));
    setMessage("基本テンプレートを初期状態へ戻しました。既存の役別募集文はそのままです。");
  };

  return <details className="audition-social-template-settings">
    <summary>
      <div><MessageSquareText size={17} /><div><b>募集文テンプレート設定</b><span>全ての役に共通する文章を編集します。</span></div></div>
      <ChevronDown size={17} />
    </summary>
    <div className="audition-template-protected" aria-label="自動で入る項目">
      <b><ShieldCheck size={15} />自動で入る項目</b>
      <span>役名</span><span>役柄・性別</span><span>参考オーディオブック</span><span>収録形式</span><span>セリフ</span><span>締切</span><span>フォームURL</span>
    </div>
    <div className="audition-template-tabs" role="tablist" aria-label="募集文テンプレートの表示">
      <button type="button" className={activeTab === "edit" ? "active" : ""} aria-selected={activeTab === "edit"} onClick={() => setActiveTab("edit")}><MessageSquareText size={15} />編集</button>
      <button type="button" className={activeTab === "preview" ? "active" : ""} aria-selected={activeTab === "preview"} onClick={() => setActiveTab("preview")}><Eye size={15} />プレビュー</button>
    </div>
    {activeTab === "edit" ? <div className="audition-template-fields">
      {AUDITION_SOCIAL_TEMPLATE_FIELDS.map((field) => <label key={field.key}>
        <span><b>{field.label}</b><small>{field.hint}</small></span>
        <textarea rows={field.rows} value={draft[field.key]} onChange={(event) => patchDraft(field.key, event.target.value)} />
      </label>)}
    </div> : <pre className="audition-template-preview">{previewText}</pre>}
    <div className="audition-template-actions">
      <p className={message ? "saved" : ""} role="status">{message || "保存しても、すでに手直しした各役の募集文は上書きされません。"}</p>
      <button type="button" className="secondary" onClick={resetTemplate}><RotateCcw size={15} />初期値に戻す</button>
      <button type="button" className="primary" disabled={!isDirty} onClick={saveTemplate}><Save size={15} />テンプレートを保存</button>
    </div>
  </details>;
}

function AuditionSocialPostEditor({ character, project, lineCandidates = [], roleProgress = {}, imageFolderUrl = "", onSave }) {
  const initialLines = () => lineCandidates.slice(0, 2).map((candidate) => candidate.text).join("\n");
  const initialRoleSummary = () => roleProgress.auditionRoleSummary || getAuditionRoleDescription(character.name);
  const [draft, setDraft] = useState({
    auditionRoleSummary: initialRoleSummary(),
    auditionAcceptsFemaleApplicants: roleProgress.auditionAcceptsFemaleApplicants !== false,
    auditionAcceptsMaleApplicants: roleProgress.auditionAcceptsMaleApplicants !== false,
    auditionLines: roleProgress.auditionLines || initialLines(),
    auditionDeadline: roleProgress.auditionDeadline || "",
    socialPostText: roleProgress.socialPostText || ""
  });
  const [message, setMessage] = useState("");
  const [preparingXPost, setPreparingXPost] = useState(false);
  const [openingXLogin, setOpeningXLogin] = useState(false);
  const [showLinePicker, setShowLinePicker] = useState(false);
  const [lineQuery, setLineQuery] = useState("");
  const deadlineParts = getAuditionDeadlineParts(draft.auditionDeadline);
  const socialImageUrl = String(roleProgress.socialImageUrl || "").trim();
  const socialImageFileId = getGoogleDriveFileId(socialImageUrl);
  const socialImagePreviewUrl = socialImageFileId ? makeImagePreviewUrl(socialImageUrl) : "";

  useEffect(() => {
    setDraft({
      auditionRoleSummary: initialRoleSummary(),
      auditionAcceptsFemaleApplicants: roleProgress.auditionAcceptsFemaleApplicants !== false,
      auditionAcceptsMaleApplicants: roleProgress.auditionAcceptsMaleApplicants !== false,
      auditionLines: roleProgress.auditionLines || initialLines(),
      auditionDeadline: roleProgress.auditionDeadline || "",
      socialPostText: roleProgress.socialPostText || ""
    });
  }, [character.id, project.id]);

  const makePost = () => buildAuditionSocialPost({
    workTitle: "Umbrella Parade",
    roleName: character.name,
    roleSummary: draft.auditionRoleSummary,
    acceptsFemaleApplicants: draft.auditionAcceptsFemaleApplicants,
    acceptsMaleApplicants: draft.auditionAcceptsMaleApplicants,
    auditionLines: draft.auditionLines,
    deadline: draft.auditionDeadline,
    formUrl: roleProgress.formResponderUrl,
    template: project.auditionSocialTemplate
  });

  const persistDraft = (nextDraft, message) => {
    setDraft(nextDraft);
    onSave({
      ...nextDraft,
      socialPostUpdatedAt: new Date().toISOString()
    });
    setMessage(message);
  };

  const patchDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    onSave(patch);
  };

  const selectedAuditionLines = String(draft.auditionLines || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const selectedAuditionLineSet = new Set(selectedAuditionLines);
  const normalizedLineQuery = lineQuery.trim().toLocaleLowerCase("ja");
  const visibleLineCandidates = lineCandidates.filter((candidate) => !normalizedLineQuery || [
    candidate.text,
    candidate.chapterTitle,
    candidate.sceneTitle,
    candidate.performanceType
  ].some((value) => String(value || "").toLocaleLowerCase("ja").includes(normalizedLineQuery)));

  const toggleAuditionLine = (lineText, checked) => {
    const nextLines = checked
      ? [...selectedAuditionLines, lineText]
      : selectedAuditionLines.filter((line) => line !== lineText);
    patchDraft({ auditionLines: [...new Set(nextLines)].join("\n") });
    setMessage(`${nextLines.length}件のオーディション用セリフを自動保存しました。`);
  };

  const generatePost = () => {
    const socialPostText = makePost();
    persistDraft(
      { ...draft, socialPostText },
      "募集文を作成して自動保存しました。"
    );
  };

  const setApplicantGender = (field, checked) => {
    const next = { ...draft, [field]: checked };
    if (!next.auditionAcceptsFemaleApplicants && !next.auditionAcceptsMaleApplicants) {
      setMessage("女性または男性のどちらか一方は選択してください。");
      return;
    }
    setDraft(next);
    onSave({
      auditionAcceptsFemaleApplicants: next.auditionAcceptsFemaleApplicants,
      auditionAcceptsMaleApplicants: next.auditionAcceptsMaleApplicants
    });
    setMessage("応募できる声優さんを自動保存しました。「募集文を作成」で文章へ反映できます。");
  };

  const saveDraft = () => {
    const socialPostText = draft.socialPostText || makePost();
    const nextDraft = { ...draft, socialPostText };
    persistDraft(nextDraft, "SNS募集文を保存しました。");
  };

  const copyPost = async () => {
    const socialPostText = draft.socialPostText || makePost();
    persistDraft({ ...draft, socialPostText }, "募集文を保存してコピーしました。");
    await navigator.clipboard.writeText(socialPostText);
  };

  const prepareXPostWithImage = async () => {
    if (!socialImageFileId || preparingXPost) {
      if (!socialImageFileId) setMessage("X投稿に使うGoogle DriveのSNS画像URLを確認してください。");
      return;
    }
    const socialPostText = draft.socialPostText || makePost();
    persistDraft({ ...draft, socialPostText }, "募集文を保存し、SNS画像を準備しています…");
    setPreparingXPost(true);
    try {
      await prepareAuditionXPostOnPc({
        postText: socialPostText,
        socialImageUrl,
        socialImageFileId,
        socialImageFileName: `${getAuditionDisplayRoleName(character.name)}_SNS_16x9.png`
      });
      setMessage("PC仕上げ用Chromeで、募集文とSNS画像を入れたX投稿画面を開きました。内容を確認してから投稿してください。");
    } catch (error) {
      setMessage(error.message || "SNS画像付きのX投稿画面を準備できませんでした。");
    } finally {
      setPreparingXPost(false);
    }
  };

  const openXLogin = async () => {
    if (openingXLogin) return;
    setOpeningXLogin(true);
    setMessage("PC仕上げ用ChromeでXを開いています…");
    try {
      const result = await openAuditionXLoginOnPc();
      setMessage(result.loginRequired
        ? "PC仕上げ用ChromeでXのログイン画面を開きました。ログイン後、この画面に戻って画像付き投稿をもう一度準備してください。"
        : "PC仕上げ用ChromeでXを開きました。ログイン済みです。");
    } catch (error) {
      setMessage(error.message || "Xのログイン画面を開けませんでした。");
    } finally {
      setOpeningXLogin(false);
    }
  };

  const xPostUrl = buildXPostIntentUrl(draft.socialPostText || makePost());

  return (
    <details className="audition-social-editor">
      <summary><Megaphone size={16} /><span>SNS募集文</span>{roleProgress.socialPostText && <small>保存済み</small>}</summary>
      <div className="audition-social-fields">
        <p><b>{getAuditionDisplayRoleName(character.name)}</b>用の募集文です。オルディス募集時の構成と、アニメ版での音源使用に関する説明を含みます。</p>
        <fieldset className="audition-gender-field">
          <legend>応募できる声優さん</legend>
          <div className="audition-gender-options">
            <label className="audition-gender-option">
              <input
                type="checkbox"
                checked={draft.auditionAcceptsFemaleApplicants}
                onChange={(event) => setApplicantGender("auditionAcceptsFemaleApplicants", event.target.checked)}
              />
              <span>女性</span>
            </label>
            <label className="audition-gender-option">
              <input
                type="checkbox"
                checked={draft.auditionAcceptsMaleApplicants}
                onChange={(event) => setApplicantGender("auditionAcceptsMaleApplicants", event.target.checked)}
              />
              <span>男性</span>
            </label>
          </div>
          <small>両方を選ぶと女性・男性どちらも応募できる案内を、片方だけの場合は対象外となる方への案内を募集文へ自動で入れます。</small>
        </fieldset>
        <label>
          <span>募集する役の説明・応募上の補足</span>
          <textarea
            value={draft.auditionRoleSummary}
            placeholder="例：警備員の役です。"
            onChange={(event) => patchDraft({ auditionRoleSummary: event.target.value })}
          />
        </label>
        <div className="audition-line-field">
          <div className="audition-line-field-heading">
            <span>オーディション用セリフ</span>
            <button type="button" className={showLinePicker ? "secondary active" : "secondary"} onClick={() => setShowLinePicker((current) => !current)}>
              <Search size={15} />{showLinePicker ? "候補を閉じる" : "セリフを確認"}
            </button>
          </div>
          <textarea
            value={draft.auditionLines}
            placeholder="1行に1つずつセリフを入力"
            onChange={(event) => patchDraft({ auditionLines: event.target.value })}
          />
          {showLinePicker && <div className="audition-line-picker">
            <div className="audition-line-picker-toolbar">
              <label><Search size={15} /><input type="search" value={lineQuery} placeholder="章・シーン・セリフを検索" onChange={(event) => setLineQuery(event.target.value)} /></label>
              <b>{selectedAuditionLineSet.size}件選択</b>
            </div>
            <div className="audition-line-candidate-list">
              {visibleLineCandidates.map((candidate) => {
                const checked = selectedAuditionLineSet.has(candidate.text);
                return <label className={`audition-line-candidate${checked ? " selected" : ""}`} key={`${candidate.id}:${candidate.text}`}>
                  <input type="checkbox" checked={checked} onChange={(event) => toggleAuditionLine(candidate.text, event.target.checked)} />
                  <span className="audition-line-candidate-context"><b>{candidate.chapterTitle}</b><small>{candidate.sceneTitle}{candidate.performanceType !== "通常" ? ` ・ ${candidate.performanceType}` : ""}</small></span>
                  <span className="audition-line-candidate-text">{candidate.text}</span>
                </label>;
              })}
              {!visibleLineCandidates.length && <div className="production-empty-state compact"><Search size={24} /><b>{lineCandidates.length ? "検索に一致するセリフはありません" : "この役のセリフは台本にありません"}</b></div>}
            </div>
          </div>}
        </div>
        <div className="audition-social-inline">
          <label className="audition-deadline-date">
            <span>応募締め切り日</span>
            <input
              type="date"
              value={deadlineParts.date}
              onChange={(event) => patchDraft({
                auditionDeadline: buildAuditionDeadlineValue(event.target.value, deadlineParts.time)
              })}
            />
          </label>
          <label className="audition-deadline-time">
            <span>時刻</span>
            <input
              type="time"
              value={deadlineParts.time}
              disabled={!deadlineParts.date}
              onChange={(event) => patchDraft({
                auditionDeadline: buildAuditionDeadlineValue(deadlineParts.date, event.target.value)
              })}
            />
          </label>
          <button type="button" className="secondary" onClick={() => patchDraft({ auditionLines: initialLines() })}>先頭2件を入れる</button>
          <button type="button" className="secondary" onClick={generatePost}><Sparkles size={15} />募集文を作成</button>
        </div>
        <label>
          <span>投稿する文章</span>
          <textarea
            className="audition-social-output"
            value={draft.socialPostText}
            placeholder="「募集文を作成」を押すと、ここに投稿文が入ります。"
            onChange={(event) => patchDraft({ socialPostText: event.target.value, socialPostUpdatedAt: new Date().toISOString() })}
          />
        </label>
        <div className="audition-social-image-field">
          <span>X投稿に使うSNS画像</span>
          <div className="audition-social-image-row">
            {socialImagePreviewUrl
              ? <a className="audition-social-image-preview" href={socialImageUrl} target="_blank" rel="noreferrer" title="現在紐づいているSNS画像を確認"><img src={socialImagePreviewUrl} alt={`${getAuditionDisplayRoleName(character.name)}のSNS画像`} /></a>
              : <div className="audition-social-image-preview empty"><FileImage size={24} /><small>未設定</small></div>}
            <div className="audition-social-image-controls">
              <input
                aria-label="X投稿に使うSNS画像のGoogle Drive URL"
                value={roleProgress.socialImageUrl || ""}
                placeholder="https://drive.google.com/file/d/.../view"
                onChange={(event) => onSave({ socialImageUrl: event.target.value })}
                onBlur={() => setMessage(socialImageFileId
                  ? "X投稿に使うSNS画像を保存しました。プレビューで正しい画像か確認できます。"
                  : "Google Driveで正しいSNS画像を開き、共有URLを貼り付けてください。")}
              />
              <div>
                {imageFolderUrl && <a href={imageFolderUrl} target="_blank" rel="noreferrer"><FolderOpen size={14} />画像フォルダー</a>}
                {socialImageFileId && <a href={socialImageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />現在の画像</a>}
              </div>
            </div>
          </div>
          <small>画像が違う場合は、画像フォルダーで正しい画像を開き、そのGoogle Drive共有URLへ置き換えてください。</small>
        </div>
        <div className="audition-social-actions">
          <button type="button" className="primary" onClick={saveDraft}><Save size={15} />保存</button>
          <button type="button" className="secondary" onClick={copyPost}><ClipboardCopy size={15} />コピー</button>
          {socialImageFileId && <button
            type="button"
            className="primary audition-x-image-button"
            disabled={preparingXPost}
            onClick={prepareXPostWithImage}
            title="PC仕上げ用Chromeで、投稿文とSNS画像を入れたX投稿画面を開く"
          >{preparingXPost ? <LoaderCircle className="spin" size={15} /> : <ImagePlus size={15} />}{preparingXPost ? "Xを準備中…" : "画像付きでXを開く"}</button>}
          {socialImageFileId && <a
            className="secondary"
            href={socialImageUrl}
            target="_blank"
            rel="noreferrer"
            title="生成済みのSNS画像を確認する"
          ><FileImage size={15} />SNS画像を確認</a>}
          <a
            className="secondary"
            href={xPostUrl}
            target="_blank"
            rel="noreferrer"
            title="投稿する文章だけを入れてXを開く"
          ><ExternalLink size={15} />文章だけでXを開く</a>
          <button
            type="button"
            className="secondary"
            disabled={openingXLogin}
            onClick={openXLogin}
            title="PC仕上げ用ChromeでXのログイン状態を確認する"
          >{openingXLogin ? <LoaderCircle className="spin" size={15} /> : <KeyRound size={15} />}{openingXLogin ? "Xを確認中…" : "Xのログインを確認"}</button>
          {message && <span role="status">{message}</span>}
        </div>
      </div>
    </details>
  );
}

function ContactTemplatesView({ project, updateProject, canEditScript = true }) {
  const contactTargets = useMemo(() => {
    const applicantTargets = (project.auditionApplicants || []).flatMap((applicant) => {
      if (!applicant.name) return [];
      const sourceCharacter = project.characters.find((character) => character.id === applicant.sourceCharacterId);
      const character = sourceCharacter || {
        id: applicant.sourceCharacterId || `applicant-source-${applicant.id}`,
        name: applicant.sourceRoleName || "応募役"
      };
      return [{
        key: `applicant:${applicant.id}`,
        type: "applicant",
        applicant,
        character,
        member: {
          id: applicant.id,
          actorName: applicant.name,
          contactName: applicant.contactName,
          contactHonorific: applicant.contactHonorific,
          socialUrl: normalizeXProfileUrl(applicant.socialUrl || applicant.socialInput)
        }
      }];
    });
    const castTargets = project.characters.flatMap((character) => {
      const member = project.castMembers.find((item) => item.characterIds.includes(character.id));
      return member ? [{ key: `cast:${character.id}`, type: "cast", character, member }] : [];
    });
    const manualTargets = (project.manualContactRecipients || []).map((recipient) => {
      const sourceCharacter = project.characters.find((character) => character.id === recipient.sourceCharacterId);
      return {
        key: `manual:${recipient.id}`,
        type: "manual",
        character: sourceCharacter || {
          id: recipient.sourceCharacterId || `manual-source-${recipient.id}`,
          name: recipient.sourceRoleName || "応募役未設定"
        },
        member: recipient
      };
    });
    return [...applicantTargets, ...manualTargets, ...castTargets];
  }, [project.auditionApplicants, project.characters, project.castMembers, project.manualContactRecipients]);
  const getInitialTemplateId = () => project.contactTemplates.find((template) => template.enabled && template.category === "合格連絡")?.id
    || project.contactTemplates.find((template) => template.enabled)?.id
    || project.contactTemplates[0]?.id
    || "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(getInitialTemplateId);
  const [selectedTargetKey, setSelectedTargetKey] = useState(() => contactTargets[0]?.key || "");
  const [selectedOfferedCharacterId, setSelectedOfferedCharacterId] = useState("");
  const [message, setMessage] = useState("");
  const dialogueCounts = useMemo(() => getCharacterDialogueCounts(project), [project.characters, project.lines]);
  const selectedTemplate = project.contactTemplates.find((template) => template.id === selectedTemplateId);
  const isOtherRoleTemplate = isOtherRoleRequestContactTemplate(selectedTemplate);
  const isRetakeTemplate = isRetakeRequestContactTemplate(selectedTemplate);
  const retakeCounts = useMemo(() => Object.fromEntries(project.characters.map((character) => [
    character.id,
    getProductionCharacterRetakes(project, character.id).length
  ])), [project.characters, project.lines, project.derivedLineProgress]);
  const availableContactTargets = isRetakeTemplate
    ? contactTargets.filter((target) => target.type === "cast" && (retakeCounts[target.character.id] || 0) > 0)
    : contactTargets;

  useEffect(() => {
    if (project.contactTemplates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(getInitialTemplateId());
  }, [project.contactTemplates, selectedTemplateId]);

  useEffect(() => {
    if (availableContactTargets.some((target) => target.key === selectedTargetKey)) return;
    setSelectedTargetKey(availableContactTargets[0]?.key || "");
  }, [availableContactTargets, selectedTargetKey]);

  const selectedTarget = availableContactTargets.find((target) => target.key === selectedTargetKey)
    || availableContactTargets[0];
  const selectedOriginalCharacterId = project.characters.some((character) => character.id === project.otherRoleContact?.sourceCharacterId)
    ? project.otherRoleContact.sourceCharacterId
    : project.characters[0]?.id || "";
  const selectedOriginalCharacter = project.characters.find((character) => character.id === selectedOriginalCharacterId);
  const otherRoleTarget = selectedOriginalCharacter ? {
    key: `other-role:${selectedOriginalCharacter.id}`,
    type: "other-role",
    character: selectedOriginalCharacter,
    member: {
      id: "other-role-contact",
      actorName: project.otherRoleContact?.contactName || "",
      contactName: project.otherRoleContact?.contactName || "",
      contactHonorific: project.otherRoleContact?.contactHonorific ?? "さん",
      socialUrl: project.otherRoleContact?.socialUrl || "",
      sourceCharacterId: selectedOriginalCharacter.id,
      sourceRoleName: selectedOriginalCharacter.name
    }
  } : undefined;
  const activeTarget = isOtherRoleTemplate ? otherRoleTarget : selectedTarget;
  const offeredCharacters = project.characters.filter((character) => character.id !== activeTarget?.character.id);
  const selectedOfferedCharacter = offeredCharacters.find((character) => character.id === selectedOfferedCharacterId)
    || offeredCharacters[0]
    || project.characters[0];

  useEffect(() => {
    if (!isOtherRoleTemplate || selectedOfferedCharacterId === selectedOfferedCharacter?.id) return;
    setSelectedOfferedCharacterId(selectedOfferedCharacter?.id || "");
  }, [isOtherRoleTemplate, selectedOfferedCharacter?.id, selectedOfferedCharacterId]);

  const actorContactName = activeTarget ? getActorContactName(activeTarget.member) : "声優";
  const actorHonorific = activeTarget ? getActorContactHonorific(activeTarget.member) : "さん";
  const roleName = activeTarget
    ? getAuditionDisplayRoleName(activeTarget.applicant?.sourceRoleName || activeTarget.member.sourceRoleName || activeTarget.character.name)
    : "役名";
  const offeredRoleName = selectedOfferedCharacter ? getAuditionDisplayRoleName(selectedOfferedCharacter.name) : "別の役";
  const offeredRoleDialogueCount = selectedOfferedCharacter
    ? dialogueCounts[selectedOfferedCharacter.id] || 0
    : 0;
  const appearanceLabel = selectedOfferedCharacter
    ? getProductionCharacterAppearanceLabel(project, selectedOfferedCharacter.id)
    : "登場章未設定";
  const characterRetakes = isRetakeTemplate && activeTarget
    ? getProductionCharacterRetakes(project, activeTarget.character.id)
    : [];
  const retakeList = isRetakeTemplate && activeTarget
    ? buildProductionRetakeList(project, activeTarget.character.id)
    : "";
  const draftOfferedCharacterId = isOtherRoleTemplate ? selectedOfferedCharacter?.id || "" : "";
  const targetDrafts = project.contactMessageDrafts.filter((draft) => {
    if (draft.templateId !== selectedTemplateId) return false;
    return draft.targetKey
      ? draft.targetKey === activeTarget?.key
      : activeTarget?.type === "cast" && draft.characterId === activeTarget.character.id;
  });
  const legacyOtherRoleDrafts = isOtherRoleTemplate && activeTarget
    ? project.contactMessageDrafts.filter((draft) => draft.templateId === selectedTemplateId
      && draft.characterId === activeTarget.character.id
      && draft.targetKey !== activeTarget.key)
    : [];
  const savedDraft = targetDrafts.find((draft) => String(draft.offeredCharacterId || "") === draftOfferedCharacterId)
    || legacyOtherRoleDrafts.find((draft) => String(draft.offeredCharacterId || "") === draftOfferedCharacterId)
    || (isOtherRoleTemplate ? targetDrafts.find((draft) => !draft.offeredCharacterId && /(?:◆◆|第■章|\{\{別役名\}\}|\{\{登場章\}\}|\{\{登場案内\}\})/u.test(String(draft.body || ""))) : undefined);
  const contactMessageVariables = {
    actorName: actorContactName,
    actorHonorific,
    roleName,
    offeredRoleName,
    offeredRoleDialogueCount,
    appearanceLabel,
    projectTitle: project.title,
    retakeList
  };
  const generatedBody = selectedTemplate ? buildProductionContactMessage(selectedTemplate, contactMessageVariables) : "";
  const renderedActualBody = selectedTemplate
    ? buildProductionContactMessage({ ...selectedTemplate, body: savedDraft?.body ?? selectedTemplate.body }, contactMessageVariables)
    : "";
  const actualBody = isRetakeTemplate
    ? mergeMissingProductionRetakesIntoDraft(renderedActualBody, characterRetakes)
    : renderedActualBody;
  const actualBodyScopeKey = `${selectedTemplate?.id || ""}:${activeTarget?.key || ""}:${draftOfferedCharacterId}`;
  const actualBodyDraftRef = useRef(actualBody);
  const actualBodyScopeRef = useRef(actualBodyScopeKey);
  if (actualBodyScopeRef.current !== actualBodyScopeKey) {
    actualBodyScopeRef.current = actualBodyScopeKey;
    actualBodyDraftRef.current = actualBody;
  }
  const syncedRetakeDraft = actualBody !== renderedActualBody;
  const canOpenTemplateSheet = isWebUrl(project.contactTemplateSheetUrl);
  const actorXUrl = normalizeXProfileUrl(activeTarget?.member.socialUrl);
  const canOpenActorX = isWebUrl(actorXUrl);

  const patchTemplate = (templateId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      contactTemplates: current.contactTemplates.map((template) => template.id === templateId
        ? { ...template, ...patch, updatedAt: new Date().toISOString() }
        : template)
    }));
  };

  const addManualRecipient = () => {
    if (!canEditScript) return;
    const recipientId = newId("contact_recipient");
    const sourceCharacter = project.characters[0];
    updateProject((current) => ({
      ...current,
      manualContactRecipients: [...(current.manualContactRecipients || []), {
        id: recipientId,
        actorName: "",
        contactName: "",
        contactHonorific: "さん",
        socialUrl: "",
        sourceCharacterId: sourceCharacter?.id || "",
        sourceRoleName: sourceCharacter?.name || ""
      }]
    }));
    setSelectedTargetKey(`manual:${recipientId}`);
    setMessage("手入力の連絡先を追加しました。送る相手の名前を入力してください。");
  };

  const selectOtherRoleSourceCharacter = (characterId) => {
    if (!canEditScript) return;
    const character = project.characters.find((item) => item.id === characterId);
    if (!character) return;
    updateProject((current) => ({
      ...current,
      otherRoleContact: {
        ...(current.otherRoleContact || {}),
        sourceCharacterId: character.id,
        sourceRoleName: character.name
      }
    }));
  };

  const patchSelectedTargetContact = (patch) => {
    if (!canEditScript || !activeTarget) return;
    const previousName = getActorContactName(activeTarget.member);
    const previousHonorific = getActorContactHonorific(activeTarget.member);
    const nextMember = { ...activeTarget.member, ...patch };
    const nextName = getActorContactName(nextMember);
    const nextHonorific = getActorContactHonorific(nextMember);
    const previousAddress = `${previousName}${previousHonorific}`;
    const nextAddress = `${nextName}${nextHonorific}`;
    const nextRoleName = Object.prototype.hasOwnProperty.call(patch, "sourceRoleName")
      ? getAuditionDisplayRoleName(patch.sourceRoleName || "役名")
      : roleName;
    const updateDraftBody = (draft) => {
      const matchesTarget = draft.targetKey
        ? draft.targetKey === activeTarget.key
          || (isOtherRoleTemplate && draft.characterId === activeTarget.character.id && draft.templateId === selectedTemplateId)
        : activeTarget.type === "cast" && draft.characterId === activeTarget.character.id;
      const addressChanged = previousAddress !== nextAddress;
      const roleChanged = roleName !== nextRoleName;
      if (!matchesTarget || (!addressChanged && !roleChanged)) return draft;
      let body = String(draft.body || "");
      if (addressChanged) {
        if (previousAddress) body = body.replaceAll(previousAddress, nextAddress);
        if (previousName && previousName !== nextName) body = body.replaceAll(previousName, nextName);
      }
      if (roleChanged && roleName) {
        body = body.replaceAll(`${roleName}役`, `${nextRoleName}役`).replaceAll(roleName, nextRoleName);
      }
      return { ...draft, body, updatedAt: new Date().toISOString() };
    };

    updateProject((current) => {
      const nextProject = { ...current };
      if (isOtherRoleTemplate) {
        nextProject.otherRoleContact = {
          ...(current.otherRoleContact || {}),
          ...patch,
          sourceCharacterId: activeTarget.character.id,
          sourceRoleName: activeTarget.character.name
        };
      } else if (selectedTarget.type === "applicant") {
        nextProject.auditionApplicants = (current.auditionApplicants || []).map((applicant) => applicant.id === selectedTarget.member.id
          ? { ...applicant, ...patch, updatedAt: new Date().toISOString() }
          : applicant);
      } else if (selectedTarget.type === "manual") {
        nextProject.manualContactRecipients = (current.manualContactRecipients || []).map((recipient) => recipient.id === selectedTarget.member.id
          ? { ...recipient, ...patch }
          : recipient);
      } else {
        nextProject.castMembers = current.castMembers.map((member) => member.id === selectedTarget.member.id
          ? { ...member, ...patch }
          : member);
      }
      nextProject.contactMessageDrafts = (current.contactMessageDrafts || []).map(updateDraftBody);
      return nextProject;
    });
  };

  const removeManualRecipient = () => {
    if (!canEditScript || selectedTarget?.type !== "manual") return;
    const recipientName = selectedTarget.member.actorName || "名前未入力の相手";
    if (!confirm(`${recipientName}を手入力の連絡先から削除しますか？この相手用に保存した連絡文も削除されます。`)) return;
    const targetKey = selectedTarget.key;
    const nextTargetKey = contactTargets.find((target) => target.key !== targetKey)?.key || "";
    updateProject((current) => ({
      ...current,
      manualContactRecipients: (current.manualContactRecipients || []).filter((recipient) => recipient.id !== selectedTarget.member.id),
      contactMessageDrafts: (current.contactMessageDrafts || []).filter((draft) => draft.targetKey !== targetKey)
    }));
    setSelectedTargetKey(nextTargetKey);
    setMessage(`${recipientName}を手入力の連絡先から削除しました。`);
  };

  const moveTemplate = (templateId, offset) => {
    if (!canEditScript) return;
    const sourceIndex = project.contactTemplates.findIndex((template) => template.id === templateId);
    const targetTemplate = project.contactTemplates[sourceIndex + offset];
    if (sourceIndex < 0 || !targetTemplate) return;
    const template = project.contactTemplates[sourceIndex];
    updateProject((current) => ({
      ...current,
      contactTemplates: reorderProductionTemplates(current.contactTemplates, templateId, targetTemplate.id)
    }));
    setMessage(`「${template.name}」の並び順を保存しました。`);
  };

  const addTemplate = () => {
    if (!canEditScript) return;
    const templateId = newId("contact_template");
    updateProject((current) => ({
      ...current,
      contactTemplates: [...current.contactTemplates, {
        id: templateId,
        category: "その他",
        name: `連絡テンプレート${current.contactTemplates.length + 1}`,
        body: "〇〇さん\n\n△△役についてご連絡します。",
        notes: "",
        enabled: true,
        updatedAt: new Date().toISOString()
      }]
    }));
    setSelectedTemplateId(templateId);
    setMessage("連絡テンプレートを追加しました。");
  };

  const removeTemplate = (template) => {
    if (!canEditScript || !confirm(`「${template.name}」を削除しますか？相手・役別に保存した送信用文章も削除されます。`)) return;
    updateProject((current) => ({
      ...current,
      contactTemplates: current.contactTemplates.filter((item) => item.id !== template.id),
      contactMessageDrafts: current.contactMessageDrafts.filter((draft) => draft.templateId !== template.id)
    }));
    setMessage(`「${template.name}」を削除しました。`);
  };

  const saveActualBody = (body) => {
    if (!canEditScript || !selectedTemplate || !activeTarget) return;
    const storedBody = isRetakeTemplate && retakeList && body.includes(retakeList)
      ? body.replace(retakeList, "{{リテイク一覧}}")
      : body;
    updateProject((current) => {
      const existing = current.contactMessageDrafts.find((draft) => {
        if (draft.templateId !== selectedTemplate.id) return false;
        const matchesTarget = draft.targetKey
          ? draft.targetKey === activeTarget.key
          : activeTarget.type === "cast" && draft.characterId === activeTarget.character.id;
        return matchesTarget && String(draft.offeredCharacterId || "") === draftOfferedCharacterId;
      });
      const nextDraft = {
        id: existing?.id || newId("contact_message"),
        templateId: selectedTemplate.id,
        characterId: activeTarget.character.id,
        applicantId: activeTarget.applicant?.id || "",
        targetKey: activeTarget.key,
        offeredCharacterId: draftOfferedCharacterId,
        body: storedBody,
        updatedAt: new Date().toISOString()
      };
      return {
        ...current,
        contactMessageDrafts: existing
          ? current.contactMessageDrafts.map((draft) => draft.id === existing.id ? nextDraft : draft)
          : [...current.contactMessageDrafts, nextDraft]
      };
    });
  };

  const rebuildActualBody = () => {
    if (!selectedTemplate || !activeTarget) return;
    if (savedDraft && savedDraft.body !== generatedBody && !confirm("書き換えた送信用文章を、基本テンプレートから作り直しますか？")) return;
    actualBodyDraftRef.current = generatedBody;
    saveActualBody(generatedBody);
    setMessage(isRetakeTemplate
      ? `台本にある${characterRetakes.length}件のリテイク指定を反映して、送信用文章を作り直しました。`
      : "現在の呼び名・応募役・お願いする役で送信用文章を作り直しました。");
  };

  const copyActualBody = async () => {
    const body = actualBodyDraftRef.current;
    if (!body.trim()) return false;
    try {
      await navigator.clipboard.writeText(body);
      setMessage("送信用文章をコピーしました。");
      return true;
    } catch {
      setMessage("文章をコピーできませんでした。ブラウザのクリップボード許可をご確認ください。");
      return false;
    }
  };

  const copyAndOpenActorX = async () => {
    if (!canOpenActorX) return;
    globalThis.open(actorXUrl, "_blank", "noopener,noreferrer");
    const copied = await copyActualBody();
    if (copied) setMessage(`${actorContactName}${actorHonorific}のXを開き、送信用文章をコピーしました。`);
  };

  return (
    <section className="contact-template-workspace">
      <header className="contact-template-toolbar">
        <div><MessageSquareText size={20} /><div><h3>連絡テンプレート</h3><p>フォーム応募者または担当声優を選び、相手と役に合わせた文章を作成します。</p></div></div>
        <div>
          {canEditScript && <button type="button" className="secondary" onClick={addTemplate}><Plus size={16} />テンプレート</button>}
          <a className={`secondary${canOpenTemplateSheet ? "" : " disabled"}`} href={canOpenTemplateSheet ? project.contactTemplateSheetUrl : undefined} target="_blank" rel="noreferrer" aria-disabled={!canOpenTemplateSheet}><FileSpreadsheet size={16} />元のスプレッドシート</a>
        </div>
      </header>

      {message && <p className="production-inline-message" role="status">{message}</p>}

      {canEditScript && <div className="contact-template-sheet-field">
        <label><span>連絡テンプレートのスプレッドシートURL</span><input type="url" value={project.contactTemplateSheetUrl || ""} placeholder="https://docs.google.com/spreadsheets/d/..." onChange={(event) => updateProject((current) => ({ ...current, contactTemplateSheetUrl: event.target.value }))} /></label>
      </div>}

      <div className="contact-template-layout">
        <aside className="contact-template-list" aria-label="連絡テンプレート一覧">
          <header><b>テンプレート</b><span>{project.contactTemplates.length}件</span></header>
          <nav>
            {project.contactTemplates.map((template, templateIndex) => (
              <div className="contact-template-nav-item" key={template.id}>
                <button type="button" className={`contact-template-select-button${selectedTemplateId === template.id ? " active" : ""}${template.enabled ? "" : " disabled-template"}`} onClick={() => setSelectedTemplateId(template.id)}>
                  <span>{template.category}</span>
                  <b>{template.name}</b>
                  {!template.enabled && <small>使用停止中</small>}
                </button>
                {canEditScript && <div className="contact-template-order-actions" aria-label={`${template.name}の並び替え`}>
                  <button type="button" className="icon-button" title="一つ上へ" aria-label={`${template.name}を一つ上へ`} disabled={templateIndex === 0} onClick={() => moveTemplate(template.id, -1)}><ArrowUp size={14} /></button>
                  <button type="button" className="icon-button" title="一つ下へ" aria-label={`${template.name}を一つ下へ`} disabled={templateIndex === project.contactTemplates.length - 1} onClick={() => moveTemplate(template.id, 1)}><ArrowDown size={14} /></button>
                </div>}
              </div>
            ))}
          </nav>
        </aside>

        <div className="contact-template-main">
          {selectedTemplate ? <>
            <details className="contact-template-base-editor">
              <summary><div><Save size={17} /><span><b>基本テンプレート</b><small>{selectedTemplate.category} / {selectedTemplate.name}</small></span></div><ChevronDown size={17} /></summary>
              <div>
                <div className="contact-template-meta-fields">
                  <label><span>カテゴリ</span><input list="contact-template-categories" value={selectedTemplate.category} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { category: event.target.value })} /></label>
                  <label><span>テンプレート名</span><input value={selectedTemplate.name} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { name: event.target.value })} /></label>
                  <label className="wide"><span>使用場面・メモ</span><input value={selectedTemplate.notes} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { notes: event.target.value })} /></label>
                  <label className="contact-template-enabled"><input type="checkbox" checked={selectedTemplate.enabled} disabled={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { enabled: event.target.checked })} /><span>このテンプレートを使用する</span></label>
                </div>
                <label className="contact-template-body-field"><span>基本の本文</span><BufferedTextarea key={`contact-template-body:${selectedTemplate.id}`} value={selectedTemplate.body} readOnly={!canEditScript} onCommit={(body) => patchTemplate(selectedTemplate.id, { body })} /></label>
                {canEditScript && <div className="contact-template-base-actions"><button type="button" className="danger" onClick={() => removeTemplate(selectedTemplate)}><Trash2 size={16} />テンプレートを削除</button></div>}
              </div>
            </details>
            <datalist id="contact-template-categories">{PRODUCTION_CONTACT_TEMPLATE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist>

            <section className="contact-message-composer">
              <header>
                <div><Users size={18} /><div><h3>実際に送る文章</h3><p>{isRetakeTemplate ? "キャラクターを選ぶと、台本に登録したリテイク箇所がメール文へ自動で入ります。" : "応募者・テンプレート・お願いする役ごとに別保存されます。"}</p></div></div>
                <div className="contact-message-header-actions">
                  {savedDraft && <span>{syncedRetakeDraft ? "書き換え保存済み・最新リテイクを自動反映" : "書き換え保存済み"}</span>}
                  {canEditScript && !isOtherRoleTemplate && !isRetakeTemplate && <button type="button" className="secondary" onClick={addManualRecipient}><UserPlus size={15} />相手を手入力で追加</button>}
                </div>
              </header>
              {(isOtherRoleTemplate ? Boolean(activeTarget) : availableContactTargets.length > 0) ? <>
                <div className={`contact-message-target-grid${isOtherRoleTemplate ? " with-offered-role" : ""}`}>
                  {isOtherRoleTemplate
                    ? <label><span>応募した役名（△△）</span><select value={selectedOriginalCharacterId} onChange={(event) => selectOtherRoleSourceCharacter(event.target.value)}>{project.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
                    : <label><span>{isRetakeTemplate ? "リテイク対象のキャラクター" : "送る相手・応募した役"}</span><select value={selectedTarget?.key || ""} onChange={(event) => setSelectedTargetKey(event.target.value)}>{availableContactTargets.map((target) => <option key={target.key} value={target.key}>{isRetakeTemplate ? `【${retakeCounts[target.character.id] || 0}件】` : target.type === "applicant" ? "【応募者】" : target.type === "manual" ? "【手入力】" : "【配役済み】"}{target.character.name} / {target.member.actorName || "名前未入力"}</option>)}</select></label>}
                  {isOtherRoleTemplate && <label><span>お願いする別の役</span><select value={selectedOfferedCharacter?.id || ""} onChange={(event) => setSelectedOfferedCharacterId(event.target.value)}>{offeredCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>}
                  {!isOtherRoleTemplate && selectedTarget?.type === "manual" && <label><span>送る相手の名前</span><input value={selectedTarget.member.actorName || ""} placeholder="例：青葉かなで" onChange={(event) => patchSelectedTargetContact({ actorName: event.target.value })} /></label>}
                  <label><span>文中の呼び名（〇〇）</span><input value={activeTarget?.member.contactName || ""} placeholder={isOtherRoleTemplate ? "例：ざっきー" : actorContactName} onChange={(event) => patchSelectedTargetContact({ contactName: event.target.value })} /></label>
                  <label><span>呼称</span><input value={actorHonorific} placeholder="さん" onChange={(event) => patchSelectedTargetContact({ contactHonorific: event.target.value })} /></label>
                  <div><span>△△</span><b>{roleName}</b><small>{isRetakeTemplate ? "リテイク対象の役" : "応募した役"}</small></div>
                  {isOtherRoleTemplate && <div><span>◆◆</span><b>{offeredRoleName}</b><small>お願いする役</small></div>}
                  {isOtherRoleTemplate && <div><span>登場章</span><b>{appearanceLabel}</b><small>台本から自動判定</small></div>}
                  {isOtherRoleTemplate && <div><span>セリフ数</span><b>{offeredRoleDialogueCount}セリフ</b><small>{offeredRoleDialogueCount <= 4 ? "少数の案内を表示" : "少数の案内なし"}</small></div>}
                  <label className="contact-recipient-x-field"><span>XのURLまたは@ID</span><input value={activeTarget?.member.socialUrl || ""} placeholder="https://x.com/... または @ID" onChange={(event) => patchSelectedTargetContact({ socialUrl: event.target.value })} /></label>
                </div>
                {isRetakeTemplate && <div className="contact-retake-auto-summary" role="status">
                  <AlertCircle size={18} />
                  <div>
                    <b>{roleName}のリテイク指定 {characterRetakes.length}件を自動反映</b>
                    <span>{[...new Set(characterRetakes.map((retake) => `${retake.chapterTitle} / ${retake.sceneTitle}`))].join("、")}。セリフ番号・修正箇所・アクセント・確認メモを送信用文章へまとめます。</span>
                  </div>
                </div>}
                {!isOtherRoleTemplate && selectedTarget?.type === "manual" && canEditScript && <div className="contact-manual-recipient-actions"><small>手入力した相手はこの作品に保存され、次回も選べます。</small><button type="button" className="danger" onClick={removeManualRecipient}><Trash2 size={15} />この相手を削除</button></div>}
                <label className="contact-actual-message-field"><span>送信用文章</span><BufferedTextarea key={`contact-message:${actualBodyScopeKey}`} value={actualBody} readOnly={!canEditScript} onDraftChange={(body) => { actualBodyDraftRef.current = body; }} onCommit={saveActualBody} /></label>
                <div className="contact-message-actions">
                  {canEditScript && <button type="button" className="secondary" onClick={rebuildActualBody}><RotateCcw size={16} />基本テンプレートから作り直す</button>}
                  <button type="button" className="secondary" disabled={!actualBody.trim()} onClick={copyActualBody}><ClipboardCopy size={16} />{isRetakeTemplate ? "メール文をコピー" : "文章をコピー"}</button>
                  <button type="button" className="primary" disabled={!actualBody.trim() || !canOpenActorX} onClick={copyAndOpenActorX}><ExternalLink size={16} />文章をコピーしてXを開く</button>
                </div>
              </> : <div className="production-empty-state compact"><Users size={28} /><b>{isOtherRoleTemplate ? "応募した役がまだ登録されていません" : isRetakeTemplate ? "リテイク指定のある配役済みキャラクターはいません" : "送る相手がまだ登録されていません"}</b><span>{isOtherRoleTemplate ? "キャラクター欄へ応募役を登録してください。" : isRetakeTemplate ? "台本の進行ボードでリテイクを指定し、キャラクター欄で担当声優を登録すると選べるようになります。" : "上の「相手を手入力で追加」を押すか、募集役タブでGoogleフォーム回答を取り込んでください。"}</span></div>}
            </section>
          </> : <div className="production-empty-state"><MessageSquareText size={30} /><b>連絡テンプレートはまだありません</b>{canEditScript && <button type="button" className="secondary" onClick={addTemplate}>追加する</button>}</div>}
        </div>
      </div>
    </section>
  );
}

function SocialTemplatesView({ project, updateProject, canEditScript = true }) {
  const getInitialTemplateId = () => project.socialTemplates.find((template) => template.enabled)?.id
    || project.socialTemplates[0]?.id
    || "";
  const [selectedTemplateId, setSelectedTemplateId] = useState(getInitialTemplateId);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (project.socialTemplates.some((template) => template.id === selectedTemplateId)) return;
    setSelectedTemplateId(getInitialTemplateId());
  }, [project.socialTemplates, selectedTemplateId]);

  const selectedTemplate = project.socialTemplates.find((template) => template.id === selectedTemplateId);
  const savedDraft = project.socialMessageDrafts.find((draft) => draft.templateId === selectedTemplateId);
  const isEarlyResultTemplate = Boolean(selectedTemplate && (
    /(?:先行|選考)結果/u.test(selectedTemplate.name || "")
    || /「〇〇」役\s*をお願いさせていただく方へ、/u.test(String(selectedTemplate.body || ""))
    || String(selectedTemplate.body || "").includes("{{役名一覧}}")
  ));
  const projectCharacterIds = new Set(project.characters.map((character) => character.id));
  const selectedRoleIds = isEarlyResultTemplate
    ? [...new Set((savedDraft?.characterIds || []).filter((characterId) => projectCharacterIds.has(characterId)))]
    : [];
  const selectedRoleNames = project.characters
    .filter((character) => selectedRoleIds.includes(character.id))
    .map((character) => getAuditionDisplayRoleName(character.name));
  const generatedBody = selectedTemplate ? buildProductionSocialMessage(selectedTemplate, {
    projectTitle: project.title,
    roleNames: selectedRoleNames
  }) : "";
  const actualBody = savedDraft?.body && selectedRoleIds.length
    ? applyProductionSocialRoleSelection(savedDraft.body, selectedRoleNames)
    : savedDraft?.body ?? generatedBody;
  const actualBodyScopeKey = selectedTemplate?.id || "";
  const actualBodyDraftRef = useRef(actualBody);
  const actualBodyScopeRef = useRef(actualBodyScopeKey);
  if (actualBodyScopeRef.current !== actualBodyScopeKey) {
    actualBodyScopeRef.current = actualBodyScopeKey;
    actualBodyDraftRef.current = actualBody;
  }

  const patchTemplate = (templateId, patch) => {
    if (!canEditScript) return;
    updateProject((current) => ({
      ...current,
      socialTemplates: current.socialTemplates.map((template) => template.id === templateId
        ? { ...template, ...patch, updatedAt: new Date().toISOString() }
        : template)
    }));
  };

  const moveTemplate = (templateId, offset) => {
    if (!canEditScript) return;
    const sourceIndex = project.socialTemplates.findIndex((template) => template.id === templateId);
    const targetTemplate = project.socialTemplates[sourceIndex + offset];
    if (sourceIndex < 0 || !targetTemplate) return;
    const template = project.socialTemplates[sourceIndex];
    updateProject((current) => ({
      ...current,
      socialTemplates: reorderProductionTemplates(current.socialTemplates, templateId, targetTemplate.id)
    }));
    setMessage(`「${template.name}」の並び順を保存しました。`);
  };

  const addTemplate = () => {
    if (!canEditScript) return;
    const templateId = newId("social_template");
    updateProject((current) => ({
      ...current,
      socialTemplates: [...current.socialTemplates, {
        id: templateId,
        category: "お知らせ",
        name: `SNSテンプレート${current.socialTemplates.length + 1}`,
        body: "【お知らせ】\n『{{作品名}}』についてお知らせします＾＾",
        notes: "",
        enabled: true,
        updatedAt: new Date().toISOString()
      }]
    }));
    setSelectedTemplateId(templateId);
    setMessage("SNSテンプレートを追加しました。");
  };

  const removeTemplate = (template) => {
    if (!canEditScript || !confirm(`「${template.name}」を削除しますか？作成途中の投稿文も削除されます。`)) return;
    updateProject((current) => ({
      ...current,
      socialTemplates: current.socialTemplates.filter((item) => item.id !== template.id),
      socialMessageDrafts: current.socialMessageDrafts.filter((draft) => draft.templateId !== template.id)
    }));
    setMessage(`「${template.name}」を削除しました。`);
  };

  const saveActualBody = (body, characterIds = selectedRoleIds) => {
    if (!canEditScript || !selectedTemplate) return;
    updateProject((current) => {
      const existing = current.socialMessageDrafts.find((draft) => draft.templateId === selectedTemplate.id);
      const nextDraft = {
        id: existing?.id || newId("social_message"),
        templateId: selectedTemplate.id,
        characterIds: isEarlyResultTemplate ? characterIds : [],
        body,
        updatedAt: new Date().toISOString()
      };
      return {
        ...current,
        socialMessageDrafts: existing
          ? current.socialMessageDrafts.map((draft) => draft.id === existing.id ? nextDraft : draft)
          : [...current.socialMessageDrafts, nextDraft]
      };
    });
  };

  const toggleResultRole = (characterId) => {
    if (!canEditScript || !isEarlyResultTemplate) return;
    const nextIds = selectedRoleIds.includes(characterId)
      ? selectedRoleIds.filter((selectedId) => selectedId !== characterId)
      : [...selectedRoleIds, characterId];
    const nextIdSet = new Set(nextIds);
    const orderedNextIds = project.characters
      .filter((character) => nextIdSet.has(character.id))
      .map((character) => character.id);
    const nextRoleNames = project.characters
      .filter((character) => nextIdSet.has(character.id))
      .map((character) => getAuditionDisplayRoleName(character.name));
    saveActualBody(
      applyProductionSocialRoleSelection(actualBodyDraftRef.current, nextRoleNames, selectedRoleNames),
      orderedNextIds
    );
    setMessage(nextRoleNames.length
      ? `${nextRoleNames.length}役を先行結果のお知らせへ反映しました。`
      : "役の選択を解除しました。");
  };

  const rebuildActualBody = () => {
    if (!selectedTemplate) return;
    if (savedDraft && savedDraft.body !== generatedBody && !confirm("書き換えた投稿文を、基本テンプレートから作り直しますか？")) return;
    actualBodyDraftRef.current = generatedBody;
    saveActualBody(generatedBody);
    setMessage("現在の作品名でSNS投稿文を作り直しました。");
  };

  const copyActualBody = async () => {
    const body = actualBodyDraftRef.current;
    if (!body.trim()) return;
    try {
      await navigator.clipboard.writeText(body);
      setMessage("SNS投稿文をコピーしました。");
    } catch {
      setMessage("投稿文をコピーできませんでした。ブラウザのクリップボード許可をご確認ください。");
    }
  };

  const openXPost = () => {
    const body = actualBodyDraftRef.current;
    if (!body.trim()) return;
    globalThis.open(buildXPostIntentUrl(body), "_blank", "noopener,noreferrer");
  };

  return (
    <section className="contact-template-workspace social-template-workspace">
      <header className="contact-template-toolbar">
        <div><Globe2 size={20} /><div><h3>SNSテンプレート</h3><p>個別連絡とは分けて、募集・結果発表・制作進捗・公開案内など全体向けの投稿文を管理します。</p></div></div>
        <div>{canEditScript && <button type="button" className="secondary" onClick={addTemplate}><Plus size={16} />テンプレート</button>}</div>
      </header>
      {message && <p className="production-inline-message" role="status">{message}</p>}
      <div className="contact-template-layout">
        <aside className="contact-template-list" aria-label="SNSテンプレート一覧">
          <header><b>SNSテンプレート</b><span>{project.socialTemplates.length}件</span></header>
          <nav>{project.socialTemplates.map((template, templateIndex) => (
            <div className="contact-template-nav-item" key={template.id}>
              <button type="button" className={`contact-template-select-button${selectedTemplateId === template.id ? " active" : ""}${template.enabled ? "" : " disabled-template"}`} onClick={() => setSelectedTemplateId(template.id)}>
                <span>{template.category}</span><b>{template.name}</b>{!template.enabled && <small>使用停止中</small>}
              </button>
              {canEditScript && <div className="contact-template-order-actions" aria-label={`${template.name}の並び替え`}>
                <button type="button" className="icon-button" title="一つ上へ" aria-label={`${template.name}を一つ上へ`} disabled={templateIndex === 0} onClick={() => moveTemplate(template.id, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="icon-button" title="一つ下へ" aria-label={`${template.name}を一つ下へ`} disabled={templateIndex === project.socialTemplates.length - 1} onClick={() => moveTemplate(template.id, 1)}><ArrowDown size={14} /></button>
              </div>}
            </div>
          ))}</nav>
        </aside>
        <div className="contact-template-main">
          {selectedTemplate ? <>
            <details className="contact-template-base-editor">
              <summary><div><Save size={17} /><span><b>基本テンプレート</b><small>{selectedTemplate.category} / {selectedTemplate.name}</small></span></div><ChevronDown size={17} /></summary>
              <div>
                <div className="contact-template-meta-fields">
                  <label><span>カテゴリ</span><input list="social-template-categories" value={selectedTemplate.category} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { category: event.target.value })} /></label>
                  <label><span>テンプレート名</span><input value={selectedTemplate.name} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { name: event.target.value })} /></label>
                  <label className="wide"><span>使用場面・メモ</span><input value={selectedTemplate.notes} readOnly={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { notes: event.target.value })} /></label>
                  <label className="contact-template-enabled"><input type="checkbox" checked={selectedTemplate.enabled} disabled={!canEditScript} onChange={(event) => patchTemplate(selectedTemplate.id, { enabled: event.target.checked })} /><span>このテンプレートを使用する</span></label>
                </div>
                <label className="contact-template-body-field"><span>基本の本文</span><BufferedTextarea key={`social-template-body:${selectedTemplate.id}`} value={selectedTemplate.body} readOnly={!canEditScript} onCommit={(body) => patchTemplate(selectedTemplate.id, { body })} /></label>
                {canEditScript && <div className="contact-template-base-actions"><button type="button" className="danger" onClick={() => removeTemplate(selectedTemplate)}><Trash2 size={16} />テンプレートを削除</button></div>}
              </div>
            </details>
            <datalist id="social-template-categories">{PRODUCTION_SOCIAL_TEMPLATE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist>
            <section className="contact-message-composer">
              <header><div><Megaphone size={18} /><div><h3>実際に投稿する文章</h3><p>基本文とは別に保存されるため、今回の投稿だけ自由に書き換えられます。</p></div></div>{savedDraft && <span>書き換え保存済み</span>}</header>
              <div className="social-message-project"><span>作品名</span><b>{project.title}</b><small>{"{{作品名}}"}へ自動反映</small></div>
              {isEarlyResultTemplate && <fieldset className="social-result-role-picker">
                <legend>先行結果をお知らせする役（複数選択可）</legend>
                <div className="social-result-role-grid">
                  {project.characters.map((character) => {
                    const roleName = getAuditionDisplayRoleName(character.name);
                    const checked = selectedRoleIds.includes(character.id);
                    return <label className={checked ? "selected" : ""} key={character.id}>
                      <input type="checkbox" checked={checked} disabled={!canEditScript} onChange={() => toggleResultRole(character.id)} />
                      <span>{roleName}</span>
                    </label>;
                  })}
                </div>
                <small>{selectedRoleIds.length ? `${selectedRoleIds.length}役を文章へ反映中` : "役を選ぶと「〇〇」が自動で置き換わります"}</small>
              </fieldset>}
              <label className="contact-actual-message-field"><span>SNS投稿文</span><BufferedTextarea key={`social-message:${actualBodyScopeKey}`} value={actualBody} readOnly={!canEditScript} onDraftChange={(body) => { actualBodyDraftRef.current = body; }} onCommit={saveActualBody} /></label>
              <div className="contact-message-actions">
                {canEditScript && <button type="button" className="secondary" onClick={rebuildActualBody}><RotateCcw size={16} />基本テンプレートから作り直す</button>}
                <button type="button" className="secondary" disabled={!actualBody.trim()} onClick={copyActualBody}><ClipboardCopy size={16} />文章をコピー</button>
                <button type="button" className="primary" disabled={!actualBody.trim()} onClick={openXPost}><ExternalLink size={16} />文章を入れてXを開く</button>
              </div>
            </section>
          </> : <div className="production-empty-state"><Globe2 size={30} /><b>SNSテンプレートはまだありません</b>{canEditScript && <button type="button" className="secondary" onClick={addTemplate}>追加する</button>}</div>}
        </div>
      </div>
    </section>
  );
}

function AuditionApplicantsPanel({ project, updateProject, onImportAuditionApplicants = null }) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [assignmentTargets, setAssignmentTargets] = useState({});
  const applicants = project.auditionApplicants || [];
  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  const visibleApplicants = applicants.filter((applicant) => {
    if (!normalizedQuery) return true;
    return [applicant.name, applicant.sourceRoleName, applicant.socialInput, applicant.socialUrl, applicant.status]
      .some((value) => String(value || "").toLocaleLowerCase("ja").includes(normalizedQuery));
  });
  const visibleApplicantGroups = groupProductionAuditionApplicantsByRole(project, visibleApplicants);
  const applicantGroupSignature = visibleApplicantGroups.map((group) => group.key).join("|");
  const [openApplicantRoleKeys, setOpenApplicantRoleKeys] = useState(() => new Set());

  useEffect(() => {
    if (normalizedQuery) setOpenApplicantRoleKeys(new Set(visibleApplicantGroups.map((group) => group.key)));
  }, [normalizedQuery, applicantGroupSignature]);

  const setApplicantGroupOpen = (groupKey, open) => setOpenApplicantRoleKeys((current) => {
    const next = new Set(current);
    if (open) next.add(groupKey);
    else next.delete(groupKey);
    return next;
  });

  const patchApplicant = (applicantId, patch) => updateProject((current) => ({
    ...current,
    auditionApplicants: (current.auditionApplicants || []).map((applicant) => applicant.id === applicantId
      ? { ...applicant, ...patch, updatedAt: new Date().toISOString() }
      : applicant)
  }));

  const importApplicants = async () => {
    if (!onImportAuditionApplicants || importing) return;
    setImporting(true);
    setMessage("Googleフォームの回答から、応募者名とXを読み込んでいます…");
    try {
      const result = await onImportAuditionApplicants(project.id);
      updateProject((current) => ({
        ...current,
        auditionApplicants: mergeProductionAuditionApplicants(current.auditionApplicants, result.applicants),
        auditionApplicantsImportedAt: result.importedAt || new Date().toISOString()
      }));
      const responseCount = (result.roleSummaries || []).reduce((total, summary) => total + Number(summary.responseCount || 0), 0);
      const missingForms = (result.roleSummaries || []).filter((summary) => !summary.found).length;
      setMessage(`${result.applicants.length}件の応募者情報を取り込みました（フォーム回答 ${responseCount}件）。${missingForms ? `見つからないフォームが${missingForms}件あります。` : ""}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setImporting(false);
    }
  };

  const assignApplicant = (applicant) => {
    const targetCharacterId = assignmentTargets[applicant.id]
      || applicant.assignedCharacterId
      || applicant.sourceCharacterId
      || project.characters[0]?.id
      || "";
    const targetCharacter = project.characters.find((character) => character.id === targetCharacterId);
    if (!targetCharacter) {
      setMessage("担当へ反映する役を選択してください。");
      return;
    }
    const existingMember = project.castMembers.find((member) => member.characterIds.includes(targetCharacterId));
    const replacementNotice = existingMember && existingMember.actorName !== applicant.name
      ? `\n現在の担当「${existingMember.actorName}」から変更されます。`
      : "";
    if (!confirm(`${applicant.name}を「${targetCharacter.name}」の担当声優へ反映しますか？氏名・呼び名・呼称・Xをまとめて登録します。${replacementNotice}`)) return;
    updateProject((current) => assignProductionAuditionApplicant(current, applicant.id, targetCharacterId));
    setMessage(`${applicant.name}を「${targetCharacter.name}」の担当声優へ反映しました。`);
  };

  const removeApplicant = (applicant) => {
    if (!confirm(`${applicant.name}の応募者情報を一覧から削除しますか？Googleフォームの回答自体は削除されません。`)) return;
    updateProject((current) => ({
      ...current,
      auditionApplicants: (current.auditionApplicants || []).filter((item) => item.id !== applicant.id),
      contactMessageDrafts: (current.contactMessageDrafts || []).filter((draft) => draft.applicantId !== applicant.id)
    }));
    setMessage(`${applicant.name}を応募者一覧から削除しました。`);
  };

  const renderApplicant = (applicant) => {
    const sourceCharacter = project.characters.find((character) => character.id === applicant.sourceCharacterId);
    const socialUrl = normalizeXProfileUrl(applicant.socialUrl || applicant.socialInput);
    const assignmentTarget = assignmentTargets[applicant.id]
      || applicant.assignedCharacterId
      || (project.characters.some((character) => character.id === applicant.sourceCharacterId) ? applicant.sourceCharacterId : "")
      || project.characters[0]?.id
      || "";
    return <article key={applicant.id} className={applicant.status === "合格" ? "accepted" : ""}>
      <div className="audition-applicant-identity">
        <b>{applicant.name}</b>
        <span>応募役：{sourceCharacter?.name || applicant.sourceRoleName || "未設定"}</span>
        <small>{applicant.submittedAt ? formatDate(applicant.submittedAt, true) : "回答日時なし"}</small>
      </div>
      <label><span>連絡用の呼び名</span><input value={applicant.contactName || ""} placeholder={getActorContactName({ actorName: applicant.name })} onChange={(event) => patchApplicant(applicant.id, { contactName: event.target.value })} /></label>
      <label className="audition-applicant-honorific"><span>呼称</span><input value={getActorContactHonorific(applicant)} placeholder="さん" onChange={(event) => patchApplicant(applicant.id, { contactHonorific: event.target.value })} /></label>
      <div className="audition-applicant-x"><span>X</span><b>{applicant.socialInput || "未入力"}</b>{isWebUrl(socialUrl) ? <a className="icon-button" href={socialUrl} target="_blank" rel="noreferrer" title={`${applicant.name}のXを開く`}><ExternalLink size={15} /></a> : <small>URLに変換できません</small>}</div>
      <label><span>選考状態</span><select value={applicant.status} onChange={(event) => patchApplicant(applicant.id, { status: event.target.value })}>{PRODUCTION_AUDITION_APPLICANT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="audition-applicant-assignment"><span>合格・別役で担当する役</span><select value={assignmentTarget} onChange={(event) => setAssignmentTargets((current) => ({ ...current, [applicant.id]: event.target.value }))}>{project.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <div className="audition-applicant-actions">
        <button type="button" className="primary" disabled={!assignmentTarget} onClick={() => assignApplicant(applicant)}><UserPlus size={15} />合格・担当声優へ反映</button>
        <button type="button" className="icon-button danger-icon" title="応募者一覧から削除" aria-label={`${applicant.name}を応募者一覧から削除`} onClick={() => removeApplicant(applicant)}><Trash2 size={15} /></button>
      </div>
    </article>;
  };

  return (
    <section className="task-section audition-applicants-section">
      <header>
        <div><Download size={20} /><div><h3>フォーム応募者</h3><p>Googleフォーム回答から名前とXだけを取り込み、選んだ合格者を担当声優へ反映します。</p></div></div>
        <div className="task-section-actions">
          {project.auditionApplicantsImportedAt && <span>最終取込 {formatDate(project.auditionApplicantsImportedAt, true)}</span>}
          <button type="button" className="primary" disabled={!onImportAuditionApplicants || importing} onClick={importApplicants}>{importing ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{importing ? "回答を取込中…" : "Googleフォーム回答を取り込む"}</button>
        </div>
      </header>
      {message && <p className="production-inline-message" role="status">{message}</p>}
      <div className="audition-applicant-toolbar">
        <label><Search size={16} /><input type="search" value={query} placeholder="応募者名・応募役・X・状態を検索" onChange={(event) => setQuery(event.target.value)} /></label>
        <span>{visibleApplicants.length} / {applicants.length}件</span>
        <small><ShieldCheck size={14} />応募者情報は制作オーナーだけに表示</small>
        {visibleApplicantGroups.length > 0 && <div className="audition-applicant-toolbar-actions">
          <button type="button" className="icon-button" title="応募役をすべて開く" aria-label="応募役をすべて開く" onClick={() => setOpenApplicantRoleKeys(new Set(visibleApplicantGroups.map((group) => group.key)))}><ChevronDown size={16} /></button>
          <button type="button" className="icon-button" title="応募役をすべて閉じる" aria-label="応募役をすべて閉じる" onClick={() => setOpenApplicantRoleKeys(new Set())}><ArrowUp size={16} /></button>
        </div>}
      </div>
      <div className="audition-applicant-list">
        {visibleApplicantGroups.map((group) => {
          const selectedCount = group.applicants.filter((applicant) => applicant.status !== "未選考").length;
          return <details className="audition-applicant-group" key={group.key} open={openApplicantRoleKeys.has(group.key)} onToggle={(event) => setApplicantGroupOpen(group.key, event.currentTarget.open)}>
            <summary>
              <i style={{ background: group.color }} />
              <span><b>{group.roleName}</b><small>{selectedCount ? `選考入力 ${selectedCount}/${group.applicants.length}名` : "未選考"}</small></span>
              <strong>{group.applicants.length}名</strong>
              <ChevronDown size={17} />
            </summary>
            <div className="audition-applicant-group-body">{group.applicants.map(renderApplicant)}</div>
          </details>;
        })}
        {!visibleApplicants.length && <div className="production-empty-state compact"><Users size={28} /><b>{applicants.length ? "検索に一致する応募者はいません" : "応募者情報はまだ取り込まれていません"}</b><span>{applicants.length ? "検索条件を変えてください。" : "フォーム作成済みの役がある状態で「Googleフォーム回答を取り込む」を押してください。"}</span></div>}
      </div>
    </section>
  );
}

const getTaskRoleAnchorId = (characterId = "") => `task-role-${String(characterId || "unknown").replace(/[^A-Za-z0-9_-]/gu, "-")}`;

function TasksView({
  project,
  updateProject,
  canEditScript = true,
  auditionAutomation = {},
  onSaveAuditionAutomationSettings = null,
  onCreateAuditionForm = null,
  onVerifyAuditionForm = null,
  onImportAuditionApplicants = null,
  setActive
}) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [appsScriptWebAppUrl, setAppsScriptWebAppUrl] = useState("");
  const [appsScriptSecret, setAppsScriptSecret] = useState("");
  const [automationMessage, setAutomationMessage] = useState("");
  const [creatingCharacterId, setCreatingCharacterId] = useState("");
  const [automationAction, setAutomationAction] = useState("");
  const [finisherStatus, setFinisherStatus] = useState({ available: false, checking: true });
  const [taskWorkspaceTab, setTaskWorkspaceTab] = useState(() => {
    try {
      const stored = globalThis.localStorage?.getItem("voice-cast-studio-task-tab");
      return ["roles", "contacts", "social"].includes(stored) ? stored : "roles";
    } catch {
      return "roles";
    }
  });
  const unassignedCharacters = useMemo(
    () => getUnassignedProductionCharacters(project),
    [project.characters, project.castMembers, project.lines]
  );
  const tasks = useMemo(() => sortProductionTasks(project.tasks), [project.tasks]);
  const incompleteTaskCount = useMemo(() => tasks.filter((task) => !task.completed).length, [tasks]);
  const auditionProgressByCharacterId = useMemo(() => new Map(
    (project.auditionRoleProgress || []).map((progress) => [progress.characterId, progress])
  ), [project.auditionRoleProgress]);
  const auditionLineCandidatesByCharacterId = useMemo(() => {
    const candidatesByCharacterId = new Map();
    getAuditionLineCandidateDetails(project).forEach((candidate) => {
      if (!candidatesByCharacterId.has(candidate.characterId)) candidatesByCharacterId.set(candidate.characterId, []);
      candidatesByCharacterId.get(candidate.characterId).push(candidate);
    });
    return candidatesByCharacterId;
  }, [project.characters, project.lines]);
  const auditionApplicantCountByCharacterId = useMemo(() => new Map(
    groupProductionAuditionApplicantsByRole(project).filter((group) => group.characterId).map((group) => [group.characterId, group.applicants.length])
  ), [project.characters, project.auditionApplicants]);
  const formCreatedCount = unassignedCharacters.filter((character) => auditionProgressByCharacterId.get(character.id)?.formCreated).length;
  const readyForRecruitmentCount = unassignedCharacters.filter((character) => {
    const progress = auditionProgressByCharacterId.get(character.id);
    return progress?.formStructureVerified && progress?.headerApplied && progress?.uploadVerified;
  }).length;
  const recruitmentStartedCount = unassignedCharacters.filter((character) => auditionProgressByCharacterId.get(character.id)?.recruitmentStarted).length;
  const canOpenAuditionFolder = isWebUrl(project.auditionFormsFolderUrl);
  const canOpenAuditionManagementSheet = isWebUrl(project.auditionManagementSheetUrl);
  const automationSettings = auditionAutomation.settings || {};
  const automationReady = Boolean(automationSettings.hasOpenAiKey && automationSettings.appsScriptConfigured);

  const selectTaskWorkspaceTab = (tab) => {
    const nextTab = canEditScript && ["contacts", "social"].includes(tab) ? tab : "roles";
    setTaskWorkspaceTab(nextTab);
    try {
      globalThis.localStorage?.setItem("voice-cast-studio-task-tab", nextTab);
    } catch {
      // The tab still works when browser storage is unavailable.
    }
  };

  const refreshFinisherStatus = async () => {
    setFinisherStatus((current) => ({ ...current, checking: true }));
    const status = await getAuditionFinisherStatus();
    setFinisherStatus({ ...status, checking: false });
    if (status.available) {
      setAutomationMessage((current) => current.includes("PCフォーム仕上げが起動していません") ? "" : current);
    }
    return status;
  };

  useEffect(() => {
    refreshFinisherStatus();
    const intervalId = globalThis.setInterval(refreshFinisherStatus, 15000);
    return () => globalThis.clearInterval(intervalId);
  }, []);

  const patchTask = (taskId, patch) => updateProject((current) => ({
    ...current,
    tasks: (current.tasks || []).map((task) => task.id === taskId
      ? { ...task, ...patch, updatedAt: new Date().toISOString() }
      : task)
  }));

  const removeTask = (task) => {
    if (!confirm(`「${task.title || "タスク"}」を削除しますか？`)) return;
    updateProject((current) => ({
      ...current,
      tasks: (current.tasks || []).filter((item) => item.id !== task.id)
    }));
  };

  const patchAuditionRoleProgress = (characterId, patch) => updateProject((current) => {
    const progressItems = current.auditionRoleProgress || [];
    const existing = progressItems.find((progress) => progress.characterId === characterId);
    const nextProgress = {
      characterId,
      formCreated: false,
      recruitmentStarted: false,
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const nextProject = {
      ...current,
      auditionRoleProgress: existing
        ? progressItems.map((progress) => progress.characterId === characterId ? nextProgress : progress)
        : [...progressItems, nextProgress]
    };
    return patch.recruitmentStarted === true && !existing?.recruitmentStarted
      ? addProductionAuditionStartSchedule(nextProject, characterId)
      : nextProject;
  });

  const openCharacterEditor = (characterId) => {
    setActive("characters");
    globalThis.setTimeout(() => {
      globalThis.document?.getElementById(`character-${characterId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const saveAutomationSettings = async () => {
    if (!onSaveAuditionAutomationSettings || !openAiApiKey.trim()) return;
    setAutomationMessage("");
    try {
      await onSaveAuditionAutomationSettings({ openAiApiKey: openAiApiKey.trim() });
      setOpenAiApiKey("");
      setAutomationMessage("OpenAI APIキーを安全に保存しました。");
    } catch (error) {
      setAutomationMessage(error.message);
    }
  };

  const saveGoogleAutomationSettings = async () => {
    if (!onSaveAuditionAutomationSettings || !appsScriptWebAppUrl.trim() || !appsScriptSecret.trim()) return;
    setAutomationMessage("");
    try {
      await onSaveAuditionAutomationSettings({
        appsScriptWebAppUrl: appsScriptWebAppUrl.trim(),
        appsScriptSecret: appsScriptSecret.trim()
      });
      setAppsScriptWebAppUrl("");
      setAppsScriptSecret("");
      setAutomationMessage("Googleフォーム自動作成との連携を保存しました。");
    } catch (error) {
      setAutomationMessage(error.message);
    }
  };

  const runPcFinish = async (character, progress) => {
    const displayRoleName = getAuditionDisplayRoleName(character.name);
    setAutomationAction("finish");
    setAutomationMessage(`${character.name}のアップロード先を復元し、Drive画像をフォームヘッダーへ設定しています…`);
    patchAuditionRoleProgress(character.id, {
      pcFinishStatus: "running",
      pcFinishMessage: "PCでGoogleフォームを仕上げています。"
    });
    try {
      const result = await finishAuditionFormOnPc({
        roleName: displayRoleName,
        formEditUrl: progress?.formEditUrl,
        formResponderUrl: progress?.formResponderUrl,
        headerImageUrl: progress?.headerImageUrl,
        headerFileName: `${displayRoleName}_Googleフォームヘッダー_1600x400.png`
      });
      patchAuditionRoleProgress(character.id, {
        headerApplied: Boolean(result.headerApplied),
        uploadVerified: Boolean(result.uploadVerified),
        pcFinishStatus: "complete",
        pcFinishMessage: "ヘッダー設定と音声アップロード欄の確認が完了しました。",
        pcFinishedAt: result.finishedAt || new Date().toISOString()
      });
      setFinisherStatus({ available: true, checking: false, ok: true });
      return result;
    } catch (error) {
      patchAuditionRoleProgress(character.id, {
        pcFinishStatus: "error",
        pcFinishMessage: error.message
      });
      if (error.code === "audition_finisher_unavailable") {
        setFinisherStatus({ available: false, checking: false, message: error.message });
      }
      throw error;
    }
  };

  const finishAuditionFormForCharacter = async (character, progress) => {
    if (creatingCharacterId) return;
    setCreatingCharacterId(character.id);
    try {
      await runPcFinish(character, progress);
      setAutomationMessage(`${character.name}：アップロード先の復元、ヘッダー設定、応募画面の音声アップロード欄まで確認できました。`);
    } catch (error) {
      setAutomationMessage(error.message);
    } finally {
      setCreatingCharacterId("");
      setAutomationAction("");
    }
  };

  const createAuditionFormForCharacter = async (character, replaceImages = false) => {
    if (!onCreateAuditionForm || creatingCharacterId) return;
    setCreatingCharacterId(character.id);
    setAutomationAction(replaceImages ? "images" : "create");
    setAutomationMessage(replaceImages
      ? `${character.name}の画像を再生成し、文字と余白を監査しています。合格後に古い画像を差し替えます…`
      : `${character.name}のGoogleフォームを先に作成しています…`);
    try {
      const result = await onCreateAuditionForm(project.id, character.id, {
        replaceImages,
        auditionDeadline: auditionProgressByCharacterId.get(character.id)?.auditionDeadline || "",
        onProgress: (message, action) => {
          setAutomationMessage(message);
          if (action) setAutomationAction(action);
        }
      });
      const headerAttempts = Number(result.imageAudit?.header?.attempts) || 1;
      const socialAttempts = Number(result.imageAudit?.social?.attempts) || 1;
      const auditSummary = `画像監査はヘッダー${headerAttempts}回目、SNS${socialAttempts}回目で合格しました。`;
      const actionSummary = replaceImages
        ? "Driveの画像を、監査に合格した画像へ差し替えました。"
        : result.recovered
          ? "作成済みフォームとDrive画像をツールへ反映しました。"
          : "フォームを作成し、2種類の画像をDriveへ保存しました。";
      await runPcFinish(character, result.progress);
      setAutomationMessage(`${character.name}：${actionSummary}${auditSummary} アップロード先の復元、テーマヘッダー設定、応募画面の音声アップロード欄まで確認できました。`);
    } catch (error) {
      setAutomationMessage(error.message);
    } finally {
      setCreatingCharacterId("");
      setAutomationAction("");
    }
  };

  const verifyAuditionFormForCharacter = async (character) => {
    if (!onVerifyAuditionForm || creatingCharacterId) return;
    setCreatingCharacterId(character.id);
    setAutomationAction("verify");
    setAutomationMessage(`${character.name}のフォーム名・設問・同意欄・音声アップロード欄・公開状態・応募締め切りを再検査しています…`);
    try {
      const result = await onVerifyAuditionForm(project.id, character.id, {
        auditionDeadline: auditionProgressByCharacterId.get(character.id)?.auditionDeadline || ""
      });
      const repaired = result.progress?.formValidation?.repaired || [];
      const deadlineLabel = result.progress?.formValidation?.auditionDeadlineLabel;
      setAutomationMessage(`${character.name}：フォーム構成の再検査に合格しました。${deadlineLabel ? `締切は${deadlineLabel}で、自動終了を設定しました。` : "締切は未設定です。"}${repaired.length ? `${repaired.length}項目を自動修正しました。` : "修正が必要な項目はありませんでした。"}`);
    } catch (error) {
      setAutomationMessage(error.message);
    } finally {
      setCreatingCharacterId("");
      setAutomationAction("");
    }
  };

  return (
    <div className="production-page-stack tasks-workspace">
      <div className="task-workspace-tabs" role="tablist" aria-label="タスク画面">
        <button type="button" className={taskWorkspaceTab === "roles" || !canEditScript ? "active" : ""} onClick={() => selectTaskWorkspaceTab("roles")}><Users size={17} /><span><b>募集役</b><small>{unassignedCharacters.length}役</small></span></button>
        {canEditScript && <button type="button" className={taskWorkspaceTab === "contacts" ? "active" : ""} onClick={() => selectTaskWorkspaceTab("contacts")}><MessageSquareText size={17} /><span><b>連絡テンプレート</b><small>{project.contactTemplates.length}件</small></span></button>}
        {canEditScript && <button type="button" className={taskWorkspaceTab === "social" ? "active" : ""} onClick={() => selectTaskWorkspaceTab("social")}><Globe2 size={17} /><span><b>SNSテンプレート</b><small>{project.socialTemplates.length}件</small></span></button>}
      </div>
      {taskWorkspaceTab === "contacts" && canEditScript ? (
        <ContactTemplatesView project={project} updateProject={updateProject} canEditScript={canEditScript} />
      ) : taskWorkspaceTab === "social" && canEditScript ? (
        <SocialTemplatesView project={project} updateProject={updateProject} canEditScript={canEditScript} />
      ) : <div className="task-role-layout">
      {unassignedCharacters.length > 0 && <aside className="task-role-toc" aria-label="募集役目次">
        <header><Users size={17} /><div><b>募集役目次</b><span>{unassignedCharacters.length}役</span></div></header>
        <nav>
          {unassignedCharacters.map((character) => {
            const roleProgress = auditionProgressByCharacterId.get(character.id);
            const applicantCount = auditionApplicantCountByCharacterId.get(character.id) || 0;
            return <button type="button" key={character.id} onClick={() => globalThis.document?.getElementById(getTaskRoleAnchorId(character.id))?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <i style={{ background: character.color }} />
              <span><b>{getAuditionDisplayRoleName(character.name)}</b><small>{character.dialogueCount}セリフ{applicantCount ? ` ・ 応募${applicantCount}名` : ""}</small></span>
              <em>{roleProgress?.recruitmentStarted ? "募集中" : roleProgress?.formCreated ? "フォーム済" : "準備前"}</em>
            </button>;
          })}
        </nav>
      </aside>}
      <div className="task-role-content">
      {canEditScript && <AuditionApplicantsPanel project={project} updateProject={updateProject} onImportAuditionApplicants={onImportAuditionApplicants} />}
      <section className={`task-section unassigned-role-section${unassignedCharacters.length ? " attention" : " complete"}`}>
        <header>
          <div><Users size={20} /><div><h3>配役が決まっていない役</h3><p>台本にセリフがあり、担当声優が未登録の役を自動で表示します。</p></div></div>
          <div className="task-section-counts">
            <span className="task-section-count">{unassignedCharacters.length ? `${unassignedCharacters.length}役` : "全役決定"}</span>
            {unassignedCharacters.length > 0 && <span>フォーム作成 {formCreatedCount}/{unassignedCharacters.length}</span>}
            {unassignedCharacters.length > 0 && <span>募集準備 {readyForRecruitmentCount}/{unassignedCharacters.length}</span>}
            {unassignedCharacters.length > 0 && <span>募集開始 {recruitmentStartedCount}/{unassignedCharacters.length}</span>}
          </div>
        </header>

        {unassignedCharacters.length > 0 ? (
          <>
            {canEditScript && <div className="audition-form-panel">
              <div><FolderOpen size={18} /><div><b>オーディションフォーム保管フォルダー</b><span>作成したフォームをまとめているGoogle Driveフォルダーです。</span></div></div>
              <div className="audition-form-control">
                <input
                  type="url"
                  aria-label="オーディションフォームフォルダーURL"
                  value={project.auditionFormsFolderUrl || ""}
                  placeholder="https://drive.google.com/drive/folders/..."
                  readOnly={!canEditScript}
                  onChange={(event) => updateProject((current) => ({ ...current, auditionFormsFolderUrl: event.target.value }))}
                />
                <a
                  className={`secondary audition-form-open${canOpenAuditionFolder ? "" : " disabled"}`}
                  href={canOpenAuditionFolder ? project.auditionFormsFolderUrl : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!canOpenAuditionFolder}
                ><ExternalLink size={16} />フォルダーを開く</a>
              </div>
            </div>}

            {canEditScript && <div className="audition-form-panel audition-sheet-panel">
              <div><FileSpreadsheet size={18} /><div><b>声優オーディション総合管理スプレッドシート</b><span>募集役・応募者・選考状況をまとめて管理するGoogleスプレッドシートです。</span></div></div>
              <div className="audition-form-control">
                <input
                  type="url"
                  aria-label="声優オーディション総合管理スプレッドシートURL"
                  value={project.auditionManagementSheetUrl || ""}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  readOnly={!canEditScript}
                  onChange={(event) => updateProject((current) => ({ ...current, auditionManagementSheetUrl: event.target.value }))}
                />
                <a
                  className={`secondary audition-form-open${canOpenAuditionManagementSheet ? "" : " disabled"}`}
                  href={canOpenAuditionManagementSheet ? project.auditionManagementSheetUrl : undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!canOpenAuditionManagementSheet}
                ><ExternalLink size={16} />スプレッドシートを開く</a>
              </div>
            </div>}

            {canEditScript && <details className="audition-automation-panel" aria-label="オーディションフォーム自動作成設定">
              <summary className="audition-automation-heading">
                <div><Sparkles size={19} /><div><b>フォーム自動作成</b><span>見本フォームを複製・検査し、募集締め切りの表示と自動終了、監査済み画像2枚のDrive保存まで行います。</span></div></div>
                <div className="audition-automation-summary-status">
                  <div className="audition-automation-badges">
                    <span className={automationSettings.hasOpenAiKey ? "ready" : "waiting"}>{automationSettings.hasOpenAiKey ? "APIキー設定済み" : "APIキー未設定"}</span>
                    <span className={automationSettings.appsScriptConfigured ? "ready" : "waiting"}>{automationSettings.appsScriptConfigured ? "Google連携済み" : "Google連携準備中"}</span>
                    <span className={finisherStatus.available ? "ready" : "waiting"}>{finisherStatus.checking ? "PC仕上げ確認中" : finisherStatus.available ? "PC仕上げ接続済み" : "PC仕上げ未起動"}</span>
                  </div>
                  <ChevronDown className="audition-automation-toggle" size={18} />
                </div>
              </summary>
              <div className="audition-automation-controls">
                <label>
                  <span><KeyRound size={15} />OpenAI APIキー</span>
                  <input
                    type="password"
                    value={openAiApiKey}
                    autoComplete="new-password"
                    placeholder={automationSettings.hasOpenAiKey ? "保存済み（変更する時だけ入力）" : "sk-..."}
                    onChange={(event) => setOpenAiApiKey(event.target.value)}
                  />
                </label>
                <button type="button" className="primary" disabled={!openAiApiKey.trim() || auditionAutomation.status === "saving"} onClick={saveAutomationSettings}>
                  {auditionAutomation.status === "saving" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
                  APIキーを保存
                </button>
              </div>
              {getWordPressRuntime()?.mode === "gas" && <GasAuditionIntegrationSettings settings={automationSettings} onSave={onSaveAuditionAutomationSettings} busy={auditionAutomation.status === "saving"} />}
              {getWordPressRuntime()?.mode !== "gas" && !automationSettings.appsScriptConfigured && <details className="audition-google-setup">
                <summary>初回のGoogle連携設定</summary>
                <p>設置時に一度だけ使う制作オーナー専用設定です。</p>
                <div>
                  <label>
                    <span>Google Apps Script URL</span>
                    <input
                      type="url"
                      value={appsScriptWebAppUrl}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      onChange={(event) => setAppsScriptWebAppUrl(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Google連携シークレット</span>
                    <input
                      type="password"
                      value={appsScriptSecret}
                      autoComplete="new-password"
                      onChange={(event) => setAppsScriptSecret(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!appsScriptWebAppUrl.trim() || !appsScriptSecret.trim() || auditionAutomation.status === "saving"}
                    onClick={saveGoogleAutomationSettings}
                  ><Link size={16} />Google連携を保存</button>
                </div>
              </details>}
              <AuditionSocialTemplateSettings project={project} updateProject={updateProject} />
              <div className="audition-automation-notes">
                <span><ShieldCheck size={15} />APIキーと作成ボタンは制作オーナーだけに表示され、キーそのものは画面へ再表示しません。</span>
                <span><ShieldCheck size={15} />フォームを先に作成し、画像は1回ずつ生成・監査します。不合格なら最大{automationSettings.maxImageAttempts || 3}回まで自動で作り直します。</span>
                <span><FolderOpen size={15} />生成画像はGoogle Driveの専用フォルダーへ自動保存します。PCの保存画面は開きません。</span>
                <span><CheckCircle2 size={15} />PC仕上げが、アップロード先の復元・ヘッダー設定・応募画面の音声提出欄まで検査します。</span>
                <span><ShieldCheck size={15} />初回だけ、PC仕上げ用Chromeでフォーム所有者のGoogleアカウントを選びます。次回からログイン状態を引き継ぎます。</span>
                {(automationSettings.imageFolderUrl || getWordPressRuntime()?.mode !== "gas") && <a href={automationSettings.imageFolderUrl || AUDITION_IMAGE_FOLDER_URL} target="_blank" rel="noreferrer"><ExternalLink size={15} />生成画像フォルダーを開く</a>}
                <button type="button" className="text-button" onClick={refreshFinisherStatus}>{finisherStatus.checking ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}PC接続を再確認</button>
              </div>
              {(automationMessage || auditionAutomation.message) && <p className={`audition-automation-message${auditionAutomation.status === "error" ? " error" : ""}`} role="status">{automationMessage || auditionAutomation.message}</p>}
            </details>}

            <div className="unassigned-role-grid">
              {unassignedCharacters.map((character) => {
                const roleProgress = auditionProgressByCharacterId.get(character.id);
                const isCreating = creatingCharacterId === character.id;
                const isCreatingForm = isCreating && automationAction === "create";
                const isRebuildingImages = isCreating && automationAction === "images";
                const isVerifying = isCreating && automationAction === "verify";
                const isFinishing = isCreating && automationAction === "finish";
                const hasGeneratedImages = Boolean(roleProgress?.headerImageUrl && roleProgress?.socialImageUrl);
                return <article id={getTaskRoleAnchorId(character.id)} className="unassigned-role-card" key={character.id} style={{ "--character-color": character.color }}>
                  <i />
                  <div className="unassigned-role-main">
                    <div>
                      <strong>{character.name}</strong>
                      <span>{character.dialogueCount}セリフ</span>
                      {character.scriptName && character.scriptName !== character.name && <small>台本：{character.scriptName}</small>}
                    </div>
                  </div>
                  <div className="unassigned-role-actions">
                    {canEditScript && <button
                      type="button"
                      className="primary audition-create-button"
                      disabled={!automationReady || Boolean(creatingCharacterId) || !character.imageUrl || Boolean(roleProgress?.formEditUrl)}
                      title={!character.imageUrl ? "先にキャラクター画像を登録してください" : !automationReady ? "先にAPIキーとGoogle連携を設定してください" : ""}
                      onClick={() => createAuditionFormForCharacter(character)}
                    >{roleProgress?.formEditUrl
                      ? <><CheckCircle2 size={15} />作成済み</>
                      : <>{isCreatingForm ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{isCreatingForm ? "フォーム作成中…" : "フォームを自動作成"}</>}</button>}
                    {canEditScript && roleProgress?.formEditUrl && <button
                      type="button"
                      className="secondary audition-rebuild-button"
                      disabled={!automationReady || Boolean(creatingCharacterId) || !character.imageUrl}
                      onClick={() => createAuditionFormForCharacter(character, true)}
                    >{isRebuildingImages ? <LoaderCircle className="spin" size={15} /> : <RotateCcw size={15} />}{isRebuildingImages ? "画像を生成・監査中…" : hasGeneratedImages ? "画像を監査して作り直す" : "画像を生成・監査する"}</button>}
                    {canEditScript && roleProgress?.formEditUrl && <button
                      type="button"
                      className="secondary audition-verify-button"
                      disabled={!onVerifyAuditionForm || Boolean(creatingCharacterId)}
                      onClick={() => verifyAuditionFormForCharacter(character)}
                    >{isVerifying ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}{isVerifying ? "検査中…" : "構成・締切を再同期"}</button>}
                    {canEditScript && roleProgress?.formEditUrl && roleProgress?.headerImageUrl && <button
                      type="button"
                      className="primary audition-finish-button"
                      disabled={Boolean(creatingCharacterId)}
                      onClick={() => finishAuditionFormForCharacter(character, roleProgress)}
                    >{isFinishing ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />}{isFinishing ? "PCで仕上げ中…" : roleProgress?.headerApplied && roleProgress?.uploadVerified ? "PC仕上げを再確認" : "PCでフォームを仕上げる"}</button>}
                    {canEditScript && canOpenAuditionFolder && <a className="secondary" href={project.auditionFormsFolderUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />フォーム一覧</a>}
                    {canEditScript && <button type="button" className="secondary" onClick={() => openCharacterEditor(character.id)}><Users size={15} />担当声優を登録</button>}
                  </div>
                  <div className="unassigned-role-statuses audition-created-links" aria-label={`${character.name}のオーディション進捗と作成済み資料`}>
                    <label className={roleProgress?.formStructureVerified ? "checked" : ""}>
                      <input
                        type="checkbox"
                        aria-label={`${character.name} フォーム構成検査済み`}
                        checked={Boolean(roleProgress?.formStructureVerified)}
                        disabled
                      />
                      <span>構成自動検査済み</span>
                    </label>
                    <label className={roleProgress?.recruitmentStarted ? "checked" : ""}>
                      <input
                        type="checkbox"
                        aria-label={`${character.name} 募集開始済み`}
                        checked={Boolean(roleProgress?.recruitmentStarted)}
                        disabled={!canEditScript}
                        onChange={(event) => patchAuditionRoleProgress(character.id, { recruitmentStarted: event.target.checked })}
                      />
                      <span>募集開始済み</span>
                    </label>
                    {canEditScript && roleProgress?.formEditUrl && <>
                      <a href={roleProgress.formEditUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />フォームを編集</a>
                      {roleProgress.formResponderUrl && <a href={roleProgress.formResponderUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />応募画面を確認</a>}
                      {roleProgress.headerImageUrl && <a href={roleProgress.headerImageUrl} target="_blank" rel="noreferrer"><FileImage size={14} />ヘッダー画像</a>}
                      {roleProgress.socialImageUrl && <a href={roleProgress.socialImageUrl} target="_blank" rel="noreferrer"><FileImage size={14} />SNS画像</a>}
                      {roleProgress.imageAudit?.passed && <span className="audition-audit-pass"><ShieldCheck size={14} />画像監査済み（ヘッダー{roleProgress.imageAudit.header?.attempts || 1}回・SNS{roleProgress.imageAudit.social?.attempts || 1}回）</span>}
                      {roleProgress.formStructureVerified && <span className="audition-audit-pass"><ShieldCheck size={14} />設問5個・同意欄・音声アップロード1個・公開状態を自動検査済み</span>}
                      {roleProgress.formValidation?.deadlineConfigured && <span className="audition-audit-pass"><CalendarClock size={14} />応募締切 {roleProgress.formValidation.auditionDeadlineLabel}・自動終了設定済み</span>}
                      {roleProgress.pcFinishStatus === "complete"
                        ? <span className="audition-audit-pass"><CheckCircle2 size={14} />PC仕上げ済み：ヘッダー設定と音声提出欄を確認しました。</span>
                        : <span>「PCでフォームを仕上げる」を押すと、アップロード先の復元から応募画面の検査まで続けて行います。</span>}
                      {roleProgress.pcFinishStatus === "error"
                        && roleProgress.pcFinishMessage
                        && !(finisherStatus.available && roleProgress.pcFinishMessage.includes("PCフォーム仕上げが起動していません"))
                        && <span className="audition-finish-error"><AlertCircle size={14} />{roleProgress.pcFinishMessage}</span>}
                    </>}
                  </div>
                  {canEditScript && <AuditionSocialPostEditor
                    character={character}
                    project={project}
                    lineCandidates={auditionLineCandidatesByCharacterId.get(character.id) || []}
                    roleProgress={roleProgress}
                    imageFolderUrl={automationSettings.imageFolderUrl || (getWordPressRuntime()?.mode !== "gas" ? AUDITION_IMAGE_FOLDER_URL : "")}
                    onSave={(patch) => patchAuditionRoleProgress(character.id, patch)}
                  />}
                </article>
              })}
            </div>
          </>
        ) : (
          <div className="production-empty-state compact"><CheckCircle2 size={28} /><b>台本内のすべての役に担当声優が登録されています</b><span>担当声優名を外した役は、自動でこの一覧へ戻ります。</span></div>
        )}
      </section>

      <section className="task-section manual-task-section">
        <header>
          <div><ListTodo size={20} /><div><h3>手動タスク</h3><p>配役以外の作業を自由に追加し、完了状況を全員で共有します。</p></div></div>
          <div className="task-section-actions"><span>{incompleteTaskCount}件 未完了</span>{canEditScript && <button type="button" className="primary" onClick={() => updateProject((current) => ({ ...current, tasks: [...(current.tasks || []), createProductionTask()] }))}><Plus size={16} />タスクを追加</button>}</div>
        </header>
        <div className="production-task-list">
          {tasks.map((task) => (
            <article className={`${task.completed ? "completed" : ""}${task.priority === "重要" ? " important" : ""}`} key={task.id}>
              <label className="task-complete-control">
                <input type="checkbox" checked={task.completed} disabled={!canEditScript} onChange={(event) => patchTask(task.id, { completed: event.target.checked })} />
                <span>{task.completed ? "完了" : "未完了"}</span>
              </label>
              <label className="task-title-field"><span>タスク名</span><input value={task.title} readOnly={!canEditScript} onChange={(event) => patchTask(task.id, { title: event.target.value })} /></label>
              <label><span>期日（任意）</span><input type="date" value={task.dueDate} disabled={!canEditScript} onChange={(event) => patchTask(task.id, { dueDate: event.target.value })} /></label>
              <label><span>優先度</span><select value={task.priority} disabled={!canEditScript} onChange={(event) => patchTask(task.id, { priority: event.target.value })}>{PRODUCTION_TASK_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
              <label className="task-notes-field"><span>共有メモ</span><BufferedTextarea value={task.notes} readOnly={!canEditScript} onCommit={(notes) => patchTask(task.id, { notes })} /></label>
              {canEditScript && <button type="button" className="icon-button danger-icon" title="タスクを削除" aria-label={`${task.title || "タスク"}を削除`} onClick={() => removeTask(task)}><Trash2 size={16} /></button>}
            </article>
          ))}
          {!tasks.length && <div className="production-empty-state compact"><ListTodo size={28} /><b>手動タスクはまだありません</b><span>「タスクを追加」から、配役以外の作業を登録できます。</span></div>}
        </div>
      </section>
      </div>
      </div>}
    </div>
  );
}

const PAGE_COPY = {
  home: ["ホーム", "収録、確認、質問、締切、追加の期日、直近の予定を作品単位でまとめて確認します。"],
  characters: ["キャラクター", "人物設定、担当声優、担当者SNSと収録フォルダーを管理します。"],
  links: ["共有リンク", "キャラクター別の収録フォルダーと作品全体の共有URLを管理します。"],
  materials: ["素材", "確定素材と、台本から拾った必要素材を章ごとに分けて管理します。"],
  questions: ["質問", "作品やセリフに紐づく質問と回答状況を共有します。"],
  tasks: ["タスク", "募集役、フォーム応募者、個別連絡、全体向けSNSテンプレートを切り替えて管理します。"],
  schedule: ["予定", "締切・期日と直近の制作予定を分けて、編集状況や全体連絡と一緒に管理します。"]
};

export function ProductionWorkspace({
  view,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  updateProject,
  siteUsers = [],
  canEditScript = true,
  auditionAutomation = {},
  currentUser = {},
  onSaveAuditionAutomationSettings = null,
  onCreateAuditionForm = null,
  onVerifyAuditionForm = null,
  onImportAuditionApplicants = null,
  onCreateQuestion = null,
  onResolveQuestion = null,
  setActive
}) {
  const project = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || projects[0],
    [projects, selectedProjectId]
  );

  if (!project) return <EmptyWorkspace setActive={setActive} />;
  const [title, subtitle] = PAGE_COPY[view] || PAGE_COPY.home;

  return (
    <div className="view-stack production-workspace">
      <SectionTitle title={title} subtitle={subtitle} />
      <ProjectBar
        projects={projects}
        project={project}
        selectedProjectId={project.id}
        setSelectedProjectId={setSelectedProjectId}
        updateProject={updateProject}
        canEditScript={canEditScript}
      />
      {view === "home" && <ProductionHome project={project} setActive={setActive} updateProject={updateProject} canEditScript={canEditScript} />}
      {view === "characters" && <CharactersView project={project} updateProject={updateProject} siteUsers={siteUsers} canEditScript={canEditScript} />}
      {view === "links" && <LinksView project={project} updateProject={updateProject} canEditScript={canEditScript} />}
      {view === "materials" && <MaterialsView project={project} updateProject={updateProject} canEditScript={canEditScript} />}
      {view === "questions" && (
        <QuestionsView
          project={project}
          updateProject={updateProject}
          canEditScript={canEditScript}
          currentUser={currentUser}
          onCreateQuestion={onCreateQuestion}
          onResolveQuestion={onResolveQuestion}
        />
      )}
      {view === "tasks" && <TasksView
        project={project}
        updateProject={updateProject}
        canEditScript={canEditScript}
        auditionAutomation={auditionAutomation}
        onSaveAuditionAutomationSettings={onSaveAuditionAutomationSettings}
        onCreateAuditionForm={onCreateAuditionForm}
        onVerifyAuditionForm={onVerifyAuditionForm}
        onImportAuditionApplicants={onImportAuditionApplicants}
        setActive={setActive}
      />}
      {view === "schedule" && <ScheduleView project={project} updateProject={updateProject} canEditScript={canEditScript} />}
    </div>
  );
}
