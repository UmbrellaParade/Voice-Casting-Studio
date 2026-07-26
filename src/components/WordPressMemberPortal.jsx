import React, { useEffect, useMemo, useState } from "react";
import "../member.css";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FileAudio,
  FileText,
  FolderOpen,
  Home,
  Link,
  LogOut,
  Megaphone,
  MessageSquareText,
  Music2,
  RefreshCw,
  Sparkles,
  Users
} from "lucide-react";
import { getGoogleDriveFileId, isWebUrl, makeDirectAudioDownloadUrl, makeGoogleDrivePreviewUrl, makeImagePreviewUrl } from "../lib/core.js";
import { getCharacterImageCropStyle, getCharacterName, getRecordingDisplayProject, getRecordingProgress, parseRubyText, partitionCharactersByScript } from "../lib/recording.js";
import { PersistentAudioButton } from "./PersistentAudioPlayer.jsx";
import { ConceptView } from "./ConceptView.jsx";
import { ManualView } from "./ManualView.jsx";
import { Header, SectionTitle } from "./ui.jsx";
import { getScriptSceneAnchorId, ScriptSceneToc } from "./ScriptSceneToc.jsx";

const MEMBER_NAV = [
  ["home", "ホーム", Home],
  ["concept", "コンセプト", Sparkles],
  ["script", "台本", FileText],
  ["characters", "キャラクター", Users],
  ["links", "共有リンク", Link],
  ["materials", "素材", Music2],
  ["questions", "質問", MessageSquareText],
  ["schedule", "予定", CalendarDays],
  ["manual", "マニュアル", BookOpen]
];

const formatDate = (value) => {
  if (!value) return "未設定";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ja-JP");
};

const makeTint = (color = "#5f6d7a", alpha = 0.09) => {
  const value = String(color).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(95, 109, 122, ${alpha})`;
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
};

const getPlaybackUrl = (url = "") => getGoogleDriveFileId(url) ? makeDirectAudioDownloadUrl(url) : url;

const withHonorific = (name = "メンバー") => /(?:さん|様|さま|氏)$/.test(name) ? name : `${name}さん`;

function RubyText({ text = "" }) {
  return <>{parseRubyText(text).map((part, index) => part.type === "ruby" ? <ruby key={`${part.base}-${index}`}>{part.base}<rp>（</rp><rt>{part.reading}</rt><rp>）</rp></ruby> : <React.Fragment key={`text-${index}`}>{part.text}</React.Fragment>)}</>;
}

function AudioPlayer({ url, label = "録音" }) {
  if (!url) return <span className="member-audio-empty"><FileAudio size={15} />未提出</span>;
  const drivePreviewUrl = makeGoogleDrivePreviewUrl(url);
  if (drivePreviewUrl) {
    return (
      <div className="member-drive-audio-player">
        <iframe title={`${label}を再生`} src={drivePreviewUrl} loading="lazy" allow="autoplay" />
        <a href={url} target="_blank" rel="noreferrer" title={`${label}をGoogle Driveで開く`}><ExternalLink size={15} /></a>
      </div>
    );
  }
  return (
    <div className="member-audio-player">
      <audio controls preload="none" src={getPlaybackUrl(url)} />
      <a href={url} target="_blank" rel="noreferrer" title={`${label}をGoogle Driveで開く`}><ExternalLink size={15} /></a>
    </div>
  );
}

const getChapters = (lines = []) => {
  const chapters = [];
  const byChapter = new Map();
  lines.forEach((line) => {
    let chapter = byChapter.get(line.chapterId);
    if (!chapter) {
      chapter = { id: line.chapterId, title: line.chapterTitle, lines: [], scenes: [], byScene: new Map() };
      byChapter.set(line.chapterId, chapter);
      chapters.push(chapter);
    }
    chapter.lines.push(line);
    let scene = chapter.byScene.get(line.sceneId);
    if (!scene) {
      scene = { id: line.sceneId, title: line.sceneTitle, lines: [] };
      chapter.byScene.set(line.sceneId, scene);
      chapter.scenes.push(scene);
    }
    scene.lines.push(line);
  });
  return chapters.map(({ byScene, ...chapter }) => chapter);
};

function MemberProjectBar({ projects, project, setProjectId, runtime, connectionState, onRefresh }) {
  return (
    <div className="member-project-bar">
      <label><span>担当作品</span><select value={project.id} onChange={(event) => setProjectId(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <div>
        <span className={`member-sync-state ${connectionState.status}`}>{connectionState.message}</span>
        <button type="button" className="icon-button" title="最新状況を読み込む" onClick={onRefresh}><RefreshCw size={16} /></button>
        {runtime.logoutUrl && <a className="icon-button" href={runtime.logoutUrl} title="ログアウト"><LogOut size={16} /></a>}
      </div>
    </div>
  );
}

function MemberHome({ project, assignedCharacterIds, setActive }) {
  const assignedLines = project.lines.filter((line) => line.kind !== "direction" && assignedCharacterIds.has(line.characterId));
  const progress = getRecordingProgress({ ...project, lines: assignedLines });
  const unreviewed = assignedLines.filter((line) => line.actorStatus !== "未収録" && ["未確認", "確認中"].includes(line.reviewStatus));
  const retakes = assignedLines.filter((line) => line.reviewStatus === "リテイク");
  const questions = project.questions.filter((question) => question.status !== "解決済み" && (!question.characterId || assignedCharacterIds.has(question.characterId)));
  const schedule = project.scheduleItems.filter((item) => item.status !== "完了").sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  return (
    <div className="production-page-stack member-home">
      <div className="production-metrics-grid">
        <button type="button" className="production-metric" onClick={() => setActive("script")}><CheckCircle2 size={20} /><span>担当セリフ収録済み</span><strong>{progress.recorded}/{progress.total}</strong><small>{progress.recordedPercent}%</small></button>
        <button type="button" className={`production-metric ${unreviewed.length ? "attention" : ""}`} onClick={() => setActive("script")}><FileAudio size={20} /><span>確認待ち</span><strong>{unreviewed.length}</strong><small>提出済み録音</small></button>
        <button type="button" className={`production-metric ${retakes.length ? "danger" : ""}`} onClick={() => setActive("script")}><RefreshCw size={20} /><span>リテイク</span><strong>{retakes.length}</strong><small>再提出が必要</small></button>
        <button type="button" className={`production-metric ${questions.length ? "attention" : ""}`} onClick={() => setActive("questions")}><CircleHelp size={20} /><span>対応中の質問</span><strong>{questions.length}</strong><small>未回答・回答済み</small></button>
      </div>
      <div className="production-home-grid">
        <section className="panel production-dashboard-section announcements"><header><div><Megaphone size={19} /><h3>お知らせ</h3></div></header><div className="production-dashboard-list compact">{project.announcements.map((item) => <article className={item.priority === "重要" ? "important" : ""} key={item.id}><div><b>{item.title}</b><span>{formatDate(item.publishedAt)}</span></div><p>{item.body}</p></article>)}{!project.announcements.length && <p className="production-list-empty">お知らせはありません。</p>}</div></section>
        <section className="panel production-dashboard-section"><header><div><CalendarDays size={19} /><h3>直近の予定</h3></div></header><div className="production-dashboard-list compact">{schedule.slice(0, 6).map((item) => <article key={item.id}><div><b>{item.title}</b><span>{formatDate(item.date)}</span></div><p>{item.type} / {item.status}{item.notes ? ` / ${item.notes}` : ""}</p></article>)}{!schedule.length && <p className="production-list-empty">予定はありません。</p>}</div></section>
      </div>
    </div>
  );
}

function MemberLine({ project, line, editable, onSave }) {
  const character = project.characters.find((item) => item.id === line.characterId);
  const [actorStatus, setActorStatus] = useState(line.actorStatus);
  const [state, setState] = useState({ busy: false, message: "" });
  useEffect(() => setActorStatus(line.actorStatus), [line.actorStatus]);
  const toggleRecorded = async (checked) => {
    const previousStatus = actorStatus;
    const nextStatus = checked
      ? (line.reviewStatus === "リテイク" ? "再提出済み" : "収録済み")
      : "未収録";
    setActorStatus(nextStatus);
    setState({ busy: true, message: "保存中…" });
    try {
      await onSave(line.id, { actorStatus: nextStatus }, {
        id: line.id,
        derivedFromManualBody: Boolean(line.derivedFromManualBody),
        sourceLineId: line.sourceLineId || "",
        characterId: line.characterId,
        chapterId: line.chapterId,
        sceneId: line.sceneId,
        performanceType: line.performanceType || "通常"
      });
      setState({ busy: false, message: "保存済み" });
    } catch (error) {
      setActorStatus(previousStatus);
      setState({ busy: false, message: error.message });
    }
  };
  return (
    <article className={`member-script-line${editable ? " assigned" : " context"}${line.kind === "direction" ? " direction" : ""}${line.derivedFromManualBody ? " derived-manual-line" : ""}`} style={{ "--character-color": character?.color || "#5f6d7a", "--character-background": makeTint(character?.color) }}>
      <header><span>{String(line.displayOrder ?? line.order).padStart(3, "0")}</span><b>{line.kind === "direction" ? "ト書き" : character?.name || "話者未設定"}{line.kind !== "direction" && line.performanceType && line.performanceType !== "通常" && <em className="line-performance-badge">{line.performanceType}</em>}</b>{line.kind !== "direction" && <div><span>{actorStatus}</span><span>{line.reviewStatus}</span></div>}</header>
      <p><RubyText text={line.text} /></p>
      {line.direction && <small>{line.direction}</small>}
      {line.derivedFromManualBody && <small className="derived-manual-note">章本文から表示</small>}
      {editable && line.kind !== "direction" && (
        <div className="member-line-submission simple-check">
          {line.recordingUrl && <AudioPlayer url={line.recordingUrl} label={`${character?.name || "担当"}の録音`} />}
          {line.directorNote && <p className="member-director-note"><b>{line.reviewStatus === "リテイク" ? "リテイク内容" : "確認メモ"}</b>{line.directorNote}</p>}
          <label className="member-recorded-check"><input type="checkbox" checked={actorStatus !== "未収録"} disabled={state.busy} onChange={(event) => toggleRecorded(event.target.checked)} /><span>このセリフは収録済み</span></label>
          <span className={`member-recorded-save-state${state.message && !state.busy && state.message !== "保存済み" ? " error" : ""}`}>{state.message}</span>
        </div>
      )}
    </article>
  );
}

function MemberScript({ project, assignedCharacterIds, onUpdateLine }) {
  const displayProject = useMemo(() => getRecordingDisplayProject(project), [project]);
  const chapters = useMemo(() => getChapters(displayProject.lines), [displayProject.lines]);
  const [chapterId, setChapterId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [characterIds, setCharacterIds] = useState([]);
  const chapter = chapters.find((item) => item.id === chapterId);
  const characterScopeLines = displayProject.lines.filter((line) => {
    if (sceneId && line.sceneId !== sceneId) return false;
    if (!sceneId && chapterId && line.chapterId !== chapterId) return false;
    return true;
  });
  const scopedLines = characterScopeLines.filter((line) => {
    if (characterIds.length && line.kind !== "direction" && !characterIds.includes(line.characterId)) return false;
    return !characterIds.length || line.kind !== "direction";
  });
  const visibleChapters = getChapters(scopedLines);
  const tocChapter = chapterId && !sceneId
    ? visibleChapters.find((item) => item.id === chapterId)
    : null;
  const tocScopeId = `member-${project.id}-${chapterId || "all"}`;
  const availableCharacters = displayProject.characters.filter((character) => characterScopeLines.some((line) => line.kind !== "direction" && line.characterId === character.id));
  const toggleCharacter = (id) => setCharacterIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectChapter = (id) => { setChapterId(id); setSceneId(""); setCharacterIds([]); };
  return (
    <div className="production-page-stack member-script-workspace">
      <div className="script-scope-picker">
        <div className="script-scope-heading"><FileText size={19} /><span>表示する範囲</span></div>
        <div className="script-chapter-options"><button type="button" className={!chapterId ? "active" : ""} onClick={() => selectChapter("")}><strong>ボイスドラマ脚本全文</strong><small>{chapters.length}章</small></button>{chapters.map((item) => <button type="button" className={chapterId === item.id ? "active" : ""} key={item.id} onClick={() => selectChapter(item.id)}><strong>{item.title}</strong><small>{item.scenes.length}シーン / {item.lines.filter((line) => line.kind !== "direction").length}セリフ</small></button>)}</div>
        {chapter && <div className="script-scene-scope"><div className="script-scene-scope-heading"><span>{chapter.title}</span><small>シーンを選択</small></div><div className="script-scene-options"><button type="button" className={!sceneId ? "active" : ""} onClick={() => setSceneId("")}><strong>章の全文</strong><small>{chapter.lines.filter((line) => line.kind !== "direction").length}セリフ</small></button>{chapter.scenes.map((scene) => <button type="button" className={sceneId === scene.id ? "active" : ""} key={scene.id} onClick={() => setSceneId(scene.id)}><strong>{scene.title}</strong><small>{scene.lines.filter((line) => line.kind !== "direction").length}セリフ</small></button>)}</div></div>}
      </div>
      <div className="member-character-filter"><button type="button" className={!characterIds.length ? "active" : ""} onClick={() => setCharacterIds([])}>全文</button>{availableCharacters.map((character) => <button type="button" className={characterIds.includes(character.id) ? "active" : ""} style={{ "--character-color": character.color }} key={character.id} onClick={() => toggleCharacter(character.id)}><i />{character.name}</button>)}</div>
      <div className={`script-board-layout${tocChapter?.scenes.length > 1 ? " has-scene-toc" : ""}`}>
        <ScriptSceneToc scenes={tocChapter?.scenes || []} scopeId={tocScopeId} />
        <div className="script-chapters">
          {visibleChapters.map((chapterGroup) => (
            <details className="member-chapter" key={chapterGroup.id} open>
              <summary><strong>{chapterGroup.title}</strong><small>{chapterGroup.scenes.length}シーン</small></summary>
              {chapterGroup.scenes.map((scene) => (
                <details id={getScriptSceneAnchorId(tocScopeId, scene.id)} className="member-scene" key={scene.id} open>
                  <summary><strong>{scene.title}</strong><span>{scene.lines.filter((line) => line.kind !== "direction").length}セリフ</span></summary>
                  <div className="member-line-list">{scene.lines.map((line) => <MemberLine key={line.id} project={displayProject} line={line} editable={assignedCharacterIds.has(line.characterId)} onSave={(lineId, patch, context) => onUpdateLine(project.id, lineId, patch, context)} />)}</div>
                </details>
              ))}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberCharacters({ project, assignedCharacterIds }) {
  const { linkedCharacters } = partitionCharactersByScript(project);
  return (
    <div className="member-character-grid">
      {linkedCharacters.map((character) => (
        <article key={character.id} style={{ "--character-color": character.color }}>
          <div className="member-character-image">{character.imageUrl ? <img src={makeImagePreviewUrl(character.imageUrl) || character.imageUrl} alt={character.name} style={getCharacterImageCropStyle(character)} /> : <Users size={32} />}</div>
          <div>
            <header><h3>{character.name}</h3>{assignedCharacterIds.has(character.id) && <span>担当</span>}</header>
            {character.profile && <p>{character.profile}</p>}
            {character.background && <details><summary>バックグラウンド</summary><p>{character.background}</p></details>}
            {assignedCharacterIds.has(character.id) && character.recordingFolderUrl && (
              <footer><a href={character.recordingFolderUrl} target="_blank" rel="noreferrer"><FolderOpen size={16} />収録フォルダー</a></footer>
            )}
          </div>
        </article>
      ))}
      {!linkedCharacters.length && <div className="production-empty-state"><Users size={30} /><b>現在の台本に登場するキャラクターはいません</b></div>}
    </div>
  );
}

function MemberSharedLink({ icon: Icon, label, detail, url }) {
  const canOpen = isWebUrl(url);
  const body = <><Icon size={19} /><span><b>{label}</b><small>{detail}</small></span></>;
  return canOpen ? (
    <a className="member-shared-link" href={url} target="_blank" rel="noreferrer">
      {body}<ExternalLink size={16} />
    </a>
  ) : (
    <div className="member-shared-link unavailable">
      {body}<em>未登録</em>
    </div>
  );
}

function MemberLinks({ project, assignedCharacterIds }) {
  const { linkedCharacters } = partitionCharactersByScript(project);
  const characters = linkedCharacters.filter((character) => assignedCharacterIds.has(character.id));
  const sharedLinks = (project.sharedLinks || []).filter((link) => link.title || link.url);
  return (
    <div className="production-page-stack member-links-page">
      <section className="member-link-section">
        <header><FolderOpen size={20} /><div><h3>収録フォルダー</h3><p>担当キャラクターの録音アップロード先</p></div></header>
        <div className="production-link-list member-link-list">
          {characters.map((character) => (
            <article className="production-link-row" key={character.id} style={{ "--character-color": character.color }}>
              <header className="production-link-character">
                <i />
                <div><h3>{character.name}</h3><span>担当キャラクター</span></div>
              </header>
              <div className="member-shared-link-list">
                <MemberSharedLink icon={FolderOpen} label="収録フォルダー" detail="Google Drive" url={character.recordingFolderUrl} />
              </div>
            </article>
          ))}
          {!characters.length && <div className="production-empty-state"><FolderOpen size={30} /><b>担当キャラクターの収録フォルダーはまだありません</b></div>}
        </div>
      </section>

      <section className="member-link-section">
        <header><Link size={20} /><div><h3>共有URL</h3><p>作品全体の連絡先と共有資料</p></div></header>
        <div className="member-global-link-list">
          {sharedLinks.map((link) => <MemberSharedLink key={link.id} icon={Link} label={link.title || "共有URL"} detail={link.notes || "共有URL"} url={link.url} />)}
          {!sharedLinks.length && <div className="production-empty-state"><Link size={30} /><b>共有URLはまだありません</b></div>}
        </div>
      </section>
    </div>
  );
}

function MemberMaterials({ project }) {
  return <div className="material-library-grid member-materials">{project.materials.map((material) => <article className="material-editor" key={material.id}><header><span className="material-category">{material.category}</span><span>{material.status}</span></header>{material.category === "サムネイル" ? <div className={`material-preview ratio-${material.aspectRatio.replace(":", "-") || "16-9"}`}>{material.url ? <img src={makeImagePreviewUrl(material.url) || material.url} alt={material.title} /> : null}</div> : <PersistentAudioButton material={material} />}<h3>{material.title}</h3>{material.notes && <p>{material.notes}</p>}</article>)}{!project.materials.length && <div className="production-empty-state"><Music2 size={30} /><b>素材はまだありません</b></div>}</div>;
}

function MemberQuestions({ project, assignedCharacterIds, currentUser, onCreateQuestion }) {
  const lines = project.lines.filter((line) => line.kind !== "direction" && assignedCharacterIds.has(line.characterId));
  const questions = project.questions.filter((question) => Number(question.wpUserId) === Number(currentUser.id) || assignedCharacterIds.has(question.characterId));
  const [draft, setDraft] = useState({ lineId: "", body: "" });
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!draft.body.trim()) return;
    setMessage("送信中…");
    try {
      await onCreateQuestion(project.id, draft.lineId, draft.body);
      setDraft({ lineId: "", body: "" });
      setMessage("質問を登録しました。");
    } catch (error) {
      setMessage(error.message);
    }
  };
  return <div className="production-page-stack"><section className="question-composer"><header><CircleHelp size={20} /><div><h3>質問を送る</h3></div></header><div className="question-composer-fields"><label><span>対象のセリフ</span><select value={draft.lineId} onChange={(event) => setDraft((current) => ({ ...current, lineId: event.target.value }))}><option value="">作品全体</option>{lines.map((line) => <option key={line.id} value={line.id}>{line.chapterTitle} / {line.sceneTitle} / {String(line.order).padStart(3, "0")} {line.text.slice(0, 30)}</option>)}</select></label><label className="wide"><span>質問内容</span><textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} /></label></div><div className="member-question-submit"><span>{message}</span><button type="button" className="primary" disabled={!draft.body.trim()} onClick={submit}><MessageSquareText size={16} />登録</button></div></section><div className="question-thread-list">{questions.map((question) => { const line = project.lines.find((item) => item.id === question.lineId); return <article className={`question-thread status-${question.status}`} key={question.id}><header><div><b>{question.authorName}</b><time>{formatDate(question.createdAt)}</time></div><span>{question.status}</span></header>{line && <div className="question-line-context"><span>{line.chapterTitle} / {line.sceneTitle} / {getCharacterName(project, line.characterId)}</span><p><RubyText text={line.text} /></p></div>}<p className="question-body">{question.body}</p>{question.answer && <div className="member-question-answer"><b>管理者からの回答</b><p>{question.answer}</p></div>}</article>; })}{!questions.length && <div className="production-empty-state"><CheckCircle2 size={30} /><b>質問はまだありません</b></div>}</div></div>;
}

function MemberSchedule({ project }) {
  return <div className="production-page-stack"><section className="production-key-dates"><div><span>収録締切</span><strong>{formatDate(project.recordingDeadline)}</strong></div><div><span>公開予定</span><strong>{formatDate(project.releaseDate)}</strong></div><div><span>編集状況</span><strong>{project.editingStatus}</strong></div></section><div className="member-schedule-list">{[...project.scheduleItems].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")).map((item) => <article key={item.id}><time>{formatDate(item.date)}</time><div><span>{item.type} / {item.status}</span><h3>{item.title}</h3>{item.notes && <p>{item.notes}</p>}</div></article>)}</div></div>;
}

export function WordPressMemberPortal({ logoSrc, data, runtime, appTitle = "Voice Cast Studio", connectionState, onRefresh, onUpdateLine, onCreateQuestion }) {
  const projects = data.recordingProjects || [];
  const [active, setActive] = useState("home");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  useEffect(() => { if (!projects.some((item) => item.id === projectId)) setProjectId(projects[0]?.id || ""); }, [projects, projectId]);
  const project = projects.find((item) => item.id === projectId) || projects[0];
  if (connectionState.status === "loading") return <main className="member-portal-loading"><RefreshCw className="spin" size={30} /><b>{connectionState.message}</b></main>;
  if (!project) return <main className="member-portal-loading"><Users size={30} /><b>{connectionState.status === "error" ? connectionState.message : "担当作品がまだ割り当てられていません。"}</b>{runtime.logoutUrl && <a className="secondary" href={runtime.logoutUrl}><LogOut size={16} />ログアウト</a>}</main>;
  const member = project.castMembers.find((item) => Number(item.wpUserId) === Number(runtime.currentUser?.id)) || project.castMembers[0];
  const assignedCharacterIds = new Set(member?.characterIds || []);
  const pageTitle = MEMBER_NAV.find(([key]) => key === active)?.[1] || "ホーム";
  const pageSubtitle = active === "concept"
    ? "Umbrella Paradeが大切にしている考えを共有します。"
    : `${withHonorific(runtime.currentUser?.name || member?.actorName)} / ${project.title}`;
  return (
    <main className="app-shell member-portal-shell">
      <Header logoSrc={logoSrc} title={appTitle} />
      <nav className="app-nav" aria-label="Main navigation">{MEMBER_NAV.map(([key, label, Icon]) => <button type="button" className={active === key ? "active" : ""} key={key} onClick={() => setActive(key)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <section className="content-panel view-stack">
        <SectionTitle title={pageTitle} subtitle={pageSubtitle} />
        {active !== "concept" && <MemberProjectBar projects={projects} project={project} setProjectId={setProjectId} runtime={runtime} connectionState={connectionState} onRefresh={onRefresh} />}
        {active === "home" && <MemberHome project={project} assignedCharacterIds={assignedCharacterIds} setActive={setActive} />}
        {active === "concept" && <ConceptView concept={data.studioConcept} showTitle={false} />}
        {active === "script" && <MemberScript project={project} assignedCharacterIds={assignedCharacterIds} onUpdateLine={onUpdateLine} />}
        {active === "characters" && <MemberCharacters project={project} assignedCharacterIds={assignedCharacterIds} />}
        {active === "links" && <MemberLinks project={project} assignedCharacterIds={assignedCharacterIds} />}
        {active === "materials" && <MemberMaterials project={project} />}
        {active === "questions" && <MemberQuestions project={project} assignedCharacterIds={assignedCharacterIds} currentUser={runtime.currentUser || {}} onCreateQuestion={onCreateQuestion} />}
        {active === "schedule" && <MemberSchedule project={project} />}
        {active === "manual" && <ManualView viewerRole="actor" showTitle={false} onNavigate={setActive} />}
      </section>
    </main>
  );
}
