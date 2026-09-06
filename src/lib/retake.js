import { splitJapaneseMora } from "./accent-dictionary.js";

export const RETAKE_INSTRUCTION_CATEGORIES = Object.freeze([
  "アクセント",
  "イントネーション",
  "読み方",
  "間",
  "感情",
  "その他"
]);

const clampInteger = (value, min, max, fallback = min) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const normalizeInlineText = (value = "", maxLength = 500) => String(value || "")
  .normalize("NFC")
  .replace(/\r\n?/g, "\n")
  .trim()
  .slice(0, maxLength);

const normalizeMultilineText = (value = "", maxLength = 2000) => String(value || "")
  .normalize("NFC")
  .replace(/\r\n?/g, "\n")
  .replace(/\n{4,}/g, "\n\n\n")
  .trim()
  .slice(0, maxLength);

const findInstructionRange = (plainText, quote, requestedStart, requestedEnd) => {
  const text = String(plainText || "");
  if (!quote || !text) return { start: -1, end: -1 };
  const start = clampInteger(requestedStart, 0, text.length, -1);
  const end = clampInteger(requestedEnd, 0, text.length, -1);
  if (start >= 0 && end > start && text.slice(start, end) === quote) return { start, end };
  const foundStart = text.indexOf(quote);
  return foundStart >= 0
    ? { start: foundStart, end: foundStart + quote.length }
    : { start: -1, end: -1 };
};

export const normalizeRetakeInstruction = (instruction = {}, index = 0, plainText = "") => {
  const quote = normalizeInlineText(instruction.quote || instruction.targetText, 500);
  const range = findInstructionRange(plainText, quote, instruction.start, instruction.end);
  const reading = normalizeInlineText(instruction.reading, 160);
  const moraCount = splitJapaneseMora(reading).length;
  const requestedAccentType = Number.parseInt(instruction.accentType, 10);
  const accentType = reading
    ? (Number.isInteger(requestedAccentType) && requestedAccentType >= 0 && requestedAccentType <= moraCount
      ? requestedAccentType
      : 0)
    : null;
  const defaultRiseAt = accentType === 1 ? 1 : Math.min(2, Math.max(1, moraCount));
  const requestedRiseAt = Number.parseInt(instruction.accentRiseAt, 10);
  const accentRiseAt = reading
    ? (Number.isInteger(requestedRiseAt) && requestedRiseAt >= 1 && requestedRiseAt <= moraCount
      ? (accentType > 0 ? Math.min(requestedRiseAt, accentType) : requestedRiseAt)
      : defaultRiseAt)
    : null;
  return {
    id: String(instruction.id || `retake_instruction_${index + 1}`),
    quote,
    start: range.start,
    end: range.end,
    category: RETAKE_INSTRUCTION_CATEGORIES.includes(instruction.category)
      ? instruction.category
      : "その他",
    instruction: normalizeMultilineText(instruction.instruction || instruction.note),
    reading,
    accentType,
    accentRiseAt,
    createdAt: String(instruction.createdAt || ""),
    updatedAt: String(instruction.updatedAt || "")
  };
};

export const normalizeRetakeInstructions = (instructions = [], plainText = "") => (
  Array.isArray(instructions) ? instructions : []
).filter((instruction) => instruction && typeof instruction === "object")
  .map((instruction, index) => normalizeRetakeInstruction(instruction, index, plainText))
  .filter((instruction) => instruction.quote || instruction.instruction || instruction.reading)
  .slice(0, 20);

export const buildRetakeMarkedSegments = (plainText = "", instructions = []) => {
  const text = String(plainText || "");
  if (!text) return [];
  const normalized = normalizeRetakeInstructions(instructions, text)
    .filter((instruction) => instruction.start >= 0 && instruction.end > instruction.start);
  const boundaries = new Set([0, text.length]);
  normalized.forEach((instruction) => {
    boundaries.add(instruction.start);
    boundaries.add(instruction.end);
  });
  const points = [...boundaries].sort((left, right) => left - right);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const instructionIds = normalized
      .filter((instruction) => instruction.start < end && instruction.end > start)
      .map((instruction) => instruction.id);
    return {
      text: text.slice(start, end),
      start,
      end,
      marked: instructionIds.length > 0,
      instructionIds
    };
  }).filter((segment) => segment.text);
};

export const buildManualAccentPattern = (reading = "", accentType = 0, accentRiseAt = null) => {
  const morae = splitJapaneseMora(normalizeInlineText(reading, 160));
  const normalizedAccentType = clampInteger(accentType, 0, morae.length, 0);
  const defaultRiseAt = normalizedAccentType === 1 ? 1 : Math.min(2, Math.max(1, morae.length));
  const requestedRiseAt = clampInteger(accentRiseAt, 1, Math.max(1, morae.length), defaultRiseAt);
  const riseAt = normalizedAccentType > 0
    ? Math.min(requestedRiseAt, normalizedAccentType)
    : requestedRiseAt;
  const levels = morae.map((_, index) => (
    index + 1 >= riseAt && (normalizedAccentType === 0 || index + 1 <= normalizedAccentType)
      ? "high"
      : "low"
  ));
  const riseInstruction = riseAt === 1
    ? `1拍目「${morae[0]}」から高く`
    : `${riseAt}拍目「${morae[riseAt - 1]}」で上がり`;
  return {
    morae,
    levels,
    accentType: normalizedAccentType,
    riseAt,
    dropAfter: normalizedAccentType > 0 ? normalizedAccentType - 1 : -1,
    label: normalizedAccentType === 0 ? "平板" : `${normalizedAccentType}拍目の後で下がる`,
    instruction: morae.length
      ? (normalizedAccentType > 0
        ? `${riseInstruction}、${normalizedAccentType}拍目「${morae[normalizedAccentType - 1]}」の後で下がる`
        : `${riseInstruction}、そのまま高く（下がりなし）`)
      : "",
    notation: normalizedAccentType === 0
      ? morae.join("")
      : `${morae.slice(0, normalizedAccentType).join("")}＼${morae.slice(normalizedAccentType).join("")}`
  };
};

export const parseManualAccentNotation = (value = "") => {
  const normalized = normalizeInlineText(value, 160).replace(/\s+/g, "");
  const markerIndex = normalized.search(/[＼\\￥]/);
  const reading = normalized.replace(/[＼\\￥]/g, "");
  const moraCount = splitJapaneseMora(reading).length;
  const accentType = markerIndex > 0
    ? Math.min(splitJapaneseMora(normalized.slice(0, markerIndex)).length, moraCount)
    : 0;
  return {
    reading,
    accentType,
    notation: buildManualAccentPattern(reading, accentType).notation
  };
};
