import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpenText, ExternalLink, Globe2, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import {
  ACCENT_DICTIONARY_VERSION,
  buildAccentNotation,
  buildOjadWordSearchUrl,
  lookupAccentDictionary,
  normalizeAccentDictionaryQuery,
  normalizeAccentResearchResult,
  OJAD_HOME_URL,
  UNIDIC_HOME_URL
} from "../lib/accent-dictionary.js";
import { researchWordPressAccent } from "../lib/wordpress.js";

// UniDicの実装と辞書データは将来の再利用に備えて残し、今はOJADだけを表示する。
const SHOW_UNIDIC_SOURCE = false;
const ENABLE_AI_WEB_ACCENT_RESEARCH = false;

const WEB_CONFIDENCE_LABELS = Object.freeze({
  high: "確度 高",
  medium: "確度 中",
  low: "確度 低"
});

function AccentNotation({ pronunciation, accentType }) {
  const notation = buildAccentNotation(pronunciation, accentType);
  return (
    <div className="accent-notation-row">
      <div
        className="accent-notation-reading"
        aria-label={`${pronunciation}、${notation.label}、${accentType}型`}
      >
        {notation.morae.map((mora, index) => (
          <React.Fragment key={`${mora}-${index}`}>
            <span>{mora}</span>
            {notation.dropAfter === index && <i className="accent-drop-mark" aria-hidden="true">＼</i>}
          </React.Fragment>
        ))}
        {notation.flat && <i className="accent-flat-mark" aria-hidden="true" />}
      </div>
      <span className="accent-type-label">{notation.label}<small>{accentType}型</small></span>
    </div>
  );
}

function AccentResultCard({ result, searchedQuery }) {
  return (
    <article className="accent-result-card">
      <header>
        <div>
          <strong>{result.label || searchedQuery}</strong>
          {result.label !== searchedQuery && <small>検索語: {searchedQuery}</small>}
        </div>
        <span>{result.pos}</span>
      </header>
      <div className="accent-result-pronunciation">{result.pronunciation}</div>
      <div className="accent-notation-list">
        {result.accentTypes.map((accentType) => (
          <AccentNotation
            key={`${result.pronunciation}-${accentType}`}
            pronunciation={result.pronunciation}
            accentType={accentType}
          />
        ))}
      </div>
    </article>
  );
}

function AccentWebResearchPanel({ error, onResearch, result, searchedQuery, status }) {
  const fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${searchedQuery} アクセント 発音 標準語`)}`;

  if (!ENABLE_AI_WEB_ACCENT_RESEARCH) {
    return (
      <section className="accent-web-research accent-web-research-idle" aria-label="Googleアクセント検索">
        <div>
          <Globe2 size={18} />
          <span><b>OJADで見つからない場合</b><small>検索語を入力済みのGoogle検索を開きます。API料金はかかりません。</small></span>
        </div>
        <a className="accent-google-search-button" href={fallbackSearchUrl} target="_blank" rel="noreferrer">
          Googleで検索<ExternalLink size={14} />
        </a>
      </section>
    );
  }

  if (status === "idle") {
    return (
      <section className="accent-web-research accent-web-research-idle" aria-label="Webアクセント検索">
        <div>
          <Globe2 size={18} />
          <span><b>OJADで見つからない場合</b><small>Web全体の公開情報から、読み方とアクセント候補を抜き出します。</small></span>
        </div>
        <button type="button" onClick={onResearch}><Globe2 size={16} />Web全体から調べる</button>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="accent-web-research accent-web-research-state" aria-live="polite">
        <LoaderCircle className="spin" size={23} />
        <span><b>Web全体を調べています</b><small>複数の公開情報を照合して、根拠URLと一緒に整理します。</small></span>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="accent-web-research accent-web-research-error" role="alert">
        <div>
          <AlertTriangle size={19} />
          <span><b>Web検索を完了できませんでした</b><small>{error}</small></span>
        </div>
        <div className="accent-web-research-actions">
          <button type="button" onClick={onResearch}><RefreshCw size={15} />もう一度</button>
          <a href={fallbackSearchUrl} target="_blank" rel="noreferrer">通常検索を開く<ExternalLink size={13} /></a>
        </div>
      </section>
    );
  }

  return (
    <section className="accent-web-research accent-web-research-result" aria-live="polite">
      <header>
        <div>
          <Globe2 size={19} />
          <span><b>Web検索から抽出した結果</b><small>標準語のアクセントを優先して整理</small></span>
        </div>
        <div className="accent-web-research-actions">
          <span className={`accent-web-confidence ${result.confidence}`}>{WEB_CONFIDENCE_LABELS[result.confidence]}</span>
          <button type="button" onClick={onResearch} title="もう一度Web全体を調べる"><RefreshCw size={15} />再検索</button>
        </div>
      </header>
      {result.summary && <p className="accent-web-summary">{result.summary}</p>}
      {result.found ? (
        <div className="accent-web-candidates">
          {result.candidates.map((candidate, index) => (
            <article key={`${candidate.reading}-${candidate.notation}-${index}`}>
              <header>
                <strong>{candidate.label || `${searchedQuery}の候補 ${index + 1}`}</strong>
                {candidate.accentType && <span>{candidate.accentType}</span>}
              </header>
              <div className="accent-web-notation">{candidate.notation || candidate.reading}</div>
              {candidate.notation && candidate.reading && <div className="accent-web-reading">読み: {candidate.reading}</div>}
              {candidate.usage && <p>{candidate.usage}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="accent-web-no-result">
          <AlertTriangle size={19} />
          <span><b>断定できるアクセント情報は見つかりませんでした</b><small>作品固有の名前などは、演出側で読み方とアクセントを指定してください。</small></span>
        </div>
      )}
      {result.note && <p className="accent-web-note">{result.note}</p>}
      {result.sources.length > 0 && (
        <div className="accent-web-sources">
          <b>確認した主な情報源</b>
          <div>
            {result.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.title || new URL(source.url).hostname}<ExternalLink size={12} />
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function AccentDictionarySearch() {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [activeSource, setActiveSource] = useState(SHOW_UNIDIC_SOURCE ? "unidic" : "ojad");
  const [ojadLoading, setOjadLoading] = useState(false);
  const [webStatus, setWebStatus] = useState("idle");
  const [webResult, setWebResult] = useState(null);
  const [webError, setWebError] = useState("");
  const closeButtonRef = useRef(null);
  const requestIdRef = useRef(0);
  const resultUrl = buildOjadWordSearchUrl(searchedQuery);

  useEffect(() => {
    if (!viewerOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [viewerOpen]);

  const runSearch = async (nextQuery) => {
    const normalized = normalizeAccentDictionaryQuery(nextQuery);
    if (!normalized) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setQuery(normalized);
    setSearchedQuery(normalized);
    setResults([]);
    setStatus(SHOW_UNIDIC_SOURCE ? "loading" : "idle");
    setActiveSource(SHOW_UNIDIC_SOURCE ? "unidic" : "ojad");
    setOjadLoading(!SHOW_UNIDIC_SOURCE);
    setWebStatus("idle");
    setWebResult(null);
    setWebError("");
    setViewerOpen(true);
    if (!SHOW_UNIDIC_SOURCE) return;
    try {
      const nextResults = await lookupAccentDictionary(normalized);
      if (requestIdRef.current !== requestId) return;
      setResults(nextResults);
      setStatus(nextResults.length ? "ready" : "empty");
    } catch {
      if (requestIdRef.current !== requestId) return;
      setStatus("error");
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    runSearch(query);
  };

  const showOjad = () => {
    setOjadLoading(true);
    setActiveSource("ojad");
  };

  const runWebResearch = async () => {
    const normalized = normalizeAccentDictionaryQuery(searchedQuery || query);
    if (!normalized || webStatus === "loading") return;
    setWebStatus("loading");
    setWebError("");
    try {
      const payload = await researchWordPressAccent({ query: normalized });
      const normalizedResult = normalizeAccentResearchResult(payload, normalized);
      setWebResult(normalizedResult);
      setWebStatus("ready");
    } catch (requestError) {
      setWebResult(null);
      setWebError(requestError?.message || "時間をおいて、もう一度お試しください。");
      setWebStatus("error");
    }
  };

  return (
    <>
      <aside className="accent-dictionary-rail" aria-label="アクセント辞典検索">
        <div className="accent-dictionary-heading">
          <BookOpenText size={19} />
          <span><b>アクセント辞典</b><small>東京大学 OJAD</small></span>
        </div>
        <form className="accent-dictionary-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="accent-dictionary-query">アクセントを調べる単語</label>
          <input
            id="accent-dictionary-query"
            value={query}
            maxLength={80}
            placeholder="単語を入力"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" className="primary" disabled={!normalizeAccentDictionaryQuery(query)} title="アクセントを検索">
            <Search size={16} /><span>検索</span>
          </button>
        </form>
        {searchedQuery && (
          <button type="button" className="accent-dictionary-last-result" onClick={() => setViewerOpen(true)}>
            <span><small>直前の検索</small><b>{searchedQuery}</b></span>
            <BookOpenText size={15} />
          </button>
        )}
      </aside>

      {viewerOpen && (
        <div className="accent-dictionary-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setViewerOpen(false);
        }}>
          <section className="accent-dictionary-dialog accent-native-dialog accent-ojad-dialog" role="dialog" aria-modal="true" aria-labelledby="accent-dictionary-title">
            <header>
              <div>
                <BookOpenText size={20} />
                <span><b id="accent-dictionary-title">「{searchedQuery}」のアクセント</b><small>{activeSource === "ojad" ? "東京大学 OJAD 公式ページ" : ACCENT_DICTIONARY_VERSION}</small></span>
              </div>
              <div className="accent-dictionary-dialog-actions">
                <button ref={closeButtonRef} type="button" className="icon-button" onClick={() => setViewerOpen(false)} title="閉じる"><X size={19} /></button>
              </div>
            </header>
            <form className="accent-dictionary-dialog-search" onSubmit={submitSearch}>
              <label className="sr-only" htmlFor="accent-dictionary-dialog-query">別の単語を検索</label>
              <input
                id="accent-dictionary-dialog-query"
                value={query}
                maxLength={80}
                placeholder="別の単語を入力"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="primary" disabled={!normalizeAccentDictionaryQuery(query)}><Search size={16} />検索</button>
            </form>
            {SHOW_UNIDIC_SOURCE && (
              <div className="accent-dictionary-source-tabs" role="tablist" aria-label="アクセント辞典の切り替え">
                <button type="button" role="tab" aria-selected={activeSource === "unidic"} className={activeSource === "unidic" ? "active" : ""} onClick={() => setActiveSource("unidic")}>ツール内辞典</button>
                <button type="button" role="tab" aria-selected={activeSource === "ojad"} className={activeSource === "ojad" ? "active" : ""} onClick={showOjad}>東京大学 OJAD</button>
              </div>
            )}
            {SHOW_UNIDIC_SOURCE && activeSource === "unidic" ? (
              <>
                <div className="accent-dictionary-results">
                  {status === "loading" && (
                    <div className="accent-dictionary-state"><LoaderCircle className="spin" size={28} /><b>辞書を検索しています</b></div>
                  )}
                  {status === "ready" && results.map((result, index) => (
                    <AccentResultCard
                      key={`${result.label}-${result.pronunciation}-${result.accentTypes.join("-")}-${index}`}
                      result={result}
                      searchedQuery={searchedQuery}
                    />
                  ))}
                  {(status === "empty" || status === "error") && (
                    <div className="accent-dictionary-state accent-dictionary-empty">
                      <BookOpenText size={30} />
                      <b>{status === "error" ? "辞書データを読み込めませんでした" : "UniDicでは単独語として見つかりませんでした"}</b>
                      <button type="button" onClick={showOjad}><ExternalLink size={16} />OJADで確認</button>
                    </div>
                  )}
                </div>
                <footer className="accent-dictionary-source">
                  <span>アクセント核の直後を赤い線、平板型を語末の横線で表示</span>
                  <a href={UNIDIC_HOME_URL} target="_blank" rel="noreferrer">出典: 国立国語研究所 UniDic <ExternalLink size={12} /></a>
                </footer>
              </>
            ) : (
              <>
                <div className={`accent-dictionary-frame-wrap ${webStatus === "ready" ? "has-web-result" : ""}`}>
                  <div className="accent-ojad-frame-pane">
                    {ojadLoading && <div className="accent-dictionary-loading"><LoaderCircle className="spin" size={26} /><b>OJADを読み込んでいます</b></div>}
                    <iframe
                      key={resultUrl}
                      src={resultUrl || OJAD_HOME_URL}
                      title={`OJADの「${searchedQuery}」検索結果`}
                      allow="autoplay"
                      referrerPolicy="strict-origin-when-cross-origin"
                      onLoad={() => setOjadLoading(false)}
                    />
                  </div>
                  <AccentWebResearchPanel
                    error={webError}
                    onResearch={runWebResearch}
                    result={webResult}
                    searchedQuery={searchedQuery}
                    status={webStatus}
                  />
                </div>
                <footer className="accent-dictionary-source">
                  <span>まずOJADで確認し、見つからない語だけGoogle検索を利用してください。</span>
                  <a href={OJAD_HOME_URL} target="_blank" rel="noreferrer">出典: 東京大学 OJAD <ExternalLink size={12} /></a>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
