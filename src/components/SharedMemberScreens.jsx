// 声優さん用の共有ページ（Apps Script経由）で台本以外の内容を見せる画面。
// WordPress版が使う画面には手を入れずに済むよう、専用のコンポーネントとCSSに閉じている。
import React from "react";
import {
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  Folder,
  Link2,
  Megaphone,
  Music4,
  UserRound
} from "lucide-react";
import "../shared-member.css";

const formatDate = (date = "", time = "") => {
  const trimmed = String(date || "").trim();
  if (!trimmed) return "日付未定";
  const parts = trimmed.split("-");
  const label = parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日` : trimmed;
  return time ? `${label} ${time}` : label;
};

const isUsableUrl = (url = "") => /^https?:\/\//i.test(String(url).trim());

function EmptyState({ icon, title, hint }) {
  return (
    <div className="vcsm-empty">
      {icon}
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function SharedMemberNav({ active, onSelect, counts = {} }) {
  const items = [
    { key: "script", label: "台本", icon: <FileText size={15} /> },
    { key: "characters", label: "キャラクター", icon: <UserRound size={15} />, count: counts.characters },
    { key: "materials", label: "素材", icon: <Music4 size={15} />, count: counts.materials },
    { key: "links", label: "共有リンク", icon: <Link2 size={15} />, count: counts.links },
    { key: "schedule", label: "予定", icon: <CalendarDays size={15} />, count: counts.schedule },
    { key: "tasks", label: "タスク", icon: <ClipboardList size={15} />, count: counts.tasks }
  ];
  return (
    <nav className="vcsm-nav" aria-label="共有ページの表示切り替え">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? "active" : ""}
          onClick={() => onSelect(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.count > 0 && <i>{item.count}</i>}
        </button>
      ))}
    </nav>
  );
}

export function SharedCharacters({ project, viewer }) {
  const characters = project.characters || [];
  const castMembers = project.castMembers || [];
  const assigned = new Set(viewer?.characterIds || []);
  if (!characters.length) {
    return <EmptyState icon={<UserRound size={26} />} title="登場人物がまだ登録されていません" />;
  }
  return (
    <div className="vcsm-character-grid">
      {characters.map((character) => {
        const actors = castMembers
          .filter((member) => (member.characterIds || []).includes(character.id))
          .map((member) => member.actorName)
          .filter(Boolean);
        const mine = assigned.has(character.id);
        return (
          <article key={character.id} className={`vcsm-character-card${mine ? " mine" : ""}`} style={{ "--character-color": character.color || "#5f6d7a" }}>
            <div className="vcsm-character-head">
              {character.imageUrl
                ? <img src={character.imageUrl} alt={character.name} loading="lazy" />
                : <div className="vcsm-character-noimage"><UserRound size={22} /></div>}
              <div>
                <b>{character.name}</b>
                {character.scriptName && character.scriptName !== character.name && <small>台本表記：{character.scriptName}</small>}
                {actors.length > 0 && <span className="vcsm-character-actor">{actors.join("・")}</span>}
                {mine && <span className="vcsm-character-badge">担当</span>}
              </div>
            </div>
            {character.profile && <p className="vcsm-character-profile">{character.profile}</p>}
            {character.background && <p className="vcsm-character-background">{character.background}</p>}
            {mine && (
              <div className="vcsm-character-links">
                {isUsableUrl(character.recordingFolderUrl) && (
                  <a href={character.recordingFolderUrl} target="_blank" rel="noreferrer">
                    <Folder size={14} />収録フォルダー<ExternalLink size={12} />
                  </a>
                )}
                {isUsableUrl(character.openChatUrl) && (
                  <a href={character.openChatUrl} target="_blank" rel="noreferrer">
                    <Link2 size={14} />連絡先<ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function SharedMaterials({ project }) {
  const materials = project.materials || [];
  if (!materials.length) {
    return <EmptyState icon={<Music4 size={26} />} title="素材はまだ共有されていません" hint="主題歌やBGM、効果音が登録されるとここに出ます。" />;
  }
  const categories = [...new Set(materials.map((item) => item.category || "その他"))];
  return (
    <div className="vcsm-section-stack">
      {categories.map((category) => (
        <section key={category} className="vcsm-panel">
          <h3><Music4 size={16} />{category}</h3>
          <ul className="vcsm-list">
            {materials.filter((item) => (item.category || "その他") === category).map((item) => (
              <li key={item.id}>
                <div>
                  <b>{item.title || "名称未設定"}</b>
                  {item.notes && <small>{item.notes}</small>}
                </div>
                {isUsableUrl(item.url)
                  ? <a href={item.url} target="_blank" rel="noreferrer">開く<ExternalLink size={12} /></a>
                  : <span className="vcsm-list-muted">URL未設定</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SharedLinks({ project }) {
  const links = project.sharedLinks || [];
  if (!links.length) {
    return <EmptyState icon={<Link2 size={26} />} title="共有リンクはまだありません" />;
  }
  return (
    <div className="vcsm-link-grid">
      {links.map((link) => (
        <a
          key={link.id}
          className="vcsm-link-card"
          style={{ "--link-color": link.color || "#5f6d7a" }}
          href={isUsableUrl(link.url) ? link.url : undefined}
          target="_blank"
          rel="noreferrer"
        >
          <b>{link.title}</b>
          {link.notes && <small>{link.notes}</small>}
          <span><ExternalLink size={13} />開く</span>
        </a>
      ))}
    </div>
  );
}

export function SharedSchedule({ project }) {
  const announcements = project.announcements || [];
  const deadlines = project.deadlineItems || [];
  const schedules = project.scheduleItems || [];
  if (!announcements.length && !deadlines.length && !schedules.length) {
    return <EmptyState icon={<CalendarDays size={26} />} title="予定はまだ登録されていません" />;
  }
  const renderItems = (items) => (
    <ul className="vcsm-list">
      {items.map((item) => (
        <li key={item.id}>
          <div>
            <b>{item.title}</b>
            {item.notes && <small>{item.notes}</small>}
          </div>
          <div className="vcsm-schedule-meta">
            <span className="vcsm-date">{formatDate(item.date, item.time)}</span>
            {item.type && <em>{item.type}</em>}
            {item.status && <em className={`vcsm-status status-${item.status}`}>{item.status}</em>}
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="vcsm-section-stack">
      {announcements.length > 0 && (
        <section className="vcsm-panel">
          <h3><Megaphone size={16} />お知らせ</h3>
          <ul className="vcsm-list">
            {announcements.map((item) => (
              <li key={item.id}>
                <div>
                  <b>{item.priority === "重要" ? `【重要】${item.title}` : item.title}</b>
                  {item.body && <small>{item.body}</small>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {deadlines.length > 0 && (
        <section className="vcsm-panel">
          <h3><CalendarDays size={16} />締切</h3>
          {renderItems(deadlines)}
        </section>
      )}
      {schedules.length > 0 && (
        <section className="vcsm-panel">
          <h3><CalendarDays size={16} />予定</h3>
          {renderItems(schedules)}
        </section>
      )}
    </div>
  );
}

export function SharedTasks({ project }) {
  const tasks = project.tasks || [];
  if (!tasks.length) {
    return <EmptyState icon={<ClipboardList size={26} />} title="タスクはまだ登録されていません" />;
  }
  return (
    <section className="vcsm-panel">
      <h3><ClipboardList size={16} />制作タスク</h3>
      <ul className="vcsm-list">
        {tasks.map((task) => (
          <li key={task.id} className={task.completed ? "done" : ""}>
            <div>
              <b>{task.title}</b>
              {task.notes && <small>{task.notes}</small>}
            </div>
            <div className="vcsm-schedule-meta">
              {task.dueDate && <span className="vcsm-date">{formatDate(task.dueDate)}</span>}
              {task.priority && <em>{task.priority}</em>}
              <em className={task.completed ? "vcsm-status status-完了" : "vcsm-status status-予定"}>
                {task.completed ? "完了" : "未完了"}
              </em>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
