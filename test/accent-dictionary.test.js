import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAccentNotation,
  buildOjadWordSearchUrl,
  describeAccentType,
  getAccentDictionaryShardId,
  katakanaToHiragana,
  lookupAccentDictionary,
  normalizeAccentDictionaryQuery,
  normalizeAccentResearchResult,
  OJAD_HOME_URL,
  parseAccentTypes,
  splitJapaneseMora
} from "../src/lib/accent-dictionary.js";

test("normalizes a pasted accent dictionary query", () => {
  assert.equal(normalizeAccentDictionaryQuery("  泥沼\n  の  "), "泥沼 の");
});

test("builds a Japanese OJAD word-search URL", () => {
  const url = buildOjadWordSearchUrl("雨");
  assert.match(url, /^https:\/\/www\.gavo\.t\.u-tokyo\.ac\.jp\/ojad\/jpn\/search\/index\//);
  assert.ok(url.endsWith(`/word:${encodeURIComponent("雨")}`));
});

test("falls back to the OJAD home page for an empty query", () => {
  assert.equal(buildOjadWordSearchUrl("  "), OJAD_HOME_URL);
});

test("splits Japanese readings into morae", () => {
  assert.deepEqual(splitJapaneseMora("キョウ"), ["キョ", "ウ"]);
  assert.deepEqual(splitJapaneseMora("アッキ"), ["ア", "ッ", "キ"]);
  assert.deepEqual(splitJapaneseMora("パーティー"), ["パ", "ー", "ティ", "ー"]);
});

test("converts katakana to hiragana without changing other characters", () => {
  assert.equal(katakanaToHiragana("アツギー13"), "あつぎー13");
});

test("parses and labels UniDic accent types", () => {
  assert.deepEqual(parseAccentTypes("1,0,1"), [1, 0]);
  assert.equal(describeAccentType(0, 3), "平板型");
  assert.equal(describeAccentType(1, 3), "頭高型");
  assert.equal(describeAccentType(2, 3), "中高型");
  assert.equal(describeAccentType(3, 3), "尾高型");
});

test("builds the red-drop notation model", () => {
  assert.deepEqual(buildAccentNotation("アツギ", 0), {
    morae: ["ア", "ツ", "ギ"],
    accentType: 0,
    dropAfter: -1,
    flat: true,
    label: "平板型"
  });
  assert.equal(buildAccentNotation("アッキ", 1).dropAfter, 0);
});

test("uses stable dictionary shard ids", () => {
  assert.equal(getAccentDictionaryShardId("雨"), getAccentDictionaryShardId("雨"));
  assert.match(getAccentDictionaryShardId("厚木"), /^\d{2}$/);
});

test("looks up exact and kana-indexed dictionary entries", async () => {
  const payloads = new Map();
  const exactId = getAccentDictionaryShardId("厚木");
  const readingId = getAccentDictionaryShardId("~あつぎ");
  payloads.set(`https://example.test/accent-dictionary/shard-${exactId}.json`, {
    version: 1,
    entries: { "厚木": [["アツギ", "0", 12, ""]] }
  });
  payloads.set(`https://example.test/accent-dictionary/shard-${readingId}.json`, {
    version: 1,
    entries: { "~あつぎ": [["アツギ", "0", 12, "厚木"]] }
  });
  const fetcher = async (url) => ({ ok: true, json: async () => payloads.get(url) });

  const exact = await lookupAccentDictionary("厚木", { fetcher, assetBaseUrl: "https://example.test/" });
  const reading = await lookupAccentDictionary("アツギ", { fetcher, assetBaseUrl: "https://example.test/" });
  assert.deepEqual(exact[0], {
    pronunciation: "アツギ",
    accentTypes: [0],
    pos: "地名",
    label: "厚木"
  });
  assert.equal(reading[0].label, "厚木");
});

test("normalizes web accent research and removes unsafe or duplicate sources", () => {
  const result = normalizeAccentResearchResult({
    result: {
      query: " 雨 ",
      found: true,
      confidence: "medium",
      summary: "  複数の資料を確認  ",
      candidates: [
        { label: "天候", reading: "アメ", notation: "ア＼メ", accentType: "頭高型（1型）", usage: "雨天の雨" },
        { label: "", reading: "", notation: "", accentType: "", usage: "除外される候補" }
      ],
      sources: [
        { title: "資料A", url: "https://example.com/accent" },
        { title: "重複", url: "https://example.com/accent" },
        { title: "危険", url: "javascript:alert(1)" }
      ]
    }
  });

  assert.equal(result.query, "雨");
  assert.equal(result.found, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].notation, "ア＼メ");
  assert.deepEqual(result.sources, [{ title: "資料A", url: "https://example.com/accent" }]);
});

test("does not mark a web result found without an accent candidate", () => {
  const result = normalizeAccentResearchResult({ found: true, confidence: "unknown", candidates: [] }, "固有語");
  assert.equal(result.found, false);
  assert.equal(result.confidence, "low");
  assert.equal(result.query, "固有語");
});
