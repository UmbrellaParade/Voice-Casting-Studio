import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Clock3,
  ExternalLink,
  Eye,
  Eraser,
  FileAudio,
  FilePlus2,
  KeyRound,
  Link,
  ListFilter,
  MessageSquareText,
  Mic2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
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
  createRecordingAccessKey,
  createRecordingProject,
  addRubyNotation,
  getCharacterName,
  getFilteredRecordingLines,
  getRecordingProgress,
  makeRecordingShareUrl,
  mergeRemoteRecordingProject,
  normalizeRecordingProject,
  parseRubyText,
  parseScriptTable,
  hasRubyNotation,
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
  setStatusFilter
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
      <div className="recording-filter-row">
        <button
          type="button"
          className={selectedCharacterIds.length === 0 ? "character-filter active" : "character-filter"}
          onClick={() => setSelectedCharacterIds([])}
        >
          <Users size={16} />全文
        </button>
        {project.characters.map((character) => (
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

function AdminLineCard({ project, line, patchLine, removeLine, moveLine }) {
  const character = project.characters.find((item) => item.id === line.characterId);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article className={`script-line-card${line.isContext ? " context-line" : ""}`}>
      <div className="script-line-main">
        <div className="script-line-sequence">
          <span>{String(line.order).padStart(3, "0")}</span>
          <b style={{ "--character-color": character?.color || "#5f6d7a" }}>
            <i />{character?.name || "話者未設定"}
          </b>
        </div>
        <div className="script-line-copy">
          <p><RubyText text={line.text || "セリフ未入力"} /></p>
          {line.direction && <small><MessageSquareText size={14} />{line.direction}</small>}
          {line.fileName && <code>{line.fileName}</code>}
        </div>
        <div className="script-line-states">
          <StatusBadge status={line.actorStatus} type="actor" />
          <StatusBadge status={line.reviewStatus} type="review" />
        </div>
      </div>
      {!line.isContext && (
        <>
          <RecordingPlayer url={line.recordingUrl} fileName={line.recordingFileName} />
          <div className="line-status-editor">
            <div>
              <span>声優さん</span>
              <div className="status-button-row">
                {ACTOR_RECORDING_STATUSES.map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={line.actorStatus === status ? "active" : ""}
                    onClick={() => patchLine(line.id, { actorStatus: status })}
                  >
                    {status === "収録済み" && <Check size={14} />}{status}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span>確認状況</span>
              <div className="status-button-row review">
                {DIRECTOR_REVIEW_STATUSES.map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={line.reviewStatus === status ? "active" : ""}
                    onClick={() => patchLine(line.id, { reviewStatus: status })}
                  >
                    {status}
                  </button>
                ))}
              </div>
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
              <button type="button" className="icon-button" title="上へ移動" onClick={() => moveLine(line.id, -1)}><ArrowUp size={15} /></button>
              <button type="button" className="icon-button" title="下へ移動" onClick={() => moveLine(line.id, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="secondary compact" onClick={() => setDetailsOpen((current) => !current)}>
                {detailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}詳細編集
              </button>
            </div>
          </div>
          {detailsOpen && (
            <div className="line-detail-editor">
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
              <Field label="録音URL" value={line.recordingUrl} onChange={(value) => patchLine(line.id, { recordingUrl: value })} />
              <TextArea label="声優さんのメモ" value={line.actorNote} onChange={(value) => patchLine(line.id, { actorNote: value })} />
              <TextArea label="確認・リテイクメモ" value={line.directorNote} onChange={(value) => patchLine(line.id, { directorNote: value })} />
              <button type="button" className="danger compact" onClick={() => removeLine(line.id)}>
                <Trash2 size={15} />このセリフを削除
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function RecordingBoardView({ project, patchLine, removeLine, moveLine }) {
  const [selectedCharacterIds, setSelectedCharacterIds] = useState([]);
  const [mode, setMode] = useState("assignment");
  const [includeContext, setIncludeContext] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("すべて");
  const visibleLines = useMemo(
    () => getFilteredRecordingLines({
      project,
      selectedCharacterIds,
      mode,
      includeContext,
      query,
      statusFilter
    }),
    [project, selectedCharacterIds, mode, includeContext, query, statusFilter]
  );
  const scenes = getSceneGroups(visibleLines);

  return (
    <>
      <ProgressSummary project={project} />
      <CharacterFilters
        project={project}
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
      />
      <div className="script-scenes">
        {scenes.map((scene) => (
          <section className="script-scene" key={scene.sceneId}>
            <div className="script-scene-heading">
              <span>{scene.title}</span>
              <small>{scene.lines.filter((line) => !line.isContext).length}セリフ</small>
            </div>
            <div className="script-line-list">
              {scene.lines.map((line) => (
                <AdminLineCard
                  key={line.id}
                  project={project}
                  line={line}
                  patchLine={patchLine}
                  removeLine={removeLine}
                  moveLine={moveLine}
                />
              ))}
            </div>
          </section>
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

function ScriptEditor({ project, patchProject, addLine, patchLine, removeLine, importScriptRows }) {
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [showAllLines, setShowAllLines] = useState(false);
  const [rubyLineId, setRubyLineId] = useState("");

  const applyImport = () => {
    const rows = parseScriptTable(importText, parseCsv);
    if (!rows.length) {
      setImportMessage("読み込めるセリフがありません。列名と内容を確認してください。");
      return;
    }
    importScriptRows(rows);
    setImportText("");
    setImportMessage(`${rows.length}件のセリフを追加しました。`);
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
            <h2>台本をまとめて追加</h2>
            <p className="muted">GoogleスプレッドシートやExcelから、そのまま貼り付けられます。</p>
          </div>
        </div>
        <div className="script-import-example">
          <code>シーン</code><code>話者</code><code>セリフ</code><code>演技指示</code><code>ファイル名</code>
        </div>
        <p className="ruby-import-hint">
          <BookOpenText size={15} />
          スプレッドシート側でルビを入れる場合は、セリフ欄へ <code>｜覚悟《かくご》</code> と入力します。
        </p>
        <textarea
          className="script-import-textarea"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={"シーン\t話者\tセリフ\t演技指示\tファイル名\nScene 01\tヴェル\tうん。もう決めたんだ。\t静かな決意で\tS01_003_VEL"}
        />
        <div className="button-row">
          <button type="button" className="primary" onClick={applyImport} disabled={!importText.trim()}>
            <Upload size={16} />台本へ追加
          </button>
          <button type="button" className="secondary" onClick={addLine}>
            <FilePlus2 size={16} />1セリフ追加
          </button>
        </div>
        {importMessage && <p className="hint-text">{importMessage}</p>}
      </article>

      <article className="panel">
        <div className="record-head">
          <div>
            <h2>セリフ一覧</h2>
            <p className="muted">{project.lines.length}件。詳細な進捗操作は「進行ボード」で行えます。</p>
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
                <select value={line.characterId} onChange={(event) => patchLine(line.id, { characterId: event.target.value })}>
                  {project.characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                </select>
                <input value={line.sceneTitle} onChange={(event) => patchLine(line.id, { sceneTitle: event.target.value })} aria-label="シーン" />
                <textarea value={line.text} onChange={(event) => patchLine(line.id, { text: event.target.value })} aria-label="セリフ" />
                <button
                  type="button"
                  className={rubyLineId === line.id ? "icon-button active" : "icon-button"}
                  title="ルビを設定"
                  aria-label={`${getCharacterName(project, line.characterId)} ${line.order}番のルビを設定`}
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
          <button type="button" className="secondary" onClick={addCharacter}><Plus size={16} />登場人物</button>
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
              <input value={character.name} onChange={(event) => patchCharacter(character.id, { name: event.target.value })} />
              <span>{project.lines.filter((line) => line.characterId === character.id).length}セリフ</span>
              <button
                type="button"
                className="icon-button danger-icon"
                title="登場人物を削除"
                onClick={() => removeCharacter(character.id)}
                disabled={project.lines.some((line) => line.characterId === character.id)}
              >
                <Trash2 size={16} />
              </button>
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
  settings,
  setActive
}) {
  const episodeProjects = projects.filter((project) => !selectedEpisodeId || project.episodeId === selectedEpisodeId);
  const [selectedProjectId, setSelectedProjectId] = useState(() => episodeProjects[0]?.id || projects[0]?.id || "");
  const [tab, setTab] = useState("board");
  const [syncState, setSyncState] = useState({ busy: false, message: "", error: false });

  useEffect(() => {
    if (episodeProjects.some((item) => item.id === selectedProjectId)) return;
    if (!episodeProjects.length && projects.some((item) => item.id === selectedProjectId)) return;
    setSelectedProjectId(episodeProjects[0]?.id || projects[0]?.id || "");
  }, [projects, episodeProjects, selectedProjectId, selectedEpisodeId]);

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
    const timestampedPatch = { ...patch, updatedAt: new Date().toISOString() };
    updateProject(project.id, (current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === lineId ? { ...line, ...timestampedPatch } : line)
    }));
    const shouldSync = project.sharedAt && Object.keys(patch).some((key) => COLLABORATIVE_LINE_FIELDS.has(key));
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
    const episode = episodes.find((item) => item.id === selectedEpisodeId) || episodes[0];
    const next = createRecordingProject({
      episodeId: episode?.id || "",
      title: episode?.title ? `${episode.title} 収録台本` : "新しい収録プロジェクト"
    });
    updateProjects((current) => [next, ...current]);
    setSelectedProjectId(next.id);
    setTab("script");
  };

  const removeProject = () => {
    if (!project || !confirm(`「${project.title}」を削除しますか？`)) return;
    updateProjects((current) => current.filter((item) => item.id !== project.id));
    setSelectedProjectId("");
  };

  const addLine = () => {
    if (!project) return;
    const firstCharacter = project.characters[0] || {
      id: newId("character"),
      name: "話者",
      color: "#168b9a"
    };
    updateProject(project.id, (current) => ({
      ...current,
      characters: current.characters.length ? current.characters : [firstCharacter],
      lines: [
        ...current.lines,
        {
          id: newId("line"),
          sceneId: current.lines.at(-1)?.sceneId || newId("scene"),
          sceneTitle: current.lines.at(-1)?.sceneTitle || "Scene 1",
          order: current.lines.length + 1,
          characterId: firstCharacter.id,
          text: "",
          direction: "",
          fileName: "",
          actorStatus: "未収録",
          reviewStatus: "未確認",
          recordingUrl: "",
          recordingFileName: "",
          actorNote: "",
          directorNote: "",
          updatedAt: ""
        }
      ]
    }));
  };

  const removeLine = (lineId) => {
    if (!project || !confirm("このセリフと進捗を削除しますか？")) return;
    updateProject(project.id, (current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lineId).map((line, index) => ({ ...line, order: index + 1 }))
    }));
  };

  const moveLine = (lineId, direction) => {
    if (!project) return;
    updateProject(project.id, (current) => {
      const lines = [...current.lines];
      const index = lines.findIndex((line) => line.id === lineId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= lines.length) return current;
      const [line] = lines.splice(index, 1);
      lines.splice(target, 0, line);
      return { ...current, lines: lines.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })) };
    });
  };

  const importScriptRows = (rows) => {
    if (!project) return;
    updateProject(project.id, (current) => {
      const characters = [...current.characters];
      const characterByName = new Map(characters.map((character) => [character.name, character]));
      const sceneByTitle = new Map(current.lines.map((line) => [line.sceneTitle, line.sceneId]));
      const nextLines = rows.map((row, index) => {
        let character = characterByName.get(row.speaker);
        if (!character) {
          character = {
            id: newId("character"),
            name: row.speaker || "話者未設定",
            color: ["#168b9a", "#d65285", "#7a63ad", "#b57024", "#2f7d4a", "#5f6d7a"][characters.length % 6]
          };
          characters.push(character);
          characterByName.set(character.name, character);
        }
        let sceneId = sceneByTitle.get(row.sceneTitle);
        if (!sceneId) {
          sceneId = newId("scene");
          sceneByTitle.set(row.sceneTitle, sceneId);
        }
        return {
          id: newId("line"),
          sceneId,
          sceneTitle: row.sceneTitle,
          order: current.lines.length + index + 1,
          characterId: character.id,
          text: row.text,
          direction: row.direction,
          fileName: row.fileName,
          actorStatus: "未収録",
          reviewStatus: "未確認",
          recordingUrl: "",
          recordingFileName: "",
          actorNote: "",
          directorNote: "",
          updatedAt: ""
        };
      });
      return { ...current, characters, lines: [...current.lines, ...nextLines] };
    });
  };

  const addCharacter = () => {
    if (!project) return;
    updateProject(project.id, (current) => ({
      ...current,
      characters: [
        ...current.characters,
        { id: newId("character"), name: `登場人物${current.characters.length + 1}`, color: "#168b9a" }
      ]
    }));
  };

  const patchCharacter = (characterId, patch) => {
    updateProject(project.id, (current) => ({
      ...current,
      characters: current.characters.map((character) => character.id === characterId ? { ...character, ...patch } : character)
    }));
  };

  const removeCharacter = (characterId) => {
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
      const result = await postToGasEndpoint(endpointUrl, {
        action: "publishRecordingProject",
        token,
        driveFolderUrl,
        project
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
          <b>最初の収録プロジェクトを作成</b>
          <span>全文台本を登録し、登場人物と声優さんを結びつけます。</span>
          <button type="button" className="primary" onClick={addProject}><Plus size={16} />収録プロジェクトを作る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="view-stack recording-studio-view">
      <SectionTitle
        title="台本収録ボード"
        subtitle="同じ台本と収録状況を、管理側と声優さん側で共有します。"
        action={(
          <button type="button" className="primary" onClick={addProject}>
            <Plus size={16} />プロジェクト
          </button>
        )}
      />
      <div className="recording-project-bar">
        <div>
          <label>
            <span>収録プロジェクト</span>
            <select value={project.id} onChange={(event) => setSelectedProjectId(event.target.value)}>
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
          <button type="button" className="icon-button danger-icon" title="プロジェクトを削除" onClick={removeProject}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>
      {project.description && <p className="recording-project-description">{project.description}</p>}
      {syncState.message && tab !== "cast" && (
        <p className={`sync-inline-message top${syncState.error ? " error" : ""}`}>{syncState.message}</p>
      )}
      <div className="recording-tabs" role="tablist">
        <button type="button" className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><Eye size={16} />進行ボード</button>
        <button type="button" className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}><FilePlus2 size={16} />台本編集</button>
        <button type="button" className={tab === "cast" ? "active" : ""} onClick={() => setTab("cast")}><Users size={16} />配役・共有</button>
      </div>
      {tab === "board" && (
        <RecordingBoardView project={project} patchLine={patchLine} removeLine={removeLine} moveLine={moveLine} />
      )}
      {tab === "script" && (
        <ScriptEditor
          project={project}
          patchProject={patchProject}
          addLine={addLine}
          patchLine={patchLine}
          removeLine={removeLine}
          importScriptRows={importScriptRows}
        />
      )}
      {tab === "cast" && (
        <CastAndSharing
          project={project}
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
  const [editorOpen, setEditorOpen] = useState(false);
  return (
    <article className={`script-line-card shared${line.isContext ? " context-line" : ""}`}>
      <div className="script-line-main">
        <div className="script-line-sequence">
          <span>{String(line.order).padStart(3, "0")}</span>
          <b style={{ "--character-color": character?.color || "#5f6d7a" }}><i />{character?.name || "話者未設定"}</b>
        </div>
        <div className="script-line-copy">
          <p><RubyText text={line.text} /></p>
          {line.direction && <small><MessageSquareText size={14} />{line.direction}</small>}
          {line.fileName && <code>{line.fileName}</code>}
        </div>
        <div className="script-line-states">
          <StatusBadge status={line.actorStatus} type="actor" />
          <StatusBadge status={line.reviewStatus} type="review" />
        </div>
      </div>
      {!line.isContext && (
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
  const [selectedCharacterIds, setSelectedCharacterIds] = useState([]);
  const [mode, setMode] = useState("assignment");
  const [includeContext, setIncludeContext] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("すべて");
  const [state, setState] = useState({ busy: true, message: "共有台本を読み込んでいます…", error: false, busyLineId: "" });
  const [drafts, setDrafts] = useState({});

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
    project,
    selectedCharacterIds,
    mode,
    includeContext,
    query,
    statusFilter
  });
  const scenes = getSceneGroups(visibleLines);
  const editableCharacters = new Set(viewer?.characterIds || []);

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
      <ProgressSummary project={project} compact />
      {state.message && <p className={`shared-sync-message${state.error ? " error" : ""}`}>{state.message}</p>}
      <CharacterFilters
        project={project}
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
      />
      <div className="script-scenes shared-scenes">
        {scenes.map((scene) => (
          <section className="script-scene" key={scene.sceneId}>
            <div className="script-scene-heading">
              <span>{scene.title}</span>
              <small>{scene.lines.filter((line) => !line.isContext).length}セリフ</small>
            </div>
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
          </section>
        ))}
      </div>
      <footer className="shared-recording-footer">
        <span>このページの進捗は管理者と共有されています。</span>
        <span>最終更新 {formatUpdatedAt(project.updatedAt)}</span>
      </footer>
    </main>
  );
}
