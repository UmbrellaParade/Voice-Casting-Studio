import { getRecordingDisplayProject } from "./recording.js";
import {
  AUDITION_AUDIOBOOK_REFERENCE_NOTICE,
  AUDITION_AUDIOBOOK_REFERENCE_URL,
  AUDITION_AUDIO_USE_NOTICE,
  AUDITION_EARLY_CLOSING_NOTICE,
  AUDITION_FRIENDLY_CLOSING,
  AUDITION_RECORDING_SPEC_TEXT,
  AUDITION_SOCIAL_HASHTAGS,
  createDefaultAuditionSocialTemplate,
  normalizeAuditionSocialTemplate,
  normalizeAuditionSocialPostText
} from "./audition-copy.js";

export {
  AUDITION_AUDIOBOOK_REFERENCE_NOTICE,
  AUDITION_AUDIOBOOK_REFERENCE_URL,
  AUDITION_AUDIO_USE_NOTICE,
  AUDITION_EARLY_CLOSING_NOTICE,
  AUDITION_FRIENDLY_CLOSING,
  AUDITION_RECORDING_SPEC_TEXT,
  AUDITION_SOCIAL_HASHTAGS,
  createDefaultAuditionSocialTemplate,
  normalizeAuditionSocialTemplate,
  normalizeAuditionSocialPostText
};

export const getAuditionDisplayRoleName = (value) => {
  const original = String(value || "").normalize("NFKC").trim();
  if (!original) return "";
  const displayName = original.replace(/(?:\s*(?:\([^()]*\)|（[^（）]*）))+\s*$/u, "").trim();
  return displayName || original;
};

export const getAuditionRoleDescription = (value) => {
  const original = String(value || "").normalize("NFKC").trim();
  const match = original.match(/(?:\(([^()]*)\)|（([^（）]*)）)\s*$/u);
  const role = String(match?.[1] || match?.[2] || "").trim();
  if (!role) return "";
  if (/[。！？!?]$/u.test(role)) return role;
  if (/役(?:です|になります)$/u.test(role)) return `${role}。`;
  if (/役$/u.test(role)) return `${role}です。`;
  return `${role}の役です。`;
};

export const DEFAULT_AUDITION_DEADLINE_TIME = "23:59";

export const getAuditionDeadlineParts = (value = "") => {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/u);
  return {
    date: match?.[1] || "",
    time: match?.[2] || DEFAULT_AUDITION_DEADLINE_TIME
  };
};

export const buildAuditionDeadlineValue = (date = "", time = DEFAULT_AUDITION_DEADLINE_TIME) => {
  const normalizedDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalizedDate)) return "";
  const normalizedTime = /^\d{2}:\d{2}$/u.test(String(time || "").trim())
    ? String(time).trim()
    : DEFAULT_AUDITION_DEADLINE_TIME;
  return `${normalizedDate}T${normalizedTime}`;
};

export const buildXPostIntentUrl = (text = "") => {
  const url = new URL("https://x.com/intent/post");
  const postText = String(text ?? "");
  if (postText) url.searchParams.set("text", postText);
  return url.toString();
};

const withJapaneseQuote = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("「") && text.endsWith("」") ? text : `「${text}」`;
};

export const formatAuditionDeadline = (value) => {
  const source = String(value || "").trim();
  if (!source) return "";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()}（${weekdays[date.getDay()]}）${hour}:${minute}まで`;
};

export const getAuditionLineCandidateDetails = (project = {}, characterId = "") => {
  const seen = new Set();
  const lines = getRecordingDisplayProject(project).lines || [];
  return lines
    .filter((line) => line.kind !== "direction" && (!characterId || line.characterId === characterId))
    .map((line, index) => ({
      id: String(line.id || `audition_line_${index}`),
      characterId: String(line.characterId || ""),
      text: String(line.text || "").replace(/\s+/gu, " ").trim(),
      chapterId: String(line.chapterId || ""),
      chapterTitle: String(line.chapterTitle || "章未設定"),
      sceneId: String(line.sceneId || ""),
      sceneTitle: String(line.sceneTitle || "シーン未設定"),
      performanceType: String(line.performanceType || "通常"),
      order: Number(line.order ?? index)
    }))
    .filter((candidate) => {
      const key = `${candidate.characterId}\u0000${candidate.text}`;
      if (!candidate.text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getAuditionLineCandidates = (project = {}, characterId = "", limit = 2) =>
  getAuditionLineCandidateDetails(project, characterId)
    .map((candidate) => candidate.text)
    .slice(0, Math.max(1, Number(limit) || 2));

export const getAuditionApplicantGenderGuidance = ({
  acceptsFemaleApplicants = true,
  acceptsMaleApplicants = true
} = {}) => {
  if (acceptsFemaleApplicants && !acceptsMaleApplicants) {
    return "※男性の応募はご遠慮ください";
  }
  if (acceptsMaleApplicants && !acceptsFemaleApplicants) {
    return "※女性の応募はご遠慮ください";
  }
  if (acceptsFemaleApplicants && acceptsMaleApplicants) {
    return "※女性・男性どちらもご応募いただけます";
  }
  return "";
};

export const buildAuditionSocialPost = ({
  workTitle = "Umbrella Parade",
  roleName = "",
  roleSummary = "",
  auditionLines = "",
  deadline = "",
  formUrl = "",
  acceptsFemaleApplicants = true,
  acceptsMaleApplicants = true,
  template = {}
} = {}) => {
  const socialTemplate = normalizeAuditionSocialTemplate(template);
  const normalizedWorkTitle = String(workTitle || "Umbrella Parade").trim();
  const applyTemplateVariables = (value) => String(value || "")
    .replace(/\{\{作品名\}\}/gu, normalizedWorkTitle)
    .trim();
  const displayRoleName = getAuditionDisplayRoleName(roleName) || "募集役";
  const summary = String(roleSummary || "").trim() || getAuditionRoleDescription(roleName);
  const lines = (Array.isArray(auditionLines) ? auditionLines : String(auditionLines || "").split(/\r?\n/u))
    .map(withJapaneseQuote)
    .filter(Boolean);
  const deadlineText = formatAuditionDeadline(deadline) || "締切日時を追記してください";
  const rawFormLink = String(formUrl || "").trim();
  const formLink = /^https:\/\/(?:www\.)?x\.com\/compose\/post(?:\?|$)/iu.test(rawFormLink)
    ? "応募フォームURLを追記してください"
    : rawFormLink || "応募フォームURLを追記してください";
  const genderGuidance = getAuditionApplicantGenderGuidance({
    acceptsFemaleApplicants,
    acceptsMaleApplicants
  });
  const summaryAlreadyHasGuidance = (
    acceptsFemaleApplicants && !acceptsMaleApplicants
      ? /(?:女性(?:の方)?のみ.{0,16}応募|男性の応募はご遠慮)/u.test(summary)
      : acceptsMaleApplicants && !acceptsFemaleApplicants
        ? /(?:男性(?:の方)?のみ.{0,16}応募|女性の応募はご遠慮)/u.test(summary)
        : acceptsFemaleApplicants && acceptsMaleApplicants
          ? /(?:女性.{0,8}男性|男性.{0,8}女性).{0,20}(?:どちらも|いずれも|ともに|両方|応募可能|ご応募)/u.test(summary)
          : false
  );
  const roleParagraph = [
    `今回募集するのは、${displayRoleName}という役です。`,
    summary,
    summaryAlreadyHasGuidance ? "" : genderGuidance
  ].filter(Boolean).join("\n");
  const lineBlock = lines.length ? lines.join("\n") : "オーディション用セリフを追記してください";

  return normalizeAuditionSocialPostText([
    applyTemplateVariables(socialTemplate.introductionText),
    roleParagraph,
    AUDITION_AUDIOBOOK_REFERENCE_NOTICE,
    applyTemplateVariables(socialTemplate.unpaidNoticeText),
    applyTemplateVariables(socialTemplate.audioUseNoticeText),
    applyTemplateVariables(socialTemplate.applicationConditionsText),
    `【オーディション用セリフ】\n下記のセリフを全て以下の形式で、フォームよりお送りください。\n\n${AUDITION_RECORDING_SPEC_TEXT}\n\n〇セリフ\n${lineBlock}`,
    `【応募締め切り】\n${deadlineText}\n${AUDITION_EARLY_CLOSING_NOTICE}`,
    `下記フォームより、お申し込みください。\n${formLink}`,
    applyTemplateVariables(socialTemplate.resultNoticeText),
    applyTemplateVariables(socialTemplate.closingText),
    applyTemplateVariables(socialTemplate.hashtagsText)
  ].filter(Boolean).join("\n\n"), {
    ensureFriendlyClosing: false,
    ensureVoiceDramaHashtag: false
  });
};
