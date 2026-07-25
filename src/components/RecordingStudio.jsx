import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  Eye,
  Eraser,
  FileAudio,
  FileText,
  FilePlus2,
  History,
  KeyRound,
  Link,
  ListFilter,
  LockKeyhole,
  MessageSquareText,
  Mic2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Table2,
  Trash2,
  Upload,
  UserRound,
  Users
} from "lucide-react";
import { getFromGasEndpoint, loadAppConfig, postToGasEndpoint } from "../lib/gas.js";
import {
  AUDIO_FILE_ACCEPT,
  getGoogleDriveFileId,
  isWebUrl,
  makeDirectAudioDownloadUrl,
  newId,
  parseCsv
} from "../lib/core.js";
import {
  ACTOR_RECORDING_STATUSES,
  DIRECTOR_REVIEW_STATUSES,
  archiveScriptVersion,
  createRecordingAccessKey,
  createRecordingProject,
  addRubyNotation,
  getCharacterName,
  getFilteredRecordingLines,
  getRecordingProgress,
  getShareableRecordingProject,
  getScriptChapterKey,
  getScriptImportPlan,
  getScriptSceneKey,
  isScriptStructureLabel,
  makeRecordingShareUrl,
  mergeRemoteRecordingProject,
  normalizeRecordingProject,
  parseGoogleDocsScript,
  parseRubyText,
  parseScriptTable,
  hasRubyNotation,
  restoreScriptSnapshot,
  stripRubyNotation
} from "../lib/recording.js";
import { Field, SectionTitle, TextArea } from "./ui.jsx";

const MAX_RECORDING_UPLOAD_BYTES = 25 * 1024 * 1024;
const COLLABORATIVE_LINE_FIELDS = new Set([
  "actorStatus",
  "reviewStatus",
  "recordingUrl",
  "recordingFileName",
  "actorNote",
  "directorNote"
]);
const BOARD_STATUS_FILTERS = ["すべて", "未収録", "収録済み", "未確認", "OK", "リテイク", "保留"];

const formatUpdatedAt = (value) => {
  if (!value) return "更新履歴なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatActorDisplayName = (name = "") => {
  const trimmed = String(name || "共有メンバー").trim();
  return /(さん|様|さま|氏)$/.test(trimmed) ? trimmed : `${trimmed}さん`;
};

const getPlaybackUrl = (url = "") => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return getGoogleDriveFileId(trimmed) ? makeDirectAudioDownloadUrl(trimmed) : trimmed;
};

function RubyText({ text = "" }) {
  return (
    <>
      {parseRubyText(text).map((segment, index) =>
        segment.type === "ruby" ? (
          <ruby key={`${segment.base}-${segment.reading}-${index}`}>
            {segment.base}
            <rp>（</rp>
            <rt>{segment.reading}</rt>
            <rp>）</rp>
          </ruby>
        ) : (
          <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>
        )
      )}
    </>
  );
}

function RubyEditor({ text, onChange, compact = false }) {
  const [target, setTarget] = useState("");
  const [reading, setReading] = useState("");
  const [message, setMessage] = useState("");

  const applyRuby = () => {
    const result = addRubyNotation(text, target, reading);
    setMessage(result.message);
    if (!result.ok) return;
    onChange(result.text);
    setTarget("");
    setReading("");
  };

  const removeRuby = () => {
    if (!hasRubyNotation(text)) return;
    if (!confirm("このセリフのルビをすべて外しますか？文字そのものは残ります。")) return;
    onChange(stripRubyNotation(text));
    setMessage("このセリフのルビを外しました。");
  };

  return (
    <div className={`ruby-editor${compact ? " compact" : ""}`}>
      <div className="ruby-editor-heading">
        <span><BookOpenText size={15} />ルビ</span>
        <small>セリフ内の文字を指定して、読みを上に表示します。</small>
      </div>
      <div className="ruby-editor-controls">
        <label>
          <span>ルビを付ける文字</span>
          <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="例：覚悟" />
        </label>
        <label>
          <span>読み</span>
          <input value={reading} onChange={(event) => setReading(event.target.value)} placeholder="例：かくご" />
        </label>
        <button type="button" className="secondary" onClick={applyRuby} disabled={!target.trim() || !reading.trim()}>
          <BookOpenText size={15} />ルビを付ける
        </button>
        <button type="button" className="icon-button danger-icon" title="このセリフのルビをすべて外す" onClick={removeRuby} disabled={!hasRubyNotation(text)}>
          <Eraser size={15} />
        </button>
      </div>
      <div className="ruby-preview">
        <span>表示</span>
        <p><RubyText text={text || "セリフを入力すると、ここにルビ付きで表示されます。"} /></p>
      </div>
      {message && <small className="ruby-editor-message">{message}</small>}
    </div>
  );
}

const copyText = async (text, setMessage, message = "コピーしました。") => {
  try {
    await navigator.clipboard.writeText(text);
    setMessage(message);
  } catch {
    setMessage("コピーできませんでした。URLを選択してコピーしてください。");
  }
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("録音ファイルを読み取れませんでした。"));
    reader.readAsDataURL(file);
  });

const getSceneGroups = (lines = []) => {
  const groups = [];
  lines.forEach((line) => {
    const previous = groups[groups.length - 1];
    if (previous?.sceneId === line.sceneId) {
      previous.lines.push(line);
    } else {
      groups.push({ sceneId: line.sceneId, title: line.sceneTitle, lines: [line] });
    }
  });
  return groups;
};

const getChapterGroups = (lines = []) => {
  const chapters = [];
  const chapterById = new Map();
  lines.forEach((line) => {
    const chapterId = line.chapterId || "chapter_default";
    let chapter = chapterById.get(chapterId);
    if (!chapter) {
      chapter = {
        chapterId,
        title: line.chapterTitle || "第一章",
        lines: [],
        scenes: [],
        sceneById: new Map()
      };
      chapterById.set(chapterId, chapter);
      chapters.push(chapter);
    }
    chapter.lines.push(line);
    let scene = chapter.sceneById.get(line.sceneId);
    if (!scene) {
      scene = { sceneId: line.sceneId, title: line.sceneTitle, lines: [] };
      chapter.sceneById.set(line.sceneId, scene);
      chapter.scenes.push(scene);
    }
    scene.lines.push(line);
  });
  return chapters.map(({ sceneById, ...chapter }) => chapter);
};

const makeCharacterTint = (color = "#5f6d7a", alpha = 0.1) => {
  const hex = String(color || "").trim().replace(/^#/, "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => `${part}${part}`).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(95, 109, 122, ${alpha})`;
  const value = Number.parseInt(normalized, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

function ChapterSelector({
  chapters,
  selectedChapterId,
  selectedSceneId,
  setSelectedChapterId,
  setSelectedSceneId
}) {
  const selectedChapter = chapters.find((chapter) => chapter.chapterId === selectedChapterId);
  return (
    <div className="script-scope-picker">
      <div className="script-scope-heading">
        <BookOpenText size={19} />
        <span>表示する範囲</span>
      </div>
      <div className="script-chapter-options" role="tablist" aria-label="台本の章">
        <button
          type="button"
          className={selectedChapterId ? "" : "active"}
          onClick={() => setSelectedChapterId("")}
        >
          <strong>ボイスドラマ脚本全文</strong>
          <small>{chapters.length}章</small>
        </button>
        {chapters.map((chapter) => (
          <button
            type="button"
            key={chapter.chapterId}
            className={selectedChapterId === chapter.chapterId ? "active" : ""}
            onClick={() => setSelectedChapterId(chapter.chapterId)}
          >
            <strong>{chapter.title}</strong>
            <small>{chapter.scenes.length}シーン / {chapter.lines.filter((line) => line.kind !== "direction").length}セリフ</small>
          </button>
        ))}
      </div>
      {selectedChapter && (
        <div className="script-scene-scope">
          <div className="script-scene-scope-heading">
            <span>{selectedChapter.title}</span>
            <small>シーンを選択</small>
          </div>
          <div className="script-scene-options" role="tablist" aria-label={`${selectedChapter.title}のシーン`}>
            <button type="button" className={selectedSceneId ? "" : "active"} onClick={() => setSelectedSceneId("")}>
              <strong>章の全文</strong>
              <small>{selectedChapter.lines.filter((line) => line.kind !== "direction").length}セリフ</small>
            </button>
            {selectedChapter.scenes.map((scene) => (
              <button type="button" key={scene.sceneId} className={selectedSceneId === scene.sceneId ? "active" : ""} onClick={() => setSelectedSceneId(scene.sceneId)}>
                <strong>{scene.title}</strong>
                <small>{scene.lines.filter((line) => line.kind !== "direction").length}セリフ</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptChapterSection({ chapter, open, onToggle, children }) {
  return (
    <section className={`script-chapter${open ? " open" : ""}`}>
      <button type="button" className="script-chapter-heading" onClick={onToggle} aria-expanded={open}>
        <span>{open ? <ChevronUp size={19} /> : <ChevronDown size={19} />}<strong>{chapter.title}</strong></span>
        <small>{chapter.scenes.length}シーン / {chapter.lines.filter((line) => !line.isContext && line.kind !== "direction").length}セリフ</small>
      </button>
      {open && children}
    </section>
  );
}

function ScriptSceneSection({ scene, open, onToggle, children }) {
  return (
    <section className={`script-scene${open ? " open" : ""}`}>
      <button
        type="button"
        className="script-scene-heading"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="script-scene-title">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <span>{scene.title}</span>
        </span>
        <small>{scene.lines.filter((line) => !line.isContext && line.kind !== "direction").length}セリフ</small>
      </button>
      {open && children}
    </section>
  );
}

function ProgressSummary({ project, compact = false }) {
  const progress = getRecordingProgress(project);
  return (
    <div className={`recording-progress-summary${compact ? " compact" : ""}`}>
      <div>
        <span>全セリフ</span>
        <strong>{progress.total}</strong>
      </div>
      <div>
        <span>収録済み</span>
        <strong>{progress.recorded}<small> / {progress.total}</small></strong>
        <i><b style={{ width: `${progress.recordedPercent}%` }} /></i>
      </div>
      <div>
        <span>確認OK</span>
        <strong>{progress.approved}<small> / {progress.total}</small></strong>
        <i><b style={{ width: `${progress.approvedPercent}%` }} /></i>
      </div>
      <div className={progress.retakes ? "needs-attention" : ""}>
        <span>リテイク</span>
        <strong>{progress.retakes}</strong>
      </div>
    </div>
  );
}

function CharacterFilters({
  project,
  selectedCharacterIds,
  setSelectedCharacterIds,
  mode,
  setMode,
  includeContext,
  setIncludeContext,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  allLabel = "全文"
}) {
  const toggleCharacter = (characterId) => {
    setSelectedCharacterIds((current) =>
      current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId]
    );
  };

  return (
    <div className="recording-filter-bar">
      <div className="recording-character-filters">
        <span className="recording-filter-label">登場人物</span>
        <div className="recording-filter-row">
          <button
            type="button"
            className={selectedCharacterIds.length === 0 ? "character-filter active" : "character-filter"}
            onClick={() => setSelectedCharacterIds([])}
          >
            <Users size={16} />{allLabel}
          </button>
          {project.characters
            .filter((character) => project.lines.some((line) => line.kind !== "direction" && line.characterId === character.id))
            .map((character) => (
              <button
                type="button"
                key={character.id}
                className={selectedCharacterIds.includes(character.id) ? "character-filter active" : "character-filter"}
                style={{ "--character-color": character.color }}
                onClick={() => toggleCharacter(character.id)}
              >
                <span className="character-dot" />{character.name}
              </button>
            ))}
        </div>
      </div>
      <div className="recording-filter-options">
        <div className="segmented-control" aria-label="セリフ抽出方法">
          <button type="button" className={mode === "assignment" ? "active" : ""} onClick={() => setMode("assignment")}>
            担当セリフ
          </button>
          <button
            type="button"
            className={mode === "dialogue" ? "active" : ""}
            onClick={() => setMode("dialogue")}
            disabled={selectedCharacterIds.length < 2}
          >
            掛け合い
          </button>
        </div>
        <label className="recording-context-toggle">
          <input type="checkbox" checked={includeContext} onChange={(event) => setIncludeContext(event.target.checked)} />
          前後のセリフも表示
        </label>
        <label className="recording-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="セリフ・シーンを検索" />
        </label>
        <label className="recording-status-filter">
          <ListFilter size={16} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {BOARD_STATUS_FILTERS.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
      {mode === "dialogue" && selectedCharacterIds.length >= 2 && (
        <p className="recording-filter-note">
          選択した人物がそろって登場するシーンから、二人の掛け合いを抽出しています。
        </p>
      )}
    </div>
  );
}

function RecordingPlayer({ url, fileName = "" }) {
  const playbackUrl = getPlaybackUrl(url);
  if (!playbackUrl) return <span className="recording-empty-audio"><FileAudio size={16} />録音未提出</span>;
  return (
    <div className="recording-player">
      <audio controls preload="none" src={playbackUrl} />
      <a href={url} target="_blank" rel="noreferrer" title="録音元を開く">
        <ExternalLink size={15} />
        <span>{fileName || "録音元を開く"}</span>
      </a>
    </div>
  );
}

function StatusBadge({ status, type }) {
  return <span className={`recording-status-badge ${type} status-${status}`}>{status}</span>;
}

function AdminLineCard({ project, line, patchLine, removeLine, canEditScript }) {
  const character = project.characters.find((item) => item.id === line.characterId);
  const isDirection = line.kind === "direction";
  const [detailsOpen, setDetailsOpen] = useState(false);
  const characterColor = character?.color || "#5f6d7a";

  return (
    <article
      className={`script-line-card${line.isContext ? " context-line" : ""}${isDirection ? " stage-direction-line" : ""}`}
      style={{
        "--character-color": characterColor,
        "--character-background": makeCharacterTint(characterColor, line.isContext ? 0.055 : 0.11)
      }}
    >
      <div className="script-line-main">
        <div className="script-line-sequence">
          <span>{String(line.order).padStart(3, "0")}</span>
          <b>
            <i />{isDirection ? "ト書き" : character?.name || "話者未設定"}
          </b>
        </div>
        <div className="script-line-copy">
          <p><RubyText text={line.text || "セリフ未入力"} /></p>
          {line.direction && <small><MessageSquareText size={14} />{line.direction}</small>}
          {line.fileName && <code>{line.fileName}</code>}
        </div>
        {!isDirection && (
          <div className="script-line-states">
            <StatusBadge status={line.actorStatus} type="actor" />
            <StatusBadge status={line.reviewStatus} type="review" />
          </div>
        )}
      </div>
      {!line.isContext && !isDirection && (
        <>
          <div className={`line-operation-row${line.recordingUrl ? " has-recording" : ""}`}>
            <RecordingPlayer url={line.recordingUrl} fileName={line.recordingFileName} />
            <div className="line-status-selects">
              <label>
                <span>収録</span>
                <select value={line.actorStatus} onChange={(event) => patchLine(line.id, { actorStatus: event.target.value })}>
                  {ACTOR_RECORDING_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>
                <span>確認</span>
                <select value={line.reviewStatus} onChange={(event) => patchLine(line.id, { reviewStatus: event.target.value })}>
                  {DIRECTOR_REVIEW_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
            </div>
          </div>
          {(line.actorNote || line.directorNote) && (
            <div className="line-notes">
              {line.actorNote && <p><UserRound size={14} /><b>声優メモ</b><span>{line.actorNote}</span></p>}
              {line.directorNote && <p className="director-note"><Eye size={14} /><b>確認メモ</b><span>{line.directorNote}</span></p>}
            </div>
          )}
          <div className="line-card-footer">
            <span><Clock3 size={14} />{formatUpdatedAt(line.updatedAt)}</span>
            <div>
              <button type="button" className="secondary compact" onClick={() => setDetailsOpen((current) => !current)}>
                {detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{canEditScript ? "詳細編集" : "録音・確認メモ"}
              </button>
            </div>
          </div>
          {detailsOpen && (
            <div className="line-detail-editor">
              {canEditScript && <>
                <Field label="章名" value={line.chapterTitle} onChange={(value) => patchLine(line.id, { chapterTitle: value })} />
                <Field label="シーン名" value={line.sceneTitle} onChange={(value) => patchLine(line.id, { sceneTitle: value })} />
                <label>
                  <span>話者</span>
                  <select value={line.characterId} onChange={(event) => patchLine(line.id, { characterId: event.target.value })}>
                    {project.characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <TextArea label="セリフ" value={line.text} onChange={(value) => patchLine(line.id, { text: value })} />
                <RubyEditor text={line.text} onChange={(value) => patchLine(line.id, { text: value })} />
                <TextArea label="演技指示" value={line.direction} onChange={(value) => patchLine(line.id, { direction: value })} />
                <Field label="録音ファイル名" value={line.fileName} onChange={(value) => patchLine(line.id, { fileName: value })} />
              </>}
              <Field label="録音URL" value={line.recordingUrl} onChange={(value) => patchLine(line.id, { recordingUrl: value })} />
              <TextArea label="声優さんのメモ" value={line.actorNote} onChange={(value) => patchLine(line.id, { actorNote: value })} />
              <TextArea label="確認・リテイクメモ" value={line.directorNote} onChange={(value) => patchLine(line.id, { directorNote: value })} />
              {canEditScript && (
                <button type="button" className="danger compact" onClick={() => removeLine(line.id)}>
                  <Trash2 size={15} />このセリフを削除
                </button>
              )}
            </div>
          )}
        </>
      )}
      {!line.isContext && isDirection && (
        <>
          <div className="line-card-footer stage-direction-footer">
            <span>録音対象外</span>
            <div>
              {canEditScript && (
                <button type="button" className="secondary compact" onClick={() => setDetailsOpen((current) => !current)}>
                  {detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}詳細編集
                </button>
              )}
            </div>
          </div>
          {detailsOpen && (
            <div className="line-detail-editor">
              <Field label="章名" value={line.chapterTitle} onChange={(value) => patchLine(line.id, { chapterTitle: value })} />
              <Field label="シーン名" value={line.sceneTitle} onChange={(value) => patchLine(line.id, { sceneTitle: value })} />
              <TextArea label="ト書き" value={line.text} onChange={(value) => patchLine(line.id, { text: value })} />
              <RubyEditor text={line.text} onChange={(value) => patchLine(line.id, { text: value })} />
              <button type="button" className="danger compact" onClick={() => removeLine(line.id)}>
                <Trash2 size={15} />このト書きを削除
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function RecordingBoardView({ project, patchLine, removeLine, canEditScript }) {
  const allChapters = useMemo(() => getChapterGroups(project.lines), [project.lines]);
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState([]);
  const [mode, setMode] = useState("assignment");
  const [includeContext, setIncludeContext] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("すべて");
  const [openSceneIds, setOpenSceneIds] = useState(() => new Set(project.lines[0]?.sceneId ? [project.lines[0].sceneId] : []));
  const [openChapterIds, setOpenChapterIds] = useState(() => new Set(project.lines[0]?.chapterId ? [project.lines[0].chapterId] : []));
  const scopedProject = useMemo(() => ({
    ...project,
    lines: project.lines.filter((line) => {
      if (selectedSceneId) return line.sceneId === selectedSceneId;
      if (selectedChapterId) return line.chapterId === selectedChapterId;
      return true;
    })
  }), [project, selectedChapterId, selectedSceneId]);
  const chapterSignature = allChapters.map((chapter) => `${chapter.chapterId}:${chapter.scenes.map((scene) => scene.sceneId).join(",")}`).join("|");
  const characterScopeSignature = scopedProject.lines
    .map((line) => `${line.id}:${line.kind}:${line.characterId}`)
    .join("|");

  useEffect(() => {
    if (selectedChapterId && !allChapters.some((chapter) => chapter.chapterId === selectedChapterId)) {
      setSelectedChapterId("");
      setSelectedSceneId("");
      return;
    }
    const selectedChapter = allChapters.find((chapter) => chapter.chapterId === selectedChapterId);
    if (selectedSceneId && !selectedChapter?.scenes.some((scene) => scene.sceneId === selectedSceneId)) setSelectedSceneId("");
  }, [selectedChapterId, selectedSceneId, chapterSignature]);

  useEffect(() => {
    const available = new Set(scopedProject.lines.filter((line) => line.kind !== "direction").map((line) => line.characterId));
    setSelectedCharacterIds((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [selectedChapterId, selectedSceneId, characterScopeSignature]);

  useEffect(() => {
    setOpenSceneIds(new Set(
      selectedSceneId
        ? [selectedSceneId]
        : allChapters.flatMap((chapter) => chapter.scenes.map((scene) => scene.sceneId))
    ));
    setOpenChapterIds(new Set(selectedChapterId ? [selectedChapterId] : allChapters.map((chapter) => chapter.chapterId)));
  }, [project.id, selectedChapterId, selectedSceneId, chapterSignature]);

  const visibleLines = useMemo(
    () => getFilteredRecordingLines({
      project: scopedProject,
      selectedCharacterIds,
      mode,
      includeContext,
      query,
      statusFilter
    }),
    [scopedProject, selectedCharacterIds, mode, includeContext, query, statusFilter]
  );
  const chapters = getChapterGroups(visibleLines);

  const toggleScene = (sceneId) => {
    setOpenSceneIds((current) => {
      const next = new Set(current);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };
  const toggleChapter = (chapterId) => {
    setOpenChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };
  const selectChapter = (chapterId) => {
    setSelectedChapterId(chapterId);
    setSelectedSceneId("");
    setSelectedCharacterIds([]);
  };
  const selectScene = (sceneId) => {
    setSelectedSceneId(sceneId);
    setSelectedCharacterIds([]);
  };

  return (
    <>
      <ChapterSelector
        chapters={allChapters}
        selectedChapterId={selectedChapterId}
        selectedSceneId={selectedSceneId}
        setSelectedChapterId={selectChapter}
        setSelectedSceneId={selectScene}
      />
      <ProgressSummary project={scopedProject} />
      <CharacterFilters
        project={scopedProject}
        selectedCharacterIds={selectedCharacterIds}
        setSelectedCharacterIds={setSelectedCharacterIds}
        mode={mode}
        setMode={setMode}
        includeContext={includeContext}
        setIncludeContext={setIncludeContext}
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        allLabel={selectedSceneId ? "シーン全文" : selectedChapterId ? "章の全文" : "全文"}
      />
      <div className="script-chapters">
        {chapters.map((chapter) => (
          <ScriptChapterSection key={chapter.chapterId} chapter={chapter} open={openChapterIds.has(chapter.chapterId)} onToggle={() => toggleChapter(chapter.chapterId)}>
            <div className="script-scenes">
              {chapter.scenes.map((scene) => (
                <ScriptSceneSection key={scene.sceneId} scene={scene} open={openSceneIds.has(scene.sceneId)} onToggle={() => toggleScene(scene.sceneId)}>
                  <div className="script-line-list">
                    {scene.lines.map((line) => (
                      <AdminLineCard key={line.id} project={project} line={line} patchLine={patchLine} removeLine={removeLine} canEditScript={canEditScript} />
                    ))}
                  </div>
                </ScriptSceneSection>
              ))}
            </div>
          </ScriptChapterSection>
        ))}
        {!visibleLines.length && (
          <div className="recording-empty-state">
            <Search size={28} />
            <b>条件に合うセリフがありません</b>
            <span>登場人物や進捗の絞り込みを変更してください。</span>
          </div>
        )}
      </div>
    </>
  );
}

function ScriptEditor({
  project,
  patchProject,
  addLine,
  patchLine,
  removeLine,
  importScriptRows,
  saveScriptSnapshot,
  restoreSnapshot
}) {
  const [importMode, setImportMode] = useState("docs");
  const [docsImportText, setDocsImportText] = useState("");
  const [tableImportText, setTableImportText] = useState("");
  const [importAction, setImportAction] = useState("merge");
  const [importMessage, setImportMessage] = useState("");
  const [importRowEdits, setImportRowEdits] = useState({});
  const [excludedImportRowKeys, setExcludedImportRowKeys] = useState([]);
  const [showImportReview, setShowImportReview] = useState(false);
  const [showManualComposer, setShowManualComposer] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [showAllLines, setShowAllLines] = useState(false);
  const [rubyLineId, setRubyLineId] = useState("");
  const [manualLine, setManualLine] = useState(() => {
    const lastLine = project.lines.at(-1);
    return {
      chapterTitle: lastLine?.chapterTitle || "第一章",
      sceneTitle: lastLine?.sceneTitle || "シーン1",
      sourceKind: "dialogue",
      speaker: project.characters[0]?.name || "",
      text: "",
      direction: ""
    };
  });

  useEffect(() => {
    const lastLine = project.lines.at(-1);
    setManualLine({
      chapterTitle: lastLine?.chapterTitle || "第一章",
      sceneTitle: lastLine?.sceneTitle || "シーン1",
      sourceKind: "dialogue",
      speaker: project.characters[0]?.name || "",
      text: "",
      direction: ""
    });
    setManualMessage("");
  }, [project.id]);

  const importText = importMode === "docs" ? docsImportText : tableImportText;
  const parsedImportRows = useMemo(
    () => importMode === "docs"
      ? parseGoogleDocsScript(importText, project.characters.map((character) => character.name))
      : parseScriptTable(importText, parseCsv),
    [importMode, importText, project.characters]
  );
  const importRowsWithKeys = useMemo(
    () => parsedImportRows.map((row, index) => ({ ...row, reviewKey: `${row.sourceOrder ?? index}-${index}` })),
    [parsedImportRows]
  );
  const reviewedImportRows = useMemo(() => {
    const excluded = new Set(excludedImportRowKeys);
    return importRowsWithKeys
      .filter((row) => !excluded.has(row.reviewKey))
      .map((row) => ({ ...row, ...(importRowEdits[row.reviewKey] || {}) }));
  }, [excludedImportRowKeys, importRowEdits, importRowsWithKeys]);
  const importStats = useMemo(() => {
    const chapters = new Set(reviewedImportRows.map((row) => getScriptChapterKey(row.chapterTitle)));
    const scenes = new Set(reviewedImportRows.map((row) => `${getScriptChapterKey(row.chapterTitle)}\u0000${getScriptSceneKey(row.sceneTitle)}`));
    const speakers = new Set(reviewedImportRows.map((row) => row.speaker).filter((speaker) => speaker && speaker !== "ト書き"));
    return {
      chapters: chapters.size,
      scenes: scenes.size,
      speakers: [...speakers],
      directions: reviewedImportRows.filter((row) => row.sourceKind === "direction" || row.speaker === "ト書き").length,
      dialogue: reviewedImportRows.filter((row) => row.sourceKind !== "direction" && row.speaker !== "ト書き").length
    };
  }, [reviewedImportRows]);
  const importPlan = useMemo(
    () => getScriptImportPlan(project, reviewedImportRows),
    [project, reviewedImportRows]
  );
  const chapterOptions = useMemo(
    () => [...new Set(project.lines.map((line) => line.chapterTitle).filter(Boolean))],
    [project.lines]
  );
  const sceneOptions = useMemo(
    () => [...new Set(project.lines
      .filter((line) => getScriptChapterKey(line.chapterTitle) === getScriptChapterKey(manualLine.chapterTitle))
      .map((line) => line.sceneTitle)
      .filter(Boolean))],
    [manualLine.chapterTitle, project.lines]
  );

  const resetImportReview = () => {
    setImportRowEdits({});
    setExcludedImportRowKeys([]);
    setShowImportReview(false);
  };

  const patchImportRow = (reviewKey, patch) => {
    setImportRowEdits((current) => ({
      ...current,
      [reviewKey]: { ...(current[reviewKey] || {}), ...patch }
    }));
    setImportMessage("");
  };

  const setImportRowKind = (row, sourceKind) => {
    patchImportRow(row.reviewKey, sourceKind === "direction"
      ? { sourceKind, speaker: "ト書き" }
      : {
          sourceKind,
          speaker: row.speaker && row.speaker !== "ト書き" && !isScriptStructureLabel(row.speaker)
            ? row.speaker
            : project.characters[0]?.name || ""
        });
  };

  const applyImport = () => {
    if (!reviewedImportRows.length) {
      setImportMessage("読み込める文章がありません。貼り付けた内容を確認してください。");
      return;
    }
    const invalidRow = reviewedImportRows.find((row) =>
      !String(row.chapterTitle || "").trim() ||
      !String(row.sceneTitle || "").trim() ||
      !String(row.text || "").trim() ||
      (row.sourceKind !== "direction" && (!String(row.speaker || "").trim() || isScriptStructureLabel(row.speaker)))
    );
    if (invalidRow) {
      setShowImportReview(true);
      setImportMessage("章・シーン・本文と、セリフ行の登場人物を確認してください。未入力や見出し名の話者は反映できません。");
      return;
    }
    if (importAction === "merge" && project.lines.length && !confirm(
      `台本を差分更新しますか？\n\n進捗を引き継ぐ行: ${importPlan.retained}件\n新規・本文変更: ${importPlan.added}件\n削除: ${importPlan.removed}件\n\n同じ話者・本文の行は録音・確認状況を引き継ぎ、更新前の台本は保存版へ残します。`
    )) return;
    if (importAction === "replace" && project.lines.length && !confirm(
      `台本を完全に入れ替えますか？\n\n現在の${project.lines.length}件のセリフ・ト書きと録音・確認状況は、新しい台本へ引き継ぎません。\n\n現在の台本は先に保存版へ残すため、あとから復元できます。登場人物の画像や設定、配役は残ります。`
    )) return;
    importScriptRows(reviewedImportRows, { mode: importAction, sourceText: importText });
    if (importMode === "docs") setDocsImportText("");
    else setTableImportText("");
    resetImportReview();
    setImportMessage(
      importAction === "merge"
        ? `${importStats.dialogue}セリフと${importStats.directions}件のト書きを反映し、${importPlan.retained}件の録音・確認状況を引き継ぎました。`
        : importAction === "replace"
          ? `${importStats.dialogue}セリフと${importStats.directions}件のト書きへ完全に入れ替えました。入れ替え前の台本は保存版から復元できます。`
        : `${importStats.dialogue}セリフと${importStats.directions}件のト書きを台本へ追加しました。`
    );
  };

  const addManualScriptLine = () => {
    const chapterTitle = String(manualLine.chapterTitle || "").trim();
    const sceneTitle = String(manualLine.sceneTitle || "").trim();
    const speaker = String(manualLine.speaker || "").trim();
    const text = String(manualLine.text || "").trim();
    if (!chapterTitle || !sceneTitle || !text) {
      setManualMessage("章・シーン・本文を入力してください。");
      return;
    }
    if (manualLine.sourceKind !== "direction" && (!speaker || isScriptStructureLabel(speaker))) {
      setManualMessage("セリフの登場人物名を入力してください。章名やSEはト書きとして追加できます。");
      return;
    }
    addLine({ ...manualLine, chapterTitle, sceneTitle, speaker, text });
    setManualLine((current) => ({ ...current, text: "", direction: "" }));
    setManualMessage(`${chapterTitle} / ${sceneTitle}へ追加しました。`);
  };

  return (
    <div className="recording-management-stack">
      <article className="panel recording-project-settings">
        <div className="record-head">
          <div>
            <h2>プロジェクト情報</h2>
            <p className="muted">声優さんの共有画面にも表示されます。</p>
          </div>
        </div>
        <div className="form-grid">
          <Field label="作品・台本名" value={project.title} onChange={(value) => patchProject({ title: value })} />
          <Field label="台本バージョン" value={project.scriptVersion} onChange={(value) => patchProject({ scriptVersion: value })} />
          <Field label="進行状態" value={project.status} onChange={(value) => patchProject({ status: value })} />
          <TextArea label="共有メモ" value={project.description} onChange={(value) => patchProject({ description: value })} />
        </div>
      </article>

      <article className="panel script-import-panel">
        <div className="record-head">
          <div>
            <h2>台本をまとめて取り込む</h2>
            <p className="muted">原稿を貼り付け、判定結果を確認してから台本へ反映します。</p>
          </div>
        </div>
        <div className="script-import-mode segmented-control" aria-label="台本の取り込み元">
          <button type="button" className={importMode === "docs" ? "active" : ""} onClick={() => { setImportMode("docs"); setImportMessage(""); resetImportReview(); }}>
            <FileText size={15} />Google Docs
          </button>
          <button type="button" className={importMode === "table" ? "active" : ""} onClick={() => { setImportMode("table"); setImportMessage(""); resetImportReview(); }}>
            <Table2 size={15} />表・CSV
          </button>
        </div>
        {importMode === "table" && (
          <div className="script-import-example">
            <code>章</code><code>シーン</code><code>話者</code><code>セリフ</code><code>演技指示</code><code>ファイル名</code>
          </div>
        )}
        <p className="ruby-import-hint">
          <BookOpenText size={15} />
          ルビを含める場合は、原稿内へ <code>｜覚悟《かくご》</code> と入力します。
        </p>
        <textarea
          className="script-import-textarea"
          value={importText}
          onChange={(event) => {
            if (importMode === "docs") setDocsImportText(event.target.value);
            else setTableImportText(event.target.value);
            setImportRowEdits({});
            setExcludedImportRowKeys([]);
            setImportMessage("");
          }}
          aria-label={importMode === "docs" ? "Googleドキュメントの脚本を貼り付け" : "表またはCSVの台本を貼り付け"}
          placeholder={importMode === "docs"
            ? "第一章\nシーン1 雨上がり\nアマモリ「本当に行くつもりなの？」\nヴェル\n「うん。もう｜決めた《きめた》んだ。」\n（静かな決意で）\n\n第二章\nシーン1 出発\nヴェル「行ってくるね。」"
            : "章\tシーン\t話者\tセリフ\t演技指示\tファイル名\n第一章\tScene 01\tヴェル\tうん。もう決めたんだ。\t静かな決意で\tC01_S01_003_VEL"}
        />
        {importText.trim() && (
          <div className={`document-script-preview${parsedImportRows.length ? "" : " empty"}`}>
            <div className="document-preview-heading">
              <div>
                <strong>取り込みプレビュー</strong>
                <span>{importStats.dialogue}セリフ / {importStats.directions}件のト書き / {importStats.chapters}章 / {importStats.scenes}シーン</span>
              </div>
              <div className="document-speaker-list">
                {importStats.speakers.slice(0, 8).map((speaker) => <span key={speaker}>{speaker}</span>)}
              </div>
            </div>
            {importAction === "merge" && project.lines.length > 0 && reviewedImportRows.length > 0 && (
              <div className="script-import-diff" aria-label="台本更新の差分">
                <span className="retained"><b>{importPlan.retained}</b> 進捗を保持</span>
                <span><b>{importPlan.added}</b> 新規・本文変更</span>
                <span className="removed"><b>{importPlan.removed}</b> 削除</span>
              </div>
            )}
            <div className="script-import-review-toolbar">
              <button type="button" className="secondary compact" onClick={() => setShowImportReview((current) => !current)} disabled={!importRowsWithKeys.length}>
                {showImportReview ? <ChevronUp size={15} /> : <FileText size={15} />}
                {showImportReview ? "判定結果を閉じる" : `判定結果を編集（${reviewedImportRows.length}件）`}
              </button>
              {excludedImportRowKeys.length > 0 && (
                <button type="button" className="secondary compact" onClick={() => setExcludedImportRowKeys([])}>
                  <RotateCcw size={15} />除外した{excludedImportRowKeys.length}件を戻す
                </button>
              )}
              <span>章・シーン・種類・登場人物・本文を、反映前に修正できます。</span>
            </div>
            {showImportReview ? (
              <div className="script-import-review-list">
                <div className="script-import-review-labels" aria-hidden="true">
                  <span>章 / シーン</span><span>種類 / 登場人物</span><span>本文 / 演技指示</span>
                </div>
                {reviewedImportRows.map((row, index) => (
                  <div className={`script-import-review-row${row.sourceKind === "direction" || row.speaker === "ト書き" ? " direction" : ""}`} key={row.reviewKey}>
                    <span className="script-import-review-order">{String(index + 1).padStart(3, "0")}</span>
                    <div className="script-import-review-location">
                      <input value={row.chapterTitle} onChange={(event) => patchImportRow(row.reviewKey, { chapterTitle: event.target.value })} aria-label={`${index + 1}行目の章`} placeholder="章" />
                      <input value={row.sceneTitle} onChange={(event) => patchImportRow(row.reviewKey, { sceneTitle: event.target.value })} aria-label={`${index + 1}行目のシーン`} placeholder="シーン" />
                    </div>
                    <div className="script-import-review-speaker">
                      <select value={row.sourceKind === "direction" || row.speaker === "ト書き" ? "direction" : "dialogue"} onChange={(event) => setImportRowKind(row, event.target.value)} aria-label={`${index + 1}行目の種類`}>
                        <option value="dialogue">セリフ</option>
                        <option value="direction">ト書き</option>
                      </select>
                      {row.sourceKind === "direction" || row.speaker === "ト書き" ? (
                        <span>登場人物なし</span>
                      ) : (
                        <input list={`import-character-options-${project.id}`} value={row.speaker} onChange={(event) => patchImportRow(row.reviewKey, { speaker: event.target.value })} aria-label={`${index + 1}行目の登場人物`} placeholder="登場人物" />
                      )}
                    </div>
                    <div className="script-import-review-copy">
                      <textarea value={row.text} onChange={(event) => patchImportRow(row.reviewKey, { text: event.target.value })} aria-label={`${index + 1}行目の本文`} placeholder="本文" />
                      <input value={row.direction || ""} onChange={(event) => patchImportRow(row.reviewKey, { direction: event.target.value })} aria-label={`${index + 1}行目の演技指示`} placeholder="演技指示（任意）" />
                    </div>
                    <button type="button" className="icon-button danger-icon" title="この行を取り込み対象から外す" onClick={() => setExcludedImportRowKeys((current) => [...current, row.reviewKey])}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {!reviewedImportRows.length && <p className="document-preview-more">すべて除外されています。必要な行を戻すか、原文を修正してください。</p>}
              </div>
            ) : (
              <div className="document-preview-list">
                {reviewedImportRows.slice(0, 8).map((row) => (
                  <div className={row.sourceKind === "direction" || row.speaker === "ト書き" ? "direction" : ""} key={row.reviewKey}>
                    <span>{row.chapterTitle} / {row.sceneTitle}</span>
                    <b>{row.speaker || "話者未設定"}</b>
                    <p><RubyText text={row.text} /></p>
                    {row.direction && <small>{row.direction}</small>}
                  </div>
                ))}
                {reviewedImportRows.length > 8 && <p className="document-preview-more">ほか {reviewedImportRows.length - 8}件</p>}
                {!reviewedImportRows.length && <p className="document-preview-more">シーン見出しだけでなく、セリフや本文も貼り付けてください。</p>}
              </div>
            )}
            <datalist id={`import-character-options-${project.id}`}>
              {project.characters.map((character) => <option key={character.id} value={character.name} />)}
            </datalist>
          </div>
        )}
        <div className="script-import-action segmented-control" aria-label="台本への反映方法">
          <button type="button" className={importAction === "merge" ? "active" : ""} onClick={() => setImportAction("merge")}>差分更新</button>
          <button type="button" className={importAction === "replace" ? "active danger-mode" : ""} onClick={() => setImportAction("replace")}>完全入れ替え</button>
          <button type="button" className={importAction === "append" ? "active" : ""} onClick={() => setImportAction("append")}>末尾へ追加</button>
        </div>
        {importAction === "merge" && (
          <p className="script-import-mode-note"><RefreshCw size={16} />一致するセリフの録音・確認状況を残し、変更箇所だけを反映します。</p>
        )}
        {importAction === "replace" && (
          <p className="script-import-mode-note warning"><History size={16} />現在の進捗を引き継がず、台本全体を新しくします。実行前の状態は自動で保存版へ残ります。</p>
        )}
        <div className="button-row">
          <button type="button" className="primary" onClick={applyImport} disabled={!reviewedImportRows.length}>
            <Upload size={16} />{reviewedImportRows.length ? `${reviewedImportRows.length}件を台本へ反映` : "台本へ反映"}
          </button>
        </div>
        {importMessage && <p className="hint-text">{importMessage}</p>}
      </article>

      <article className="panel manual-script-panel">
        <div className="record-head">
          <div>
            <h2>章・シーン・本文を手動で追加</h2>
            <p className="muted">既存の名前を選ぶほか、新しい章名やシーン名、登場人物名をそのまま入力できます。</p>
          </div>
          <button type="button" className="secondary" onClick={() => setShowManualComposer((current) => !current)}>
            {showManualComposer ? <ChevronUp size={16} /> : <FilePlus2 size={16} />}
            {showManualComposer ? "閉じる" : "手動入力"}
          </button>
        </div>
        {showManualComposer && (
          <div className="manual-script-composer">
            <div className="manual-script-fields">
              <label>
                <span>章</span>
                <input list={`manual-chapter-options-${project.id}`} value={manualLine.chapterTitle} onChange={(event) => setManualLine((current) => ({ ...current, chapterTitle: event.target.value }))} placeholder="第一章" />
              </label>
              <label>
                <span>シーン</span>
                <input list={`manual-scene-options-${project.id}`} value={manualLine.sceneTitle} onChange={(event) => setManualLine((current) => ({ ...current, sceneTitle: event.target.value }))} placeholder="シーン1" />
              </label>
              <label>
                <span>種類</span>
                <select value={manualLine.sourceKind} onChange={(event) => setManualLine((current) => ({ ...current, sourceKind: event.target.value }))}>
                  <option value="dialogue">セリフ</option>
                  <option value="direction">ト書き</option>
                </select>
              </label>
              {manualLine.sourceKind === "dialogue" && (
                <label>
                  <span>登場人物</span>
                  <input list={`manual-character-options-${project.id}`} value={manualLine.speaker} onChange={(event) => setManualLine((current) => ({ ...current, speaker: event.target.value }))} placeholder="ヴェル" />
                </label>
              )}
            </div>
            <label className="manual-script-copy">
              <span>{manualLine.sourceKind === "direction" ? "ト書き本文" : "セリフ本文"}</span>
              <textarea value={manualLine.text} onChange={(event) => setManualLine((current) => ({ ...current, text: event.target.value }))} placeholder="本文を入力" />
            </label>
            {manualLine.sourceKind === "dialogue" && (
              <label className="manual-script-copy">
                <span>演技指示</span>
                <input value={manualLine.direction} onChange={(event) => setManualLine((current) => ({ ...current, direction: event.target.value }))} placeholder="任意" />
              </label>
            )}
            <div className="manual-script-submit">
              <span>{manualMessage}</span>
              <button type="button" className="primary" onClick={addManualScriptLine} disabled={!manualLine.text.trim()}>
                <Plus size={16} />台本へ追加
              </button>
            </div>
            <datalist id={`manual-chapter-options-${project.id}`}>{chapterOptions.map((chapter) => <option key={chapter} value={chapter} />)}</datalist>
            <datalist id={`manual-scene-options-${project.id}`}>{sceneOptions.map((scene) => <option key={scene} value={scene} />)}</datalist>
            <datalist id={`manual-character-options-${project.id}`}>{project.characters.map((character) => <option key={character.id} value={character.name} />)}</datalist>
          </div>
        )}
      </article>

      <article className="panel script-history-panel">
        <div className="record-head">
          <div>
            <h2>原文と保存版</h2>
            <p className="muted">削除や入れ替えの前の台本を残し、必要なときに丸ごと復元できます。</p>
          </div>
          <button type="button" className="secondary" onClick={saveScriptSnapshot} disabled={!project.lines.length}>
            <Save size={16} />現在版を保存
          </button>
        </div>
        <details className="script-source-details">
          <summary><FileText size={16} />最後に取り込んだ原文</summary>
          {project.sourceScriptText ? (
            <textarea className="script-source-preview" value={project.sourceScriptText} readOnly aria-label="最後に取り込んだ台本原文" />
          ) : (
            <p className="muted">次回の台本取り込みから、貼り付けた原文もここへ保存されます。</p>
          )}
        </details>
        <div className="script-snapshot-list">
          {(project.scriptSnapshots || []).map((snapshot) => (
            <div className="script-snapshot-row" key={snapshot.id}>
              <History size={18} />
              <div>
                <b>{snapshot.label}</b>
                <span>{snapshot.reason}</span>
              </div>
              <span>{snapshot.lines.length}件 / {new Date(snapshot.createdAt).toLocaleString("ja-JP")}</span>
              <button type="button" className="secondary compact" onClick={() => restoreSnapshot(snapshot.id)}>
                <RotateCcw size={15} />この版を復元
              </button>
            </div>
          ))}
          {!project.scriptSnapshots?.length && (
            <p className="script-history-empty"><History size={18} />保存版はまだありません。削除・差分更新・完全入れ替えの前には自動で作成されます。</p>
          )}
        </div>
      </article>

      <article className="panel">
        <div className="record-head">
          <div>
            <h2>セリフ一覧</h2>
            <p className="muted">
              {project.lines.filter((line) => line.kind !== "direction").length}セリフ
              {project.lines.some((line) => line.kind === "direction") && `・${project.lines.filter((line) => line.kind === "direction").length}件のト書き`}。
              詳細な進捗操作は「進行ボード」で行えます。
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => setShowAllLines((current) => !current)}>
            {showAllLines ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showAllLines ? "閉じる" : "編集する"}
          </button>
        </div>
        {showAllLines && (
          <div className="script-editor-list">
            {project.lines.map((line) => (
              <div className="script-editor-row" key={line.id}>
                <span>{String(line.order).padStart(3, "0")}</span>
                <div className="script-editor-speaker">
                  <select value={line.kind} onChange={(event) => patchLine(line.id, { kind: event.target.value })} aria-label={`${line.order}番の種類`}>
                    <option value="dialogue">セリフ</option>
                    <option value="direction">ト書き</option>
                  </select>
                  {line.kind !== "direction" && (
                    <select value={line.characterId} onChange={(event) => patchLine(line.id, { characterId: event.target.value })}>
                      {project.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="script-editor-location">
                  <input value={line.chapterTitle} onChange={(event) => patchLine(line.id, { chapterTitle: event.target.value })} aria-label="章" />
                  <input value={line.sceneTitle} onChange={(event) => patchLine(line.id, { sceneTitle: event.target.value })} aria-label="シーン" />
                </div>
                <textarea value={line.text} onChange={(event) => patchLine(line.id, { text: event.target.value })} aria-label={line.kind === "direction" ? "ト書き" : "セリフ"} />
                <button
                  type="button"
                  className={rubyLineId === line.id ? "icon-button active" : "icon-button"}
                  title="ルビを設定"
                  aria-label={`${line.kind === "direction" ? "ト書き" : getCharacterName(project, line.characterId)} ${line.order}番のルビを設定`}
                  onClick={() => setRubyLineId((current) => current === line.id ? "" : line.id)}
                >
                  <BookOpenText size={16} />
                </button>
                <button type="button" className="icon-button danger-icon" title="削除" onClick={() => removeLine(line.id)}><Trash2 size={16} /></button>
                {rubyLineId === line.id && (
                  <RubyEditor
                    compact
                    text={line.text}
                    onChange={(value) => patchLine(line.id, { text: value })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

function CastAndSharing({
  project,
  canEditScript,
  settings,
  patchProject,
  addCharacter,
  patchCharacter,
  removeCharacter,
  addCastMember,
  patchCastMember,
  removeCastMember,
  publishProject,
  pullProject,
  syncState,
  setSyncMessage,
  setActive
}) {
  const endpointUrl = String(settings.recordingEndpointUrl || settings.responseEndpointUrl || "").trim();
  const driveFolderUrl = String(settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl || "").trim();
  const token = String(settings.responseSyncToken || "").trim();
  const ready = Boolean(endpointUrl && token);

  return (
    <div className="recording-management-stack">
      <article className={`panel recording-share-status${ready ? " ready" : ""}`}>
        <div className="sync-heading">
          {ready ? <CheckCircle2 size={22} /> : <KeyRound size={22} />}
          <div>
            <h3>{ready ? "共同収録の接続設定ができています" : "共同収録の接続設定が必要です"}</h3>
            <p>
              {ready
                ? "「共有内容を更新」を押すと、声優さん用URLから同じ台本と進捗を確認できます。"
                : "Apps Script URLと同期トークンを設定すると、声優さんとの共同進捗が有効になります。"}
            </p>
          </div>
          {!ready && <button type="button" className="secondary" onClick={() => setActive("settings")}>設定を開く</button>}
        </div>
        <div className="recording-share-actions">
          <button type="button" className="primary" onClick={publishProject} disabled={!ready || syncState.busy}>
            <Send size={16} />{project.sharedAt ? "共有内容を更新" : "共有を開始"}
          </button>
          <button type="button" className="secondary" onClick={() => pullProject()} disabled={!ready || !project.sharedAt || syncState.busy}>
            <RefreshCw size={16} />最新状況を同期
          </button>
          {project.sharedAt && <span>最終共有: {formatUpdatedAt(project.sharedAt)}</span>}
        </div>
        {syncState.message && <p className={`sync-inline-message${syncState.error ? " error" : ""}`}>{syncState.message}</p>}
      </article>

      <article className="panel">
        <div className="record-head">
          <div>
            <h2>登場人物</h2>
            <p className="muted">台本の絞り込みと配役に使います。</p>
          </div>
          {canEditScript && <button type="button" className="secondary" onClick={addCharacter}><Plus size={16} />登場人物</button>}
        </div>
        <div className="character-management-list">
          {project.characters.map((character) => (
            <div className="character-management-row" key={character.id}>
              <input
                type="color"
                value={character.color}
                onChange={(event) => patchCharacter(character.id, { color: event.target.value })}
                aria-label={`${character.name}の色`}
              />
              <input
                value={character.name}
                onChange={(event) => patchCharacter(character.id, { name: event.target.value })}
                readOnly={!canEditScript}
                aria-label={`${character.name}の名前`}
              />
              <span>{project.lines.filter((line) => line.kind !== "direction" && line.characterId === character.id).length}セリフ</span>
              {canEditScript && (
                <button
                  type="button"
                  className="icon-button danger-icon"
                  title="登場人物を削除"
                  onClick={() => removeCharacter(character.id)}
                  disabled={project.lines.some((line) => line.characterId === character.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {!project.characters.length && <p className="muted">台本を貼り付けると、話者から登場人物を自動作成します。</p>}
        </div>
      </article>

      <article className="panel">
        <div className="record-head">
          <div>
            <h2>配役と声優さん用URL</h2>
            <p className="muted">一人が複数役を担当する場合も、同じURLにまとめられます。</p>
          </div>
          <button type="button" className="primary" onClick={addCastMember}><Plus size={16} />声優さん</button>
        </div>
        <div className="cast-member-list">
          {project.castMembers.map((member) => {
            const shareUrl = makeRecordingShareUrl({
              projectId: project.id,
              memberId: member.id,
              accessKey: member.accessKey,
              endpointUrl,
              driveFolderUrl
            });
            return (
              <div className="cast-member-card" key={member.id}>
                <div className="cast-member-heading">
                  <UserRound size={20} />
                  <input
                    value={member.actorName}
                    onChange={(event) => patchCastMember(member.id, { actorName: event.target.value })}
                    aria-label="声優さん名"
                  />
                  <button type="button" className="icon-button danger-icon" title="声優さんを削除" onClick={() => removeCastMember(member.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <input
                  value={member.contact}
                  onChange={(event) => patchCastMember(member.id, { contact: event.target.value })}
                  placeholder="連絡先メモ（共有画面には表示されません）"
                />
                <div className="cast-character-options">
                  {project.characters.map((character) => (
                    <label key={character.id}>
                      <input
                        type="checkbox"
                        checked={member.characterIds.includes(character.id)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...member.characterIds, character.id]
                            : member.characterIds.filter((id) => id !== character.id);
                          patchCastMember(member.id, { characterIds: next });
                        }}
                      />
                      <i style={{ background: character.color }} />{character.name}
                    </label>
                  ))}
                </div>
                <div className="cast-share-link">
                  <input value={shareUrl} readOnly aria-label={`${member.actorName}用共有URL`} />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => copyText(shareUrl, setSyncMessage, `${member.actorName}用URLをコピーしました。`)}
                    disabled={!ready || !project.sharedAt}
                  >
                    <ClipboardCopy size={16} />URLをコピー
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="アクセスキーを再発行"
                    onClick={() => patchCastMember(member.id, { accessKey: createRecordingAccessKey() })}
                  >
                    <KeyRound size={16} />
                  </button>
                </div>
                {!project.sharedAt && <small>最初に「共有を開始」を押すとURLを渡せるようになります。</small>}
              </div>
            );
          })}
          {!project.castMembers.length && (
            <div className="recording-empty-state small">
              <UserRound size={24} />
              <b>配役を追加してください</b>
              <span>担当人物を選ぶと、その声優さん専用の共有URLを作れます。</span>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

export function RecordingStudio({
  projects,
  updateProjects,
  episodes,
  selectedEpisodeId,
  setSelectedEpisodeId,
  selectedRecordingProjectId,
  setSelectedRecordingProjectId,
  settings,
  setActive,
  canEditScript = true
}) {
  const episodeProjects = projects.filter((project) => !selectedEpisodeId || project.episodeId === selectedEpisodeId);
  const [internalSelectedProjectId, setInternalSelectedProjectId] = useState(() => episodeProjects[0]?.id || projects[0]?.id || "");
  const selectedProjectId = selectedRecordingProjectId ?? internalSelectedProjectId;
  const selectProjectId = setSelectedRecordingProjectId ?? setInternalSelectedProjectId;
  const [tab, setTab] = useState("board");
  const [syncState, setSyncState] = useState({ busy: false, message: "", error: false });

  useEffect(() => {
    if (projects.some((item) => item.id === selectedProjectId)) return;
    selectProjectId(episodeProjects[0]?.id || projects[0]?.id || "");
  }, [projects, episodeProjects, selectedProjectId, selectedEpisodeId]);

  useEffect(() => {
    if (!canEditScript && tab === "script") setTab("board");
  }, [canEditScript, tab]);

  const project = projects.find((item) => item.id === selectedProjectId) || episodeProjects[0] || projects[0];
  const endpointUrl = String(settings.recordingEndpointUrl || settings.responseEndpointUrl || "").trim();
  const driveFolderUrl = String(settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl || "").trim();
  const token = String(settings.responseSyncToken || "").trim();

  const updateProject = (projectId, updater) => {
    updateProjects((current) =>
      current.map((item) => {
        if (item.id !== projectId) return item;
        const next = typeof updater === "function" ? updater(item) : { ...item, ...updater };
        return normalizeRecordingProject({ ...next, updatedAt: new Date().toISOString() });
      })
    );
  };

  const patchProject = (patch) => {
    if (!project) return;
    updateProject(project.id, { ...project, ...patch });
  };

  const patchLine = async (lineId, patch) => {
    if (!project) return;
    const permittedPatch = canEditScript
      ? patch
      : Object.fromEntries(Object.entries(patch).filter(([key]) => COLLABORATIVE_LINE_FIELDS.has(key)));
    if (!Object.keys(permittedPatch).length) return;
    const timestampedPatch = { ...permittedPatch, updatedAt: new Date().toISOString() };
    updateProject(project.id, (current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? { ...line, ...timestampedPatch } : line)
    }));
    const shouldSync = project.sharedAt && Object.keys(permittedPatch).some((key) => COLLABORATIVE_LINE_FIELDS.has(key));
    if (!shouldSync || !endpointUrl || !token) return;
    setSyncState({ busy: true, message: "変更を共有しています…", error: false });
    try {
      const result = await postToGasEndpoint(endpointUrl, {
        action: "updateRecordingLine",
        token,
        driveFolderUrl,
        projectId: project.id,
        lineId,
        patch: timestampedPatch
      });
      setSyncState({ busy: false, message: `共有済み ${formatUpdatedAt(result.now)}`, error: false });
    } catch (error) {
      setSyncState({ busy: false, message: `共有できませんでした: ${error.message}`, error: true });
    }
  };

  const addProject = () => {
    if (!canEditScript) return;
    const episode = episodes.find((item) => item.id === selectedEpisodeId) || episodes[0];
    const next = createRecordingProject({
      episodeId: episode?.id || "",
      title: episode?.title ? `${episode.title} 収録台本` : "新しい収録プロジェクト"
    });
    updateProjects((current) => [next, ...current]);
    selectProjectId(next.id);
    setTab("script");
  };

  const removeProject = () => {
    if (!canEditScript) return;
    if (!project || !confirm(`「${project.title}」を削除しますか？`)) return;
    updateProjects((current) => current.filter((item) => item.id !== project.id));
    selectProjectId("");
  };

  const addLine = (draft = {}) => {
    if (!project || !canEditScript) return;
    updateProject(project.id, (current) => {
      const lastLine = current.lines.at(-1);
      const chapterTitle = String(draft.chapterTitle || lastLine?.chapterTitle || "第一章").trim() || "第一章";
      const sceneTitle = String(draft.sceneTitle || lastLine?.sceneTitle || "シーン1").trim() || "シーン1";
      const kind = draft.sourceKind === "direction" || draft.kind === "direction" ? "direction" : "dialogue";
      const speakerName = String(draft.speaker || "").trim();
      const characters = [...current.characters];
      const speakerKey = speakerName.normalize("NFKC").toLocaleLowerCase("ja");
      let character = kind === "dialogue"
        ? characters.find((item) => item.name.normalize("NFKC").toLocaleLowerCase("ja") === speakerKey)
        : characters[0];
      if (kind === "dialogue" && !character) {
        character = {
          id: newId("character"),
          name: speakerName || `登場人物${characters.length + 1}`,
          color: ["#168b9a", "#d65285", "#7a63ad", "#b57024", "#2f7d4a", "#5f6d7a"][characters.length % 6],
          imageUrl: "",
          profile: "",
          background: "",
          recordingFolderUrl: "",
          openChatUrl: ""
        };
        characters.push(character);
      }
      const chapterKey = getScriptChapterKey(chapterTitle);
      const existingChapterLine = current.lines.find((line) => getScriptChapterKey(line.chapterTitle) === chapterKey);
      const sceneKey = getScriptSceneKey(sceneTitle);
      const existingSceneLine = current.lines.find((line) =>
        getScriptChapterKey(line.chapterTitle) === chapterKey && getScriptSceneKey(line.sceneTitle) === sceneKey
      );
      return {
        ...current,
        characters,
        lines: [
          ...current.lines,
          {
            id: newId("line"),
            chapterId: existingChapterLine?.chapterId || newId("chapter"),
            chapterTitle,
            sceneId: existingSceneLine?.sceneId || newId("scene"),
            sceneTitle,
            order: current.lines.length + 1,
            characterId: character?.id || "",
            kind,
            text: String(draft.text || ""),
            direction: String(draft.direction || ""),
            fileName: String(draft.fileName || ""),
            actorStatus: "未収録",
            reviewStatus: "未確認",
            recordingUrl: "",
            recordingFileName: "",
            actorNote: "",
            directorNote: "",
            updatedAt: ""
          }
        ]
      };
    });
  };

  const removeLine = (lineId) => {
    if (!project || !canEditScript) return;
    const target = project.lines.find((line) => line.id === lineId);
    if (!target || !confirm(`この${target.kind === "direction" ? "ト書き" : "セリフ"}を台本から削除しますか？\n\n削除前の台本は保存版へ自動保存されるため、あとから復元できます。`)) return;
    updateProject(project.id, (current) => {
      const archived = archiveScriptVersion(current, {
        label: `${current.scriptVersion || "現在版"}（削除前）`,
        reason: `${target.chapterTitle} / ${target.sceneTitle} / ${String(target.order).padStart(3, "0")} を削除する直前`
      });
      return {
        ...archived,
        lines: archived.lines.filter((line) => line.id !== lineId).map((line, index) => ({ ...line, order: index + 1 }))
      };
    });
  };

  const importScriptRows = (rows, { mode = "merge", sourceText = "" } = {}) => {
    if (!project || !canEditScript) return;
    updateProject(project.id, (current) => {
      const replacesCurrentLines = mode === "merge" || mode === "replace";
      const working = replacesCurrentLines && current.lines.length
        ? archiveScriptVersion(current, {
          label: `${current.scriptVersion || "現在版"}（更新前）`,
          reason: mode === "replace" ? "台本を完全に入れ替える直前" : "台本を差分更新する直前"
        })
        : current;
      const characters = [...working.characters];
      const characterByName = new Map(characters.map((character) => [character.name.normalize("NFKC").toLocaleLowerCase("ja"), character]));
      const baseLines = mode === "append" ? working.lines : [];
      const locationSource = mode === "replace" ? [] : working.lines;
      const chapterByTitle = new Map(locationSource.map((line) => [getScriptChapterKey(line.chapterTitle || "第一章"), line.chapterId]));
      const sceneByScope = new Map(locationSource.map((line) => [`${getScriptChapterKey(line.chapterTitle || "第一章")}\u0000${getScriptSceneKey(line.sceneTitle)}`, line.sceneId]));
      const importPlan = mode === "merge" ? getScriptImportPlan(current, rows) : { matches: [] };
      const nextLines = rows.map((row, index) => {
        const isDirection = row.sourceKind === "direction" || row.speaker === "ト書き";
        const matchedLine = importPlan.matches[index];
        let character = isDirection
          ? characters.find((item) => item.id === matchedLine?.characterId) || characters[0]
          : characterByName.get(String(row.speaker || "").normalize("NFKC").toLocaleLowerCase("ja")) || characters.find((item) => item.id === matchedLine?.characterId);
        if (!character && !isDirection) {
          character = {
            id: newId("character"),
            name: row.speaker || "話者未設定",
            color: ["#168b9a", "#d65285", "#7a63ad", "#b57024", "#2f7d4a", "#5f6d7a"][characters.length % 6]
          };
          characters.push(character);
          characterByName.set(character.name.normalize("NFKC").toLocaleLowerCase("ja"), character);
        }
        const chapterTitle = String(row.chapterTitle || "第一章").trim() || "第一章";
        const chapterKey = getScriptChapterKey(chapterTitle);
        let chapterId = chapterByTitle.get(chapterKey);
        if (!chapterId) {
          chapterId = newId("chapter");
          chapterByTitle.set(chapterKey, chapterId);
        }
        const sceneTitle = String(row.sceneTitle || "シーン1").trim() || "シーン1";
        const sceneScopeKey = `${chapterKey}\u0000${getScriptSceneKey(sceneTitle)}`;
        let sceneId = sceneByScope.get(sceneScopeKey);
        if (!sceneId) {
          sceneId = newId("scene");
          sceneByScope.set(sceneScopeKey, sceneId);
        }
        return {
          id: matchedLine?.id || newId("line"),
          chapterId,
          chapterTitle,
          sceneId,
          sceneTitle,
          order: baseLines.length + index + 1,
          characterId: character?.id || "",
          kind: isDirection ? "direction" : "dialogue",
          text: row.text,
          direction: row.direction,
          fileName: row.fileName,
          actorStatus: matchedLine?.actorStatus || "未収録",
          reviewStatus: matchedLine?.reviewStatus || "未確認",
          recordingUrl: matchedLine?.recordingUrl || "",
          recordingFileName: matchedLine?.recordingFileName || "",
          actorNote: matchedLine?.actorNote || "",
          directorNote: matchedLine?.directorNote || "",
          updatedAt: matchedLine?.updatedAt || ""
        };
      });
      const nextSourceText = mode === "append"
        ? [working.sourceScriptText, sourceText].filter((value) => String(value || "").trim()).join("\n\n")
        : sourceText;
      return { ...working, characters, lines: [...baseLines, ...nextLines], sourceScriptText: nextSourceText };
    });
  };

  const saveScriptSnapshot = () => {
    if (!project || !canEditScript || !project.lines.length) return;
    updateProject(project.id, (current) => archiveScriptVersion(current, {
      label: current.scriptVersion || "現在版",
      reason: "手動で保存"
    }));
  };

  const restoreSnapshot = (snapshotId) => {
    if (!project || !canEditScript) return;
    const snapshot = project.scriptSnapshots?.find((item) => item.id === snapshotId);
    if (!snapshot || !confirm(`「${snapshot.label}」を復元しますか？\n\n現在の台本も復元前の保存版として残ります。`)) return;
    updateProject(project.id, (current) => restoreScriptSnapshot(current, snapshotId));
  };

  const addCharacter = () => {
    if (!project || !canEditScript) return;
    updateProject(project.id, (current) => ({
      ...current,
      characters: [
        ...current.characters,
        { id: newId("character"), name: `登場人物${current.characters.length + 1}`, color: "#168b9a" }
      ]
    }));
  };

  const patchCharacter = (characterId, patch) => {
    const permittedPatch = canEditScript ? patch : Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "name" && key !== "id"));
    if (!Object.keys(permittedPatch).length) return;
    updateProject(project.id, (current) => ({
      ...current,
      characters: current.characters.map((character) => character.id === characterId ? { ...character, ...permittedPatch } : character)
    }));
  };

  const removeCharacter = (characterId) => {
    if (!canEditScript) return;
    if (project.lines.some((line) => line.characterId === characterId)) return;
    updateProject(project.id, (current) => ({
      ...current,
      characters: current.characters.filter((character) => character.id !== characterId),
      castMembers: current.castMembers.map((member) => ({
        ...member,
        characterIds: member.characterIds.filter((id) => id !== characterId)
      }))
    }));
  };

  const addCastMember = () => {
    updateProject(project.id, (current) => ({
      ...current,
      castMembers: [
        ...current.castMembers,
        {
          id: newId("cast"),
          actorName: "声優さん",
          contact: "",
          characterIds: [],
          wpUserId: 0,
          accessKey: createRecordingAccessKey()
        }
      ]
    }));
  };

  const patchCastMember = (memberId, patch) => {
    updateProject(project.id, (current) => ({
      ...current,
      castMembers: current.castMembers.map((member) => member.id === memberId ? { ...member, ...patch } : member)
    }));
  };

  const removeCastMember = (memberId) => {
    if (!confirm("この声優さんの共有設定を削除しますか？収録進捗は残ります。")) return;
    updateProject(project.id, (current) => ({
      ...current,
      castMembers: current.castMembers.filter((member) => member.id !== memberId)
    }));
  };

  const publishProject = async () => {
    if (!project || !endpointUrl || !token) return;
    setSyncState({ busy: true, message: "共有データを更新しています…", error: false });
    try {
      const sharedProject = getShareableRecordingProject(project);
      const result = await postToGasEndpoint(endpointUrl, {
        action: "publishRecordingProject",
        token,
        driveFolderUrl,
        project: sharedProject
      });
      const sharedAt = result.now || new Date().toISOString();
      updateProject(project.id, { ...project, sharedAt });
      setSyncState({ busy: false, message: "声優さん用の共有データを更新しました。", error: false });
    } catch (error) {
      setSyncState({ busy: false, message: `共有できませんでした: ${error.message}`, error: true });
    }
  };

  const pullProject = async ({ silent = false } = {}) => {
    if (!project || !endpointUrl || !token || !project.sharedAt) return;
    if (!silent) setSyncState({ busy: true, message: "声優さん側の進捗を確認しています…", error: false });
    try {
      const result = await getFromGasEndpoint(endpointUrl, {
        action: "getRecordingProject",
        token,
        folder: driveFolderUrl,
        projectId: project.id
      });
      updateProject(project.id, (current) => mergeRemoteRecordingProject(current, result.project));
      if (!silent) setSyncState({ busy: false, message: "最新の収録・確認状況を同期しました。", error: false });
    } catch (error) {
      if (!silent) setSyncState({ busy: false, message: `同期できませんでした: ${error.message}`, error: true });
    }
  };

  useEffect(() => {
    if (!project?.sharedAt || !endpointUrl || !token) return undefined;
    const timer = window.setInterval(() => pullProject({ silent: true }), 30000);
    return () => window.clearInterval(timer);
  }, [project?.id, project?.sharedAt, endpointUrl, token]);

  if (!project) {
    return (
      <div className="view-stack">
        <SectionTitle title="台本収録ボード" subtitle="台本、担当セリフ、提出録音、確認状況を声優さんと共有します。" />
        <div className="recording-empty-state large">
          <Mic2 size={34} />
          <b>{canEditScript ? "最初の収録プロジェクトを作成" : "収録プロジェクトはまだありません"}</b>
          <span>{canEditScript ? "全文台本を登録し、登場人物と声優さんを結びつけます。" : "制作オーナーが台本を登録すると、ここへ進行状況が表示されます。"}</span>
          {canEditScript && <button type="button" className="primary" onClick={addProject}><Plus size={16} />収録プロジェクトを作る</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="view-stack recording-studio-view">
      <SectionTitle
        title="台本収録ボード"
        subtitle="同じ台本と収録状況を、管理側と声優さん側で共有します。"
        action={canEditScript ? (
          <button type="button" className="primary" onClick={addProject}>
            <Plus size={16} />プロジェクト
          </button>
        ) : null}
      />
      <div className="recording-project-bar">
        <div>
          <label>
            <span>収録プロジェクト</span>
            <select value={project.id} onChange={(event) => selectProjectId(event.target.value)}>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <span className="recording-version">{project.scriptVersion}</span>
          <span className="recording-project-status">{project.status}</span>
        </div>
        <div>
          {project.sharedAt && (
            <button type="button" className="secondary" onClick={() => pullProject()} disabled={syncState.busy}>
              <RefreshCw size={16} />最新状況
            </button>
          )}
          {canEditScript && (
            <button type="button" className="icon-button danger-icon" title="プロジェクトを削除" onClick={removeProject}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>
      {project.description && <p className="recording-project-description">{project.description}</p>}
      {syncState.message && tab !== "cast" && (
        <p className={`sync-inline-message top${syncState.error ? " error" : ""}`}>{syncState.message}</p>
      )}
      <div className="recording-tabs" role="tablist">
        <button type="button" className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><Eye size={16} />進行ボード</button>
        <button
          type="button"
          className={tab === "script" ? "active" : ""}
          onClick={() => setTab("script")}
          disabled={!canEditScript}
          title={canEditScript ? "台本を編集" : "制作オーナーのみ編集できます"}
        >
          {canEditScript ? <FilePlus2 size={16} /> : <LockKeyhole size={16} />}台本編集
        </button>
        <button type="button" className={tab === "cast" ? "active" : ""} onClick={() => setTab("cast")}><Users size={16} />配役・共有</button>
      </div>
      {!canEditScript && (
        <p className="script-permission-note"><LockKeyhole size={16} />制作管理者は録音・確認・配役・素材・予定を管理できます。台本本文の変更、削除、入れ替えは制作オーナーだけが行えます。</p>
      )}
      {tab === "board" && (
        <RecordingBoardView project={project} patchLine={patchLine} removeLine={removeLine} canEditScript={canEditScript} />
      )}
      {tab === "script" && canEditScript && (
        <ScriptEditor
          project={project}
          patchProject={patchProject}
          addLine={addLine}
          patchLine={patchLine}
          removeLine={removeLine}
          importScriptRows={importScriptRows}
          saveScriptSnapshot={saveScriptSnapshot}
          restoreSnapshot={restoreSnapshot}
        />
      )}
      {tab === "cast" && (
        <CastAndSharing
          project={project}
          canEditScript={canEditScript}
          settings={settings}
          patchProject={patchProject}
          addCharacter={addCharacter}
          patchCharacter={patchCharacter}
          removeCharacter={removeCharacter}
          addCastMember={addCastMember}
          patchCastMember={patchCastMember}
          removeCastMember={removeCastMember}
          publishProject={publishProject}
          pullProject={pullProject}
          syncState={syncState}
          setSyncMessage={(message) => setSyncState({ busy: false, message, error: false })}
          setActive={setActive}
        />
      )}
    </div>
  );
}

function SharedLineCard({ project, line, canEdit, draft, setDraft, submitPatch, uploadRecording, busy }) {
  const character = project.characters.find((item) => item.id === line.characterId);
  const isDirection = line.kind === "direction";
  const [editorOpen, setEditorOpen] = useState(false);
  const characterColor = character?.color || "#5f6d7a";
  return (
    <article
      className={`script-line-card shared${line.isContext ? " context-line" : ""}${isDirection ? " stage-direction-line" : ""}`}
      style={{
        "--character-color": characterColor,
        "--character-background": makeCharacterTint(characterColor, line.isContext ? 0.055 : 0.11)
      }}
    >
      <div className="script-line-main">
        <div className="script-line-sequence">
          <span>{String(line.order).padStart(3, "0")}</span>
          <b><i />{isDirection ? "ト書き" : character?.name || "話者未設定"}</b>
        </div>
        <div className="script-line-copy">
          <p><RubyText text={line.text} /></p>
          {line.direction && <small><MessageSquareText size={14} />{line.direction}</small>}
          {line.fileName && <code>{line.fileName}</code>}
        </div>
        {!isDirection && (
          <div className="script-line-states">
            <StatusBadge status={line.actorStatus} type="actor" />
            <StatusBadge status={line.reviewStatus} type="review" />
          </div>
        )}
      </div>
      {!line.isContext && !isDirection && (
        <>
          <RecordingPlayer url={line.recordingUrl} fileName={line.recordingFileName} />
          {line.directorNote && (
            <div className="shared-director-note">
              <Eye size={16} />
              <div><b>{line.reviewStatus === "リテイク" ? "リテイク内容" : "確認メモ"}</b><p>{line.directorNote}</p></div>
            </div>
          )}
          {canEdit && (
            <div className="shared-line-actions">
              <button
                type="button"
                className={line.actorStatus !== "未収録" ? "record-complete active" : "record-complete"}
                onClick={() => submitPatch(line.id, { actorStatus: line.actorStatus !== "未収録" ? "未収録" : "収録済み" })}
                disabled={busy}
              >
                <CheckCircle2 size={18} />{line.actorStatus !== "未収録" ? line.actorStatus : "収録完了にする"}
              </button>
              <button type="button" className="secondary" onClick={() => setEditorOpen((current) => !current)}>
                <Upload size={16} />録音を提出
              </button>
            </div>
          )}
          {canEdit && editorOpen && (
            <div className="shared-submission-editor">
              <label className="recording-upload-button">
                <FileAudio size={18} />
                <span>MP3・WAV・M4Aを選択<small>1ファイル25MBまで</small></span>
                <input
                  type="file"
                  accept={AUDIO_FILE_ACCEPT}
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadRecording(line.id, file);
                    event.target.value = "";
                  }}
                />
              </label>
              <div className="submission-or"><span>または</span></div>
              <label>
                <span>Google Driveなどの録音URL</span>
                <input
                  value={draft.recordingUrl}
                  onChange={(event) => setDraft(line.id, { recordingUrl: event.target.value })}
                  placeholder="https://drive.google.com/..."
                />
              </label>
              <label>
                <span>提出メモ</span>
                <textarea
                  value={draft.actorNote}
                  onChange={(event) => setDraft(line.id, { actorNote: event.target.value })}
                  placeholder="収録時の補足があれば入力"
                />
              </label>
              <button
                type="button"
                className="primary"
                disabled={busy || (draft.recordingUrl && !isWebUrl(draft.recordingUrl))}
                onClick={() => submitPatch(line.id, {
                  recordingUrl: draft.recordingUrl,
                  actorNote: draft.actorNote,
                  actorStatus: line.reviewStatus === "リテイク" ? "再提出済み" : "収録済み"
                })}
              >
                <Save size={16} />提出内容を保存
              </button>
            </div>
          )}
          {line.actorNote && <p className="shared-actor-note"><UserRound size={14} /><span>{line.actorNote}</span></p>}
        </>
      )}
    </article>
  );
}

export function SharedRecordingBoard({ logoSrc, reference }) {
  const [project, setProject] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [endpointUrl, setEndpointUrl] = useState(reference.endpointUrl || "");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedCharacterIds, setSelectedCharacterIds] = useState([]);
  const [mode, setMode] = useState("assignment");
  const [includeContext, setIncludeContext] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("すべて");
  const [state, setState] = useState({ busy: true, message: "共有台本を読み込んでいます…", error: false, busyLineId: "" });
  const [drafts, setDrafts] = useState({});
  const [openSceneIds, setOpenSceneIds] = useState(new Set());
  const [openChapterIds, setOpenChapterIds] = useState(new Set());
  const allChapters = useMemo(() => getChapterGroups(project?.lines || []), [project?.lines]);
  const scopedProject = useMemo(() => project ? ({
    ...project,
    lines: project.lines.filter((line) => {
      if (selectedSceneId) return line.sceneId === selectedSceneId;
      if (selectedChapterId) return line.chapterId === selectedChapterId;
      return true;
    })
  }) : null, [project, selectedChapterId, selectedSceneId]);
  const chapterSignature = allChapters.map((chapter) => `${chapter.chapterId}:${chapter.scenes.map((scene) => scene.sceneId).join(",")}`).join("|");
  const characterScopeSignature = (scopedProject?.lines || [])
    .map((line) => `${line.id}:${line.kind}:${line.characterId}`)
    .join("|");

  const loadProject = async ({ silent = false, resolvedEndpoint = endpointUrl } = {}) => {
    if (!resolvedEndpoint) {
      setState({ busy: false, message: "共同収録用のApps Script URLが設定されていません。管理者へご連絡ください。", error: true, busyLineId: "" });
      return;
    }
    if (!silent) setState({ busy: true, message: "共有台本を読み込んでいます…", error: false, busyLineId: "" });
    try {
      const result = await getFromGasEndpoint(resolvedEndpoint, {
        action: "getRecordingProject",
        folder: reference.driveFolderUrl,
        projectId: reference.projectId,
        memberId: reference.memberId,
        key: reference.accessKey
      });
      setProject(normalizeRecordingProject(result.project));
      setViewer(result.viewer || null);
      setState({ busy: false, message: silent ? "" : "最新の状況を表示しています。", error: false, busyLineId: "" });
    } catch (error) {
      setState({ busy: false, message: `共有台本を開けませんでした: ${error.message}`, error: true, busyLineId: "" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadAppConfig(import.meta.env.BASE_URL).then((config) => {
      if (cancelled) return;
      const resolvedEndpoint = reference.endpointUrl || config.recordingEndpointUrl || config.formEndpointUrl || "";
      setEndpointUrl(resolvedEndpoint);
      loadProject({ resolvedEndpoint });
    });
    return () => {
      cancelled = true;
    };
  }, [reference.projectId, reference.memberId, reference.accessKey]);

  useEffect(() => {
    if (!project || selectedCharacterIds.length) return;
    setSelectedCharacterIds(viewer?.characterIds?.length ? viewer.characterIds : []);
  }, [project?.id, viewer?.id]);

  useEffect(() => {
    if (selectedChapterId && !allChapters.some((chapter) => chapter.chapterId === selectedChapterId)) {
      setSelectedChapterId("");
      setSelectedSceneId("");
      return;
    }
    const selectedChapter = allChapters.find((chapter) => chapter.chapterId === selectedChapterId);
    if (selectedSceneId && !selectedChapter?.scenes.some((scene) => scene.sceneId === selectedSceneId)) setSelectedSceneId("");
  }, [selectedChapterId, selectedSceneId, chapterSignature]);

  useEffect(() => {
    if (!scopedProject) return;
    const available = new Set(scopedProject.lines.filter((line) => line.kind !== "direction").map((line) => line.characterId));
    setSelectedCharacterIds((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [selectedChapterId, selectedSceneId, characterScopeSignature]);

  useEffect(() => {
    setOpenSceneIds(new Set(
      selectedSceneId
        ? [selectedSceneId]
        : allChapters.flatMap((chapter) => chapter.scenes.map((scene) => scene.sceneId))
    ));
    setOpenChapterIds(new Set(selectedChapterId ? [selectedChapterId] : allChapters.map((chapter) => chapter.chapterId)));
  }, [project?.id, selectedChapterId, selectedSceneId, chapterSignature]);

  useEffect(() => {
    if (!project || !endpointUrl) return undefined;
    const timer = window.setInterval(() => loadProject({ silent: true }), 20000);
    return () => window.clearInterval(timer);
  }, [project?.id, endpointUrl]);

  const setDraft = (lineId, patch) => {
    setDrafts((current) => ({
      ...current,
      [lineId]: {
        recordingUrl: project.lines.find((line) => line.id === lineId)?.recordingUrl || "",
        actorNote: project.lines.find((line) => line.id === lineId)?.actorNote || "",
        ...(current[lineId] || {}),
        ...patch
      }
    }));
  };

  const submitPatch = async (lineId, patch, attachment = null) => {
    setState({ busy: false, message: "変更を共有しています…", error: false, busyLineId: lineId });
    try {
      const result = await postToGasEndpoint(endpointUrl, {
        action: "updateRecordingLine",
        driveFolderUrl: reference.driveFolderUrl,
        projectId: reference.projectId,
        memberId: reference.memberId,
        accessKey: reference.accessKey,
        lineId,
        patch,
        recordingAttachment: attachment
      });
      setProject(normalizeRecordingProject(result.project));
      setDrafts((current) => {
        const next = { ...current };
        delete next[lineId];
        return next;
      });
      setState({ busy: false, message: "変更を共有しました。", error: false, busyLineId: "" });
    } catch (error) {
      setState({ busy: false, message: `保存できませんでした: ${error.message}`, error: true, busyLineId: "" });
    }
  };

  const uploadRecording = async (lineId, file) => {
    if (file.size > MAX_RECORDING_UPLOAD_BYTES) {
      setState({ busy: false, message: "25MBを超える録音は、Google Driveへ置いて共有URLを貼ってください。", error: true, busyLineId: "" });
      return;
    }
    try {
      setState({ busy: false, message: `${file.name} を送信しています…`, error: false, busyLineId: lineId });
      const dataUrl = await readFileAsDataUrl(file);
      const line = project.lines.find((item) => item.id === lineId);
      await submitPatch(
        lineId,
        {
          actorStatus: line?.reviewStatus === "リテイク" ? "再提出済み" : "収録済み",
          recordingFileName: file.name
        },
        { fileName: file.name, mimeType: file.type || "audio/mpeg", size: file.size, dataUrl }
      );
    } catch (error) {
      setState({ busy: false, message: error.message, error: true, busyLineId: "" });
    }
  };

  if (!project) {
    return (
      <main className="shared-recording-shell">
        <header className="shared-recording-brand">
          <img src={logoSrc} alt="Umbrella Parade" />
          <div><Mic2 size={20} /><span>Voice Casting Studio</span></div>
        </header>
        <div className={`shared-loading${state.error ? " error" : ""}`}>
          {state.busy ? <RefreshCw className="spin" size={28} /> : <KeyRound size={28} />}
          <b>{state.message}</b>
        </div>
      </main>
    );
  }

  const visibleLines = getFilteredRecordingLines({
    project: scopedProject,
    selectedCharacterIds,
    mode,
    includeContext,
    query,
    statusFilter
  });
  const chapters = getChapterGroups(visibleLines);
  const editableCharacters = new Set(viewer?.characterIds || []);
  const toggleScene = (sceneId) => {
    setOpenSceneIds((current) => {
      const next = new Set(current);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  };
  const toggleChapter = (chapterId) => {
    setOpenChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };
  const selectChapter = (chapterId) => {
    setSelectedChapterId(chapterId);
    setSelectedSceneId("");
    setSelectedCharacterIds([]);
  };
  const selectScene = (sceneId) => {
    setSelectedSceneId(sceneId);
    setSelectedCharacterIds([]);
  };

  return (
    <main className="shared-recording-shell">
      <header className="shared-recording-brand">
        <img src={logoSrc} alt="Umbrella Parade" />
        <div><Mic2 size={20} /><span>Voice Casting Studio</span></div>
      </header>
      <section className="shared-recording-heading">
        <div>
          <span className="shared-viewer-name"><UserRound size={15} />{formatActorDisplayName(viewer?.actorName)}の収録ページ</span>
          <h1>{project.title}</h1>
          <p>{project.description || "担当セリフと収録・確認状況を共有しています。"}</p>
        </div>
        <div className="shared-heading-meta">
          <span>{project.scriptVersion}</span>
          <span>{project.status}</span>
          <button type="button" className="secondary" onClick={() => loadProject()} disabled={state.busy || Boolean(state.busyLineId)}>
            <RefreshCw size={16} />最新状況
          </button>
        </div>
      </section>
      <ChapterSelector
        chapters={allChapters}
        selectedChapterId={selectedChapterId}
        selectedSceneId={selectedSceneId}
        setSelectedChapterId={selectChapter}
        setSelectedSceneId={selectScene}
      />
      <ProgressSummary project={scopedProject} compact />
      {state.message && <p className={`shared-sync-message${state.error ? " error" : ""}`}>{state.message}</p>}
      <CharacterFilters
        project={scopedProject}
        selectedCharacterIds={selectedCharacterIds}
        setSelectedCharacterIds={setSelectedCharacterIds}
        mode={mode}
        setMode={setMode}
        includeContext={includeContext}
        setIncludeContext={setIncludeContext}
        query={query}
        setQuery={setQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        allLabel={selectedSceneId ? "シーン全文" : selectedChapterId ? "章の全文" : "全文"}
      />
      <div className="script-chapters shared-scenes">
        {chapters.map((chapter) => (
          <ScriptChapterSection key={chapter.chapterId} chapter={chapter} open={openChapterIds.has(chapter.chapterId)} onToggle={() => toggleChapter(chapter.chapterId)}>
            <div className="script-scenes">
              {chapter.scenes.map((scene) => (
                <ScriptSceneSection key={scene.sceneId} scene={scene} open={openSceneIds.has(scene.sceneId)} onToggle={() => toggleScene(scene.sceneId)}>
                  <div className="script-line-list">
                    {scene.lines.map((line) => {
                      const draft = drafts[line.id] || { recordingUrl: line.recordingUrl, actorNote: line.actorNote };
                      return (
                        <SharedLineCard
                          key={line.id}
                          project={project}
                          line={line}
                          canEdit={!line.isContext && editableCharacters.has(line.characterId)}
                          draft={draft}
                          setDraft={setDraft}
                          submitPatch={submitPatch}
                          uploadRecording={uploadRecording}
                          busy={state.busyLineId === line.id}
                        />
                      );
                    })}
                  </div>
                </ScriptSceneSection>
              ))}
            </div>
          </ScriptChapterSection>
        ))}
        {!visibleLines.length && (
          <div className="recording-empty-state">
            <Search size={28} />
            <b>条件に合うセリフがありません</b>
            <span>章または登場人物の選択を変更してください。</span>
          </div>
        )}
      </div>
      <footer className="shared-recording-footer">
        <span>このページの進捗は管理者と共有されています。</span>
        <span>最終更新 {formatUpdatedAt(project.updatedAt)}</span>
      </footer>
    </main>
  );
}
