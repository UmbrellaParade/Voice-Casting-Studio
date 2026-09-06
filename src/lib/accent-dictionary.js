export const OJAD_HOME_URL = "https://www.gavo.t.u-tokyo.ac.jp/ojad/";
export const UNIDIC_HOME_URL = "https://clrd.ninjal.ac.jp/unidic/";
export const ACCENT_DICTIONARY_VERSION = "UniDic 2.1.2";

const OJAD_WORD_SEARCH_BASE = `${OJAD_HOME_URL}jpn/search/index/`
  + "sortprefix:accent/"
  + "narabi1:kata_asc/"
  + "narabi2:accent_asc/"
  + "narabi3:mola_asc/"
  + "yure:visible/"
  + "curve:visible/"
  + "details:invisible/"
  + "limit:20/word:";

const ACCENT_DICTIONARY_SHARD_COUNT = 64;
const SMALL_KANA = new Set(Array.from("ァィゥェォャュョヮぁぃぅぇぉゃゅょゎ"));
const KANA_QUERY_PATTERN = /^[ぁ-ゖァ-ヺーゝゞヽヾ]+$/u;

export const ACCENT_POS_LABELS = Object.freeze([
  "名詞",
  "動詞",
  "形容詞",
  "副詞",
  "連体詞",
  "接続詞",
  "感動詞",
  "代名詞",
  "接頭辞",
  "接尾辞",
  "助詞",
  "助動詞",
  "地名",
  "人名",
  "固有名詞",
  "その他"
]);

const shardCache = new Map();

export const normalizeAccentDictionaryQuery = (value = "") => String(value)
  .normalize("NFKC")
  .replace(/[\r\n\t]+/g, " ")
  .replace(/\s{2,}/g, " ")
  .trim()
  .slice(0, 80);

const normalizeResearchText = (value = "", maxLength = 500) => String(value || "")
  .normalize("NFC")
  .replace(/\r\n?/g, "\n")
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim()
  .slice(0, maxLength);

const normalizeResearchUrl = (value = "") => {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

export const normalizeAccentResearchResult = (payload = {}, fallbackQuery = "") => {
  const source = payload?.result && typeof payload.result === "object" ? payload.result : payload;
  const confidence = ["high", "medium", "low"].includes(source?.confidence)
    ? source.confidence
    : "low";
  const candidates = (Array.isArray(source?.candidates) ? source.candidates : [])
    .map((candidate) => ({
      label: normalizeResearchText(candidate?.label, 100),
      reading: normalizeResearchText(candidate?.reading, 100),
      notation: normalizeResearchText(candidate?.notation, 120),
      accentType: normalizeResearchText(candidate?.accentType, 80),
      usage: normalizeResearchText(candidate?.usage, 260)
    }))
    .filter((candidate) => candidate.reading || candidate.notation || candidate.accentType)
    .slice(0, 5);
  const seenUrls = new Set();
  const sources = (Array.isArray(source?.sources) ? source.sources : [])
    .map((item) => ({
      title: normalizeResearchText(item?.title, 160),
      url: normalizeResearchUrl(item?.url)
    }))
    .filter((item) => {
      if (!item.url || seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .slice(0, 8);

  return {
    query: normalizeAccentDictionaryQuery(source?.query || fallbackQuery),
    found: Boolean(source?.found) && candidates.length > 0,
    summary: normalizeResearchText(source?.summary, 800),
    confidence,
    candidates,
    sources,
    note: normalizeResearchText(source?.note, 500),
    searchedAt: normalizeResearchText(source?.searchedAt || payload?.searchedAt, 80)
  };
};

export const buildOjadWordSearchUrl = (value = "") => {
  const query = normalizeAccentDictionaryQuery(value);
  return query ? `${OJAD_WORD_SEARCH_BASE}${encodeURIComponent(query)}` : OJAD_HOME_URL;
};

export const katakanaToHiragana = (value = "") => Array.from(String(value)).map((character) => {
  const codePoint = character.codePointAt(0);
  return codePoint >= 0x30a1 && codePoint <= 0x30f6
    ? String.fromCodePoint(codePoint - 0x60)
    : character;
}).join("");

export const splitJapaneseMora = (value = "") => Array.from(String(value)).reduce((morae, character) => {
  if (SMALL_KANA.has(character) && morae.length) {
    morae[morae.length - 1] += character;
  } else {
    morae.push(character);
  }
  return morae;
}, []);

export const parseAccentTypes = (value = "") => [...new Set(
  String(value)
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= 0)
)];

export const describeAccentType = (accentType, moraCount) => {
  if (accentType === 0) return "平板型";
  if (accentType === 1) return "頭高型";
  if (accentType === moraCount) return "尾高型";
  if (accentType > 1 && accentType < moraCount) return "中高型";
  return `アクセント核 ${accentType}`;
};

export const buildAccentNotation = (pronunciation = "", accentType = 0) => {
  const morae = splitJapaneseMora(pronunciation);
  const dropAfter = accentType > 0 && accentType <= morae.length ? accentType - 1 : -1;
  return {
    morae,
    accentType,
    dropAfter,
    flat: accentType === 0,
    label: describeAccentType(accentType, morae.length)
  };
};

export const getAccentDictionaryShardId = (value = "") => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash & (ACCENT_DICTIONARY_SHARD_COUNT - 1)).padStart(2, "0");
};

const getRuntimeAssetBaseUrl = () => {
  const configured = String(globalThis.VoiceCastingStudio?.assetBaseUrl || "").trim();
  if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
  const viteBase = String(import.meta.env?.BASE_URL || "/");
  return viteBase.endsWith("/") ? viteBase : `${viteBase}/`;
};

export const buildAccentDictionaryShardUrl = (lookupKey, assetBaseUrl = getRuntimeAssetBaseUrl()) => {
  const base = String(assetBaseUrl || "/");
  return `${base.endsWith("/") ? base : `${base}/`}accent-dictionary/shard-${getAccentDictionaryShardId(lookupKey)}.json`;
};

const loadShard = async (lookupKey, fetcher, assetBaseUrl) => {
  const url = buildAccentDictionaryShardUrl(lookupKey, assetBaseUrl);
  if (!shardCache.has(url)) {
    shardCache.set(url, Promise.resolve(fetcher(url, { cache: "force-cache" })).then(async (response) => {
      if (!response?.ok) throw new Error(`Accent dictionary shard could not be loaded (${response?.status || "network"}).`);
      const payload = await response.json();
      return payload?.entries && typeof payload.entries === "object" ? payload.entries : {};
    }).catch((error) => {
      shardCache.delete(url);
      throw error;
    }));
  }
  return shardCache.get(url);
};

const decodeDictionaryEntry = (rawEntry, searchedQuery) => {
  if (!Array.isArray(rawEntry) || rawEntry.length < 3) return null;
  const pronunciation = String(rawEntry[0] || "").trim();
  const accentTypes = parseAccentTypes(rawEntry[1]);
  if (!pronunciation || !accentTypes.length) return null;
  const posCode = Number.parseInt(rawEntry[2], 10);
  return {
    pronunciation,
    accentTypes,
    pos: ACCENT_POS_LABELS[posCode] || ACCENT_POS_LABELS.at(-1),
    label: String(rawEntry[3] || searchedQuery).trim() || searchedQuery
  };
};

export const lookupAccentDictionary = async (value, options = {}) => {
  const searchedQuery = normalizeAccentDictionaryQuery(value);
  if (!searchedQuery) return [];
  const fetcher = options.fetcher || globalThis.fetch?.bind(globalThis);
  if (!fetcher) throw new Error("Fetch is not available.");

  const lookupKeys = [searchedQuery];
  if (KANA_QUERY_PATTERN.test(searchedQuery)) {
    lookupKeys.push(`~${katakanaToHiragana(searchedQuery)}`);
  }

  const shards = await Promise.all(lookupKeys.map((lookupKey) => loadShard(
    lookupKey,
    fetcher,
    options.assetBaseUrl
  )));
  const results = [];
  const signatures = new Set();

  lookupKeys.forEach((lookupKey, index) => {
    const rawEntries = Array.isArray(shards[index]?.[lookupKey]) ? shards[index][lookupKey] : [];
    rawEntries.forEach((rawEntry) => {
      const entry = decodeDictionaryEntry(rawEntry, searchedQuery);
      if (!entry) return;
      const signature = [entry.pronunciation, entry.accentTypes.join(","), entry.pos, entry.label].join("|");
      if (signatures.has(signature)) return;
      signatures.add(signature);
      results.push(entry);
    });
  });

  return results.slice(0, 24);
};

export const clearAccentDictionaryCache = () => shardCache.clear();
