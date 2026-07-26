import React, { useEffect, useMemo, useState } from "react";
import { Heart, Save, Sparkles, Telescope } from "lucide-react";
import { normalizeStudioConcept } from "../lib/core.js";
import { SectionTitle } from "./ui.jsx";

export function ConceptView({ concept = {}, canEdit = false, onSave = () => {}, showTitle = true }) {
  const normalized = useMemo(
    () => normalizeStudioConcept(concept),
    [concept?.title, concept?.tagline, concept?.body, concept?.vision, concept?.principles]
  );
  const [draft, setDraft] = useState(normalized);
  const [message, setMessage] = useState("");
  const [activeReadingSection, setActiveReadingSection] = useState("body");
  const [activeEditorSection, setActiveEditorSection] = useState("body");

  useEffect(() => {
    setDraft(normalized);
  }, [normalized]);

  const normalizedDraft = normalizeStudioConcept(draft);
  const isDirty = JSON.stringify(normalizedDraft) !== JSON.stringify(normalized);
  const hasContent = Boolean(normalized.body.trim() || normalized.tagline.trim() || normalized.vision.trim() || normalized.principles.trim());

  const patchDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const save = () => {
    onSave(normalizedDraft);
    setMessage("コンセプト・ビジョンを保存しました。メンバーにも同じ内容が表示されます。");
  };

  const editorSections = [
    { key: "body", label: "コンセプト", rows: 7, placeholder: "Umbrella Paradeが大切にしている考えや、作品づくりの軸を書きます。" },
    { key: "vision", label: "ビジョン", rows: 7, placeholder: "今後どのような団体・作品・未来を目指していくかを書きます。" },
    { key: "principles", label: "大切にしていること", rows: 7, placeholder: "メンバーと共有したい価値観や姿勢を書きます。" }
  ];
  const readingSections = [
    { key: "body", label: "コンセプト", Icon: Sparkles, empty: "コンセプトは準備中です。", className: "concept-statement" },
    { key: "vision", label: "ビジョン", Icon: Telescope, empty: "ビジョンは準備中です。", className: "concept-vision" },
    { key: "principles", label: "大切にしていること", Icon: Heart, empty: "内容は準備中です。", className: "concept-principles" }
  ];
  const activeEditor = editorSections.find((section) => section.key === activeEditorSection) || editorSections[0];
  const activeReading = readingSections.find((section) => section.key === activeReadingSection) || readingSections[0];
  const ActiveReadingIcon = activeReading.Icon;

  return (
    <div className="view-stack concept-page">
      {showTitle && (
        <SectionTitle
          title="コンセプト・ビジョン"
          subtitle="Umbrella Paradeが大切にしている考えと目指す未来を、参加メンバー全員で共有します。"
        />
      )}

      <section className="concept-hero" aria-labelledby="concept-brand-title">
        <div className="concept-hero-mark"><Sparkles size={23} /></div>
        <div>
          <p>OUR CONCEPT &amp; VISION</p>
          <h2 id="concept-brand-title">{normalized.title}</h2>
          {normalized.tagline && <strong>{normalized.tagline}</strong>}
        </div>
      </section>

      <div className="concept-content-layout">
        <div className="concept-reader-tabs" role="tablist" aria-label="共有内容を選ぶ">
          {readingSections.map(({ key, label, Icon }) => (
            <button type="button" role="tab" id={`concept-reader-tab-${key}`} aria-controls={`concept-reader-panel-${key}`} aria-selected={activeReading.key === key} className={activeReading.key === key ? "active" : ""} key={key} onClick={() => setActiveReadingSection(key)}><Icon size={17} />{label}</button>
          ))}
        </div>
        <section className={`concept-reader-panel ${activeReading.className}`} id={`concept-reader-panel-${activeReading.key}`} role="tabpanel" aria-labelledby={`concept-reader-tab-${activeReading.key}`}>
          <header><ActiveReadingIcon size={20} /><h3>{activeReading.label}</h3></header>
          {normalized[activeReading.key] ? <p>{normalized[activeReading.key]}</p> : <p className="concept-empty">{activeReading.empty}</p>}
        </section>
      </div>

      {canEdit && (
        <section className="concept-editor panel">
          <header>
            <div><Sparkles size={20} /><div><h3>コンセプト・ビジョンを編集</h3><p>項目をタブで切り替え、「保存」を押した時に全員へ反映します。</p></div></div>
          </header>
          <div className="concept-editor-fields">
            <label><span>団体名</span><input value={draft.title} onChange={(event) => patchDraft("title", event.target.value)} /></label>
            <label><span>一言で表すコンセプト</span><input value={draft.tagline} placeholder="短い言葉で活動の軸を伝えます" onChange={(event) => patchDraft("tagline", event.target.value)} /></label>
            <div className="concept-editor-copy wide">
              <div className="concept-editor-tabs" role="tablist" aria-label="編集する内容">
                {editorSections.map((section) => (
                  <button type="button" role="tab" aria-selected={activeEditor.key === section.key} className={activeEditor.key === section.key ? "active" : ""} key={section.key} onClick={() => setActiveEditorSection(section.key)}>{section.label}</button>
                ))}
              </div>
              <label><span>{activeEditor.label}</span><textarea rows={activeEditor.rows} value={draft[activeEditor.key]} placeholder={activeEditor.placeholder} onChange={(event) => patchDraft(activeEditor.key, event.target.value)} /></label>
            </div>
          </div>
          <footer>
            <span className={message ? "saved" : ""}>{message || (isDirty ? "未保存の変更があります。" : hasContent ? "保存済みです。" : "内容を入力してください。")}</span>
            <button type="button" className="primary" disabled={!isDirty} onClick={save}><Save size={16} />保存</button>
          </footer>
        </section>
      )}
    </div>
  );
}
