import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManualAccentPattern,
  buildRetakeMarkedSegments,
  normalizeRetakeInstructions,
  parseManualAccentNotation
} from "../src/lib/retake.js";

test("restores a retake mark by its quoted text after the script moves", () => {
  const [instruction] = normalizeRetakeInstructions([{
    id: "retake_1",
    quote: "泥雨",
    start: 0,
    end: 2,
    category: "アクセント",
    instruction: "自然に下げる"
  }], "この街の泥雨の中で");

  assert.equal(instruction.start, 4);
  assert.equal(instruction.end, 6);
  assert.equal(instruction.quote, "泥雨");
});

test("builds marked and unmarked text segments without changing the script", () => {
  const text = "この街の泥雨の中で";
  const segments = buildRetakeMarkedSegments(text, [{
    id: "retake_1",
    quote: "泥雨",
    start: 4,
    end: 6,
    instruction: "読みを修正"
  }]);

  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(
    segments.map((segment) => [segment.text, segment.marked]),
    [["この街の", false], ["泥雨", true], ["の中で", false]]
  );
});

test("builds Japanese pitch levels for flat and drop accents", () => {
  const flat = buildManualAccentPattern("どろあめ", 0);
  assert.deepEqual(flat.morae, ["ど", "ろ", "あ", "め"]);
  assert.deepEqual(flat.levels, ["low", "high", "high", "high"]);
  assert.equal(flat.label, "平板");
  assert.equal(flat.instruction, "2拍目「ろ」で上がり、そのまま高く（下がりなし）");

  const middleDrop = buildManualAccentPattern("どろあめ", 2);
  assert.deepEqual(middleDrop.levels, ["low", "high", "low", "low"]);
  assert.equal(middleDrop.dropAfter, 1);
  assert.equal(middleDrop.notation, "どろ＼あめ");
  assert.equal(middleDrop.instruction, "2拍目「ろ」で上がり、2拍目「ろ」の後で下がる");

  const laterDrop = buildManualAccentPattern("はらせない", 3);
  assert.equal(laterDrop.instruction, "2拍目「ら」で上がり、3拍目「せ」の後で下がる");

  const customRise = buildManualAccentPattern("はらせない", 4, 3);
  assert.deepEqual(customRise.levels, ["low", "low", "high", "high", "low"]);
  assert.equal(customRise.instruction, "3拍目「せ」で上がり、4拍目「な」の後で下がる");
});

test("parses dictionary-style manual accent notation", () => {
  assert.deepEqual(parseManualAccentNotation("どろ＼あめ"), {
    reading: "どろあめ",
    accentType: 2,
    notation: "どろ＼あめ"
  });
  assert.deepEqual(parseManualAccentNotation("キョウ\\ト"), {
    reading: "キョウト",
    accentType: 2,
    notation: "キョウ＼ト"
  });
  assert.deepEqual(parseManualAccentNotation("どろあめ"), {
    reading: "どろあめ",
    accentType: 0,
    notation: "どろあめ"
  });
});

test("keeps a custom rise position and supplies the former default for older instructions", () => {
  const [legacy, custom] = normalizeRetakeInstructions([{
    quote: "晴らせない",
    reading: "はらせない",
    accentType: 3
  }, {
    quote: "晴らせない",
    reading: "はらせない",
    accentType: 4,
    accentRiseAt: 3
  }], "晴らせない");

  assert.equal(legacy.accentRiseAt, 2);
  assert.equal(custom.accentRiseAt, 3);
});
