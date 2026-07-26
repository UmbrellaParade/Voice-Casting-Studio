import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileAudio,
  FileImage,
  FolderOpen,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  Link,
  Megaphone,
  MessageSquareText,
  Music2,
  Plus,
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
  PRODUCTION_QUESTION_STATUSES,
  PRODUCTION_SCHEDULE_STATUSES,
  PRODUCTION_SCHEDULE_TYPES,
  archiveScriptVersion,
  getCharacterName,
  getRecordingProgress,
  parseRubyText,
  reorderProductionCharacters,
  reorderProductionMaterials
} from "../lib/recording.js";
import { getWordPressRuntime, uploadWordPressImage } from "../lib/wordpress.js";
import { SectionTitle } from "./ui.jsx";

const EDITING_STATUS_OPTIONS = ["未着手", "脚本・配役調整中", "収録中", "音声編集中", "確認中", "公開準備中", "完了"];
const MATERIAL_ASPECT_RATIOS = ["", "16:9", "9:16", "1:1"];
const MAX_LOCAL_THUMBNAIL_BYTES = 6 * 1024 * 1024;
const WORDPRESS_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const MAX_LOCAL_CHARACTER_IMAGE_BYTES = 3 * 1024 * 1024;

const formatDate = (value, withTime = false) => {
  if (!value) return "未設定";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", withTime
    ? { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "numeric", day: "numeric" });
};

const toDateInputValue = (value) => String(value || "").slice(0, 10);

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

function ProductionHome({ project, setActive }) {
  const progress = getRecordingProgress(project);
  const unreviewedLines = project.lines.filter((line) =>
    line.kind !== "direction" && line.actorStatus !== "未収録" && ["未確認", "確認中"].includes(line.reviewStatus)
  );
  const unansweredQuestions = project.questions.filter((question) => question.status === "未回答");
  const schedule = [
    ...(project.recordingDeadline ? [{ id: "recording-deadline", type: "収録締切", title: "作品全体の収録締切", date: project.recordingDeadline, status: "予定" }] : []),
    ...(project.releaseDate ? [{ id: "release-date", type: "公開予定", title: "作品の公開予定", date: project.releaseDate, status: "予定" }] : []),
    ...project.scheduleItems
  ].filter((item) => item.date && item.status !== "完了").sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="production-page-stack">
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
                <time dateTime={item.date}><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString("ja-JP", { month: "short" })}</span></time>
                <div><b>{item.title}</b><span>{item.type} / {item.status}</span></div>
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

function CharacterImage({ character, patchCharacter }) {
  const [message, setMessage] = useState("");
  const imageUrl = getImageUrl(character.imageUrl);

  const uploadImage = async (file) => {
    if (file.size > MAX_LOCAL_CHARACTER_IMAGE_BYTES) {
      setMessage("3MB以下の画像を選ぶか、画像URLを登録してください。");
      return;
    }
    try {
      const runtime = getWordPressRuntime();
      const imageUrl = runtime
        ? (await uploadWordPressImage(file)).url
        : await readFileAsDataUrl(file);
      patchCharacter({ imageUrl });
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="character-image-editor">
      <div className="character-image-preview" style={{ "--character-color": character.color }}>
        {imageUrl ? <img src={imageUrl} alt={`${character.name}のキャラクター画像`} /> : <Users size={34} />}
      </div>
      <label className="secondary character-image-upload">
        <ImagePlus size={16} /><span>画像を選択</span>
        <input type="file" accept={WORDPRESS_IMAGE_ACCEPT} onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadImage(file);
          event.target.value = "";
        }} />
      </label>
      {message && <small className="production-field-error">{message}</small>}
    </div>
  );
}

function CharactersView({ project, updateProject, siteUsers = [], canEditScript = true }) {
  const [actorNameDrafts, setActorNameDrafts] = useState({});
  const [draggingCharacterId, setDraggingCharacterId] = useState("");
  const [dragOverCharacterId, setDragOverCharacterId] = useState("");
  const [message, setMessage] = useState("");
  const pointerDragRef = useRef(null);

  const patchCharacter = (characterId, patch) => updateProject((current) => ({
    ...current,
    characters: current.characters.map((character) => character.id === characterId ? {
      ...character,
      ...Object.fromEntries(Object.entries(patch).filter(([key]) => canEditScript || (key !== "id" && key !== "name")))
    } : character)
  }));

  const assignActorName = (characterId, actorName) => {
    const name = String(actorName || "").trim();
    updateProject((current) => {
      const unassignedMembers = current.castMembers.map((member) => ({
        ...member,
        characterIds: member.characterIds.filter((id) => id !== characterId)
      }));
      if (!name) return { ...current, castMembers: unassignedMembers };
      const actorKey = name.normalize("NFKC").toLocaleLowerCase("ja");
      const existing = unassignedMembers.find((member) => member.actorName.normalize("NFKC").toLocaleLowerCase("ja") === actorKey);
      const castMembers = existing
        ? unassignedMembers.map((member) => member.id === existing.id
          ? { ...member, characterIds: [...new Set([...member.characterIds, characterId])] }
          : member)
        : [...unassignedMembers, {
          id: newId("cast"),
          actorName: name,
          contact: "",
          characterIds: [characterId],
          wpUserId: 0,
          accessKey: ""
        }];
      return { ...current, castMembers };
    });
    setActorNameDrafts((current) => ({ ...current, [characterId]: name }));
  };

  const moveCharacter = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
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
    if (event.button !== 0) return;
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
        color: "#168b9a",
        imageUrl: "",
        profile: "",
        background: "",
        recordingFolderUrl: "",
        openChatUrl: ""
      }]
    }));
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

  const addCastMember = () => updateProject((current) => ({
    ...current,
    castMembers: [...current.castMembers, { id: newId("cast"), actorName: "声優さん", contact: "", characterIds: [], wpUserId: 0, accessKey: "" }]
  }));

  const patchCastMember = (memberId, patch) => updateProject((current) => ({
    ...current,
    castMembers: current.castMembers.map((member) => member.id === memberId ? { ...member, ...patch } : member)
  }));

  return (
    <div className="production-page-stack">
      <div className="production-section-toolbar">
        <div><Users size={19} /><span>{project.characters.length}人の登場人物</span></div>
        {canEditScript && <button type="button" className="primary" onClick={addCharacter}><Plus size={16} />登場人物</button>}
      </div>
      {message && <p className="production-inline-message">{message}</p>}
      <div className="character-editor-list">
        {project.characters.map((character, characterIndex) => {
          const assignedMember = project.castMembers.find((member) => member.characterIds.includes(character.id));
          const lineCount = project.lines.filter((line) => line.kind !== "direction" && line.characterId === character.id).length;
          return (
            <article
              className={`character-editor${draggingCharacterId === character.id ? " dragging" : ""}${dragOverCharacterId === character.id ? " drag-over" : ""}`}
              data-character-id={character.id}
              key={character.id}
              style={{ "--character-color": character.color }}
            >
              <CharacterImage character={character} patchCharacter={(patch) => patchCharacter(character.id, patch)} />
              <div className="character-editor-fields">
                <header>
                  <div className="character-name-fields">
                    <label><span>名前</span><input value={character.name} readOnly={!canEditScript} onChange={(event) => patchCharacter(character.id, { name: event.target.value })} /></label>
                    <label className="character-color-field"><span>セリフ色</span><input type="color" value={character.color} onChange={(event) => patchCharacter(character.id, { color: event.target.value })} /></label>
                  </div>
                  <div className="character-header-actions">
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
                        <button type="button" className="icon-button" title="一つ上へ" aria-label={`${character.name}を一つ上へ`} disabled={characterIndex === 0} onClick={() => moveCharacter(character.id, project.characters[characterIndex - 1]?.id)}><ArrowUp size={16} /></button>
                        <button type="button" className="icon-button" title="一つ下へ" aria-label={`${character.name}を一つ下へ`} disabled={characterIndex === project.characters.length - 1} onClick={() => moveCharacter(character.id, project.characters[characterIndex + 1]?.id)}><ArrowDown size={16} /></button>
                      </div>
                    )}
                  </div>
                </header>
                <div className="character-field-grid">
                  <label><span>担当声優</span><input value={actorNameDrafts[character.id] ?? assignedMember?.actorName ?? ""} placeholder="声優さんの名前を入力" onChange={(event) => setActorNameDrafts((current) => ({ ...current, [character.id]: event.target.value }))} onBlur={(event) => assignActorName(character.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                  <label><span>キャラクター画像URL</span><input value={character.imageUrl.startsWith("data:") ? "" : character.imageUrl} placeholder={character.imageUrl.startsWith("data:") ? "画像を登録済み" : "https://..."} onChange={(event) => patchCharacter(character.id, { imageUrl: event.target.value })} /></label>
                  <label className="wide"><span>設定・人物像</span><textarea value={character.profile} onChange={(event) => patchCharacter(character.id, { profile: event.target.value })} /></label>
                  <label className="wide"><span>バックグラウンド</span><textarea value={character.background} onChange={(event) => patchCharacter(character.id, { background: event.target.value })} /></label>
                  <label><span>収録フォルダー</span><input value={character.recordingFolderUrl} placeholder="Google DriveフォルダーURL" onChange={(event) => patchCharacter(character.id, { recordingFolderUrl: event.target.value })} /></label>
                </div>
                <footer>
                  <div className="character-link-actions">
                    <a className={!isWebUrl(character.recordingFolderUrl) ? "disabled" : ""} href={isWebUrl(character.recordingFolderUrl) ? character.recordingFolderUrl : undefined} target="_blank" rel="noreferrer"><FolderOpen size={16} />収録フォルダー</a>
                  </div>
                  {canEditScript && <button type="button" className="icon-button danger-icon" title="登場人物を削除" onClick={() => removeCharacter(character.id)}><Trash2 size={16} /></button>}
                </footer>
              </div>
            </article>
          );
        })}
      </div>

      <section className="panel cast-roster-panel">
        <header><div><UserPlus size={19} /><div><h3>担当声優</h3><p>登場人物へ割り当てるメンバーを管理します。</p></div></div><button type="button" className="secondary" onClick={addCastMember}><Plus size={16} />声優さん</button></header>
        <div className="cast-roster-list">
          {project.castMembers.map((member) => (
            <div className={siteUsers.length ? "has-wordpress-users" : ""} key={member.id}>
              <label><span>表示名</span><input value={member.actorName} onChange={(event) => patchCastMember(member.id, { actorName: event.target.value })} /></label>
              <label><span>連絡先メモ</span><input value={member.contact} onChange={(event) => patchCastMember(member.id, { contact: event.target.value })} /></label>
              {siteUsers.length > 0 && (
                <label><span>WordPressアカウント</span><select value={member.wpUserId || 0} onChange={(event) => patchCastMember(member.id, { wpUserId: Number(event.target.value) || 0 })}><option value="0">未連携</option>{siteUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
              )}
              <span>{member.characterIds.map((id) => getCharacterName(project, id)).join("・") || "担当未設定"}</span>
              <button type="button" className="icon-button danger-icon" title="担当声優を削除" onClick={() => {
                if (!confirm(`${member.actorName}を担当声優一覧から削除しますか？`)) return;
                updateProject((current) => ({ ...current, castMembers: current.castMembers.filter((item) => item.id !== member.id) }));
              }}><Trash2 size={16} /></button>
            </div>
          ))}
          {!project.castMembers.length && <p className="production-list-empty">担当声優はまだ登録されていません。</p>}
        </div>
      </section>
    </div>
  );
}

function CharacterLinkField({ icon: Icon, label, service, value = "", placeholder, onChange }) {
  const canOpen = isWebUrl(value);
  return (
    <div className="production-link-field">
      <div className="production-link-label">
        <Icon size={18} />
        <div><b>{label}</b><span>{service}</span></div>
      </div>
      <div className="production-link-control">
        <input type="url" aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
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

function LinksView({ project, updateProject }) {
  const patchCharacterLink = (characterId, key, value) => updateProject((current) => ({
    ...current,
    characters: current.characters.map((character) => character.id === characterId
      ? { ...character, [key]: value }
      : character)
  }));

  return (
    <div className="production-page-stack">
      <div className="production-section-toolbar">
        <div><Link size={19} /><span>{project.characters.length}人の連絡・共有先</span></div>
      </div>
      <div className="production-link-list">
        {project.characters.map((character) => {
          const assignedMember = project.castMembers.find((member) => member.characterIds.includes(character.id));
          return (
            <article className="production-link-row" key={character.id} style={{ "--character-color": character.color }}>
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
                  onChange={(value) => patchCharacterLink(character.id, "recordingFolderUrl", value)}
                />
                <CharacterLinkField
                  icon={MessageSquareText}
                  label="LINEオープンチャット"
                  service="連絡・相談"
                  value={character.openChatUrl}
                  placeholder="https://line.me/..."
                  onChange={(value) => patchCharacterLink(character.id, "openChatUrl", value)}
                />
              </div>
            </article>
          );
        })}
        {!project.characters.length && <div className="production-empty-state"><Link size={30} /><b>共有先を設定するキャラクターがいません</b></div>}
      </div>
    </div>
  );
}

function MaterialPreview({ material }) {
  if (!material.url) return <div className={`material-preview empty ratio-${material.aspectRatio.replace(":", "-") || "audio"}`}>{material.category === "サムネイル" ? <FileImage size={26} /> : <FileAudio size={26} />}</div>;
  if (material.category === "サムネイル") {
    return <div className={`material-preview ratio-${material.aspectRatio.replace(":", "-") || "16-9"}`}><img src={getImageUrl(material.url)} alt={material.title} /></div>;
  }
  return <MiniAudioPlayer url={material.url} fileName={material.fileName || material.title} />;
}

function MaterialsView({ project, updateProject }) {
  const [filter, setFilter] = useState("すべて");
  const [message, setMessage] = useState("");
  const [draggingMaterialId, setDraggingMaterialId] = useState("");
  const [dragOverMaterialId, setDragOverMaterialId] = useState("");
  const pointerDragRef = useRef(null);
  const visibleMaterials = filter === "すべて" ? project.materials : project.materials.filter((material) => material.category === filter);

  const addMaterial = (category = filter === "すべて" ? "主題歌" : filter) => updateProject((current) => ({
    ...current,
    materials: [{
      id: newId("material"), category, title: `${category} 新規素材`, url: "", fileName: "",
      aspectRatio: category === "サムネイル" ? "16:9" : "", status: "準備中", notes: "", updatedAt: new Date().toISOString()
    }, ...current.materials]
  }));

  const patchMaterial = (materialId, patch) => updateProject((current) => ({
    ...current,
    materials: current.materials.map((material) => material.id === materialId ? { ...material, ...patch, updatedAt: new Date().toISOString() } : material)
  }));

  const moveMaterial = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
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
    if (event.button !== 0) return;
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
    if (material.category !== "サムネイル") return;
    if (file.size > MAX_LOCAL_THUMBNAIL_BYTES) {
      setMessage("6MB以下のサムネイル画像を選んでください。");
      return;
    }
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
        <button type="button" className="primary" onClick={() => addMaterial()}><Plus size={16} />素材</button>
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
              <button
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
              ><GripVertical size={17} /></button>
              <span className={`material-category category-${material.category}`}>{material.category}</span>
              <select aria-label="素材の状態" value={material.status} onChange={(event) => patchMaterial(material.id, { status: event.target.value })}>{PRODUCTION_MATERIAL_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              <button type="button" className="icon-button danger-icon" title="素材を削除" onClick={() => {
                if (!confirm(`「${material.title}」を削除しますか？`)) return;
                updateProject((current) => ({ ...current, materials: current.materials.filter((item) => item.id !== material.id) }));
              }}><Trash2 size={16} /></button>
            </header>
            <MaterialPreview material={material} />
            <div className="material-fields">
              <label><span>素材名</span><input value={material.title} onChange={(event) => patchMaterial(material.id, { title: event.target.value })} /></label>
              <label><span>種類</span><select value={material.category} onChange={(event) => patchMaterial(material.id, { category: event.target.value, aspectRatio: event.target.value === "サムネイル" ? material.aspectRatio || "16:9" : "" })}>{PRODUCTION_MATERIAL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              {material.category === "サムネイル" && <label><span>比率</span><select value={material.aspectRatio} onChange={(event) => patchMaterial(material.id, { aspectRatio: event.target.value })}>{MATERIAL_ASPECT_RATIOS.filter(Boolean).map((ratio) => <option key={ratio}>{ratio}</option>)}</select></label>}
              <label className="wide"><span>{material.category === "サムネイル" ? "画像URL" : "Google Drive共有URL"}</span><input value={material.url.startsWith("data:") ? "" : material.url} placeholder={material.url.startsWith("data:") ? `${material.fileName} を登録済み` : "https://drive.google.com/..."} onChange={(event) => patchMaterial(material.id, { url: event.target.value, fileName: "" })} /></label>
              <label className="wide"><span>メモ</span><textarea value={material.notes} onChange={(event) => patchMaterial(material.id, { notes: event.target.value })} /></label>
            </div>
            <footer>
              {material.category === "サムネイル" ? (
                <label className="secondary material-upload-button"><Upload size={16} /><span>画像を選択</span><input type="file" accept={WORDPRESS_IMAGE_ACCEPT} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadMaterial(material, file);
                  event.target.value = "";
                }} /></label>
              ) : <span className="material-drive-note"><FolderOpen size={16} />音声はGoogle Driveで管理</span>}
              {material.url && !material.url.startsWith("data:") && <a href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />元ファイル</a>}
            </footer>
          </article>
        ))}
      </div>
      {!visibleMaterials.length && <div className="production-empty-state"><Music2 size={30} /><b>{filter === "すべて" ? "素材はまだありません" : `${filter}はまだありません`}</b><button type="button" className="secondary" onClick={() => addMaterial()}>追加する</button></div>}
    </div>
  );
}

function QuestionContext({ project, question }) {
  const line = project.lines.find((item) => item.id === question.lineId);
  if (!line) return <span className="question-context-label">作品全体について</span>;
  const character = project.characters.find((item) => item.id === line.characterId);
  return (
    <div className="question-line-context" style={{ "--character-color": character?.color || "#5f6d7a" }}>
      <span>{line.chapterTitle} / {line.sceneTitle} / {line.kind === "direction" ? "ト書き" : character?.name || "話者未設定"} / {String(line.order).padStart(3, "0")}</span>
      <p><RubyText text={line.text} /></p>
    </div>
  );
}

function QuestionsView({ project, updateProject }) {
  const [filter, setFilter] = useState("未回答");
  const [draft, setDraft] = useState({ authorName: "", lineId: "", body: "" });
  const visibleQuestions = filter === "すべて" ? project.questions : project.questions.filter((question) => question.status === filter);

  const addQuestion = () => {
    if (!draft.body.trim()) return;
    const line = project.lines.find((item) => item.id === draft.lineId);
    const now = new Date().toISOString();
    updateProject((current) => ({
      ...current,
      questions: [{ id: newId("question"), lineId: draft.lineId, characterId: line?.characterId || "", authorName: draft.authorName.trim() || "メンバー", body: draft.body.trim(), answer: "", status: "未回答", createdAt: now, updatedAt: now }, ...current.questions]
    }));
    setDraft({ ...draft, lineId: "", body: "" });
    setFilter("未回答");
  };

  const patchQuestion = (questionId, patch) => updateProject((current) => ({
    ...current,
    questions: current.questions.map((question) => question.id === questionId ? { ...question, ...patch, updatedAt: new Date().toISOString() } : question)
  }));

  const lineOptions = project.lines.filter((line) => line.kind !== "direction");

  return (
    <div className="production-page-stack questions-workspace">
      <section className="question-composer">
        <header><CircleHelp size={20} /><div><h3>質問を送る</h3><p>作品全体、または台本のセリフを選んで質問できます。</p></div></header>
        <div className="question-composer-fields">
          <label><span>質問者名</span><input value={draft.authorName} placeholder="表示名" onChange={(event) => setDraft((current) => ({ ...current, authorName: event.target.value }))} /></label>
          <label><span>対象のセリフ</span><select value={draft.lineId} onChange={(event) => setDraft((current) => ({ ...current, lineId: event.target.value }))}><option value="">作品全体について</option>{lineOptions.map((line) => <option key={line.id} value={line.id}>{line.chapterTitle} / {line.sceneTitle} / {getCharacterName(project, line.characterId)} / {String(line.order).padStart(3, "0")} {line.text.slice(0, 24)}</option>)}</select></label>
          <label className="wide"><span>質問内容</span><textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label>
        </div>
        <button type="button" className="primary" disabled={!draft.body.trim()} onClick={addQuestion}><MessageSquareText size={16} />質問を登録</button>
      </section>

      <div className="question-status-tabs" role="tablist">
        {["すべて", ...PRODUCTION_QUESTION_STATUSES].map((status) => <button type="button" className={filter === status ? "active" : ""} key={status} onClick={() => setFilter(status)}>{status}<span>{status === "すべて" ? project.questions.length : project.questions.filter((question) => question.status === status).length}</span></button>)}
      </div>

      <div className="question-thread-list">
        {visibleQuestions.map((question) => (
          <article className={`question-thread status-${question.status}`} key={question.id}>
            <header>
              <div><b>{question.authorName}</b><time>{formatDate(question.createdAt, true)}</time></div>
              <div><select value={question.status} onChange={(event) => patchQuestion(question.id, { status: event.target.value })}>{PRODUCTION_QUESTION_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><button type="button" className="icon-button danger-icon" title="質問を削除" onClick={() => {
                if (!confirm("この質問を削除しますか？")) return;
                updateProject((current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }));
              }}><Trash2 size={16} /></button></div>
            </header>
            <QuestionContext project={project} question={question} />
            <p className="question-body">{question.body}</p>
            <label className="question-answer"><span>管理者からの回答</span><textarea value={question.answer} placeholder="回答を入力" onChange={(event) => patchQuestion(question.id, { answer: event.target.value })} /></label>
            <footer>
              <span>最終更新 {formatDate(question.updatedAt, true)}</span>
              <button type="button" className="secondary" disabled={!question.answer.trim()} onClick={() => patchQuestion(question.id, { status: question.status === "解決済み" ? "回答済み" : "解決済み" })}>{question.status === "解決済み" ? "回答済みに戻す" : "解決済みにする"}</button>
            </footer>
          </article>
        ))}
      </div>
      {!visibleQuestions.length && <div className="production-empty-state"><CheckCircle2 size={30} /><b>{filter}の質問はありません</b></div>}
    </div>
  );
}

function ScheduleView({ project, updateProject }) {
  const patchScheduleItem = (itemId, patch) => updateProject((current) => ({
    ...current,
    scheduleItems: current.scheduleItems.map((item) => item.id === itemId ? { ...item, ...patch } : item)
  }));
  const patchAnnouncement = (announcementId, patch) => updateProject((current) => ({
    ...current,
    announcements: current.announcements.map((item) => item.id === announcementId ? { ...item, ...patch } : item)
  }));

  return (
    <div className="production-page-stack schedule-workspace">
      <section className="production-key-dates">
        <label><span>作品全体の収録締切</span><input type="date" value={project.recordingDeadline} onChange={(event) => updateProject({ recordingDeadline: event.target.value })} /></label>
        <label><span>公開予定日</span><input type="date" value={project.releaseDate} onChange={(event) => updateProject({ releaseDate: event.target.value })} /></label>
        <label><span>現在の編集状況</span><select value={project.editingStatus} onChange={(event) => updateProject({ editingStatus: event.target.value })}>{EDITING_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
      </section>

      <section className="schedule-section">
        <header><div><CalendarClock size={20} /><div><h3>制作予定</h3><p>収録、編集、公開までの予定を全員で確認します。</p></div></div><button type="button" className="primary" onClick={() => updateProject((current) => ({ ...current, scheduleItems: [...current.scheduleItems, { id: newId("schedule"), type: "収録", title: "新しい予定", date: "", status: "予定", notes: "" }] }))}><Plus size={16} />予定</button></header>
        <div className="schedule-editor-list">
          {[...project.scheduleItems].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")).map((item) => (
            <article key={item.id}>
              <label><span>日付</span><input type="date" value={item.date} onChange={(event) => patchScheduleItem(item.id, { date: event.target.value })} /></label>
              <label><span>種類</span><select value={item.type} onChange={(event) => patchScheduleItem(item.id, { type: event.target.value })}>{PRODUCTION_SCHEDULE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="schedule-title-field"><span>予定名</span><input value={item.title} onChange={(event) => patchScheduleItem(item.id, { title: event.target.value })} /></label>
              <label><span>状態</span><select value={item.status} onChange={(event) => patchScheduleItem(item.id, { status: event.target.value })}>{PRODUCTION_SCHEDULE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="wide"><span>共有メモ</span><textarea value={item.notes} onChange={(event) => patchScheduleItem(item.id, { notes: event.target.value })} /></label>
              <button type="button" className="icon-button danger-icon" title="予定を削除" onClick={() => updateProject((current) => ({ ...current, scheduleItems: current.scheduleItems.filter((currentItem) => currentItem.id !== item.id) }))}><Trash2 size={16} /></button>
            </article>
          ))}
          {!project.scheduleItems.length && <p className="production-list-empty">制作予定はまだ登録されていません。</p>}
        </div>
      </section>

      <section className="schedule-section announcements-editor">
        <header><div><Megaphone size={20} /><div><h3>メンバー全体へのお知らせ</h3><p>ホームの上部に表示する連絡事項です。</p></div></div><button type="button" className="secondary" onClick={() => updateProject((current) => ({ ...current, announcements: [{ id: newId("announcement"), title: "新しいお知らせ", body: "", priority: "通常", publishedAt: new Date().toISOString() }, ...current.announcements] }))}><Plus size={16} />お知らせ</button></header>
        <div className="announcement-editor-list">
          {project.announcements.map((announcement) => (
            <article className={announcement.priority === "重要" ? "important" : ""} key={announcement.id}>
              <div className="announcement-editor-head">
                <label><span>見出し</span><input value={announcement.title} onChange={(event) => patchAnnouncement(announcement.id, { title: event.target.value })} /></label>
                <label><span>優先度</span><select value={announcement.priority} onChange={(event) => patchAnnouncement(announcement.id, { priority: event.target.value })}><option>通常</option><option>重要</option></select></label>
                <label><span>掲載日</span><input type="date" value={toDateInputValue(announcement.publishedAt)} onChange={(event) => patchAnnouncement(announcement.id, { publishedAt: event.target.value ? `${event.target.value}T09:00:00.000Z` : "" })} /></label>
                <button type="button" className="icon-button danger-icon" title="お知らせを削除" onClick={() => updateProject((current) => ({ ...current, announcements: current.announcements.filter((item) => item.id !== announcement.id) }))}><Trash2 size={16} /></button>
              </div>
              <label><span>本文</span><textarea value={announcement.body} onChange={(event) => patchAnnouncement(announcement.id, { body: event.target.value })} /></label>
            </article>
          ))}
          {!project.announcements.length && <p className="production-list-empty">お知らせはまだありません。</p>}
        </div>
      </section>
    </div>
  );
}

const PAGE_COPY = {
  home: ["ホーム", "収録、確認、質問、締切を作品単位でまとめて確認します。"],
  characters: ["キャラクター", "人物設定、担当声優、セリフ色と収録フォルダーを管理します。"],
  links: ["連絡・共有リンク", "キャラクターごとの収録フォルダーと連絡先をまとめて管理します。"],
  materials: ["素材", "音源とサムネイルを種類別に登録し、その場で確認します。"],
  questions: ["質問", "作品やセリフに紐づく質問と回答状況を共有します。"],
  schedule: ["予定", "収録締切、公開予定、編集状況と全体連絡を管理します。"]
};

export function ProductionWorkspace({
  view,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  updateProject,
  siteUsers = [],
  canEditScript = true,
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
      {view === "home" && <ProductionHome project={project} setActive={setActive} />}
      {view === "characters" && <CharactersView project={project} updateProject={updateProject} siteUsers={siteUsers} canEditScript={canEditScript} />}
      {view === "links" && <LinksView project={project} updateProject={updateProject} />}
      {view === "materials" && <MaterialsView project={project} updateProject={updateProject} />}
      {view === "questions" && <QuestionsView project={project} updateProject={updateProject} />}
      {view === "schedule" && <ScheduleView project={project} updateProject={updateProject} />}
    </div>
  );
}
