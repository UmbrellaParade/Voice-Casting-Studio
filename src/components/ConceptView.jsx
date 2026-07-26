import React, { useEffect, useMemo, useState } from "react";
import { Heart, Save, Sparkles } from "lucide-react";
import { normalizeStudioConcept } from "../lib/core.js";
import { SectionTitle } from "./ui.jsx";

export function ConceptView({ concept = {}, canEdit = false, onSave = () => {}, showTitle = true }) {
  const normalized = useMemo(
    () => normalizeStudioConcept(concept),
    [concept?.title, concept?.tagline, concept?.body, concept?.principles]
  );
  const [draft, setDraft] = useState(normalized);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(normalized);
  }, [normalized]);

  const normalizedDraft = normalizeStudioConcept(draft);
  const isDirty = JSON.stringify(normalizedDraft) !== JSON.stringify(normalized);
  const hasContent = Boolean(normalized.body.trim() || normalized.tagline.trim() || normalized.principles.trim());

  const patchDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const save = () => {
    onSave(normalizedDraft);
    setMessage("コンセプトを保存しました。メンバーにも同じ内容が表示されます。");
  };

  return (
    <div className="view-stack concept-page">
      {showTitle && (
        <SectionTitle
          title="コンセプト"
          subtitle="Umbrella Paradeが大切にしている考えを、参加メンバー全員で共有します。"
        />
      )}

      <section className="concept-hero" aria-labelledby="concept-brand-title">
        <div className="concept-hero-mark"><Sparkles size={23} /></div>
        <div>
          <p>OUR CONCEPT</p>
          <h2 id="concept-brand-title">{normalized.title}</h2>
          {normalized.tagline && <strong>{normalized.tagline}</strong>}
        </div>
      </section>

      <div className="concept-content-layout">
        <section className="concept-statement">
          <header><Sparkles size={20} /><h3>コンセプト</h3></header>
          {normalized.body ? <p>{normalized.body}</p> : <p className="concept-empty">コンセプトは準備中です。</p>}
        </section>

        <section className="concept-principles">
          <header><Heart size={20} /><h3>大切にしていること</h3></header>
          {normalized.principles ? <p>{normalized.principles}</p> : <p className="concept-empty">内容は準備中です。</p>}
        </section>
      </div>

      {canEdit && (
        <section className="concept-editor panel">
          <header>
            <div><Sparkles size={20} /><div><h3>コンセプトを編集</h3><p>入力中は自動保存せず、「保存」を押した時に全員へ反映します。</p></div></div>
          </header>
          <div className="concept-editor-fields">
            <label><span>団体名</span><input value={draft.title} onChange={(event) => patchDraft("title", event.target.value)} /></label>
            <label><span>一言で表すコンセプト</span><input value={draft.tagline} placeholder="短い言葉で活動の軸を伝えます" onChange={(event) => patchDraft("tagline", event.target.value)} /></label>
            <label className="wide"><span>コンセプト本文</span><textarea rows="7" value={draft.body} placeholder="Umbrella Paradeが目指していることや、作品づくりへの考えを書きます。" onChange={(event) => patchDraft("body", event.target.value)} /></label>
            <label className="wide"><span>大切にしていること</span><textarea rows="5" value={draft.principles} placeholder="メンバーと共有したい価値観や姿勢を書きます。" onChange={(event) => patchDraft("principles", event.target.value)} /></label>
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
