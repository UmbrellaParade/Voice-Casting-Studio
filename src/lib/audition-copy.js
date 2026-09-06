export const AUDITION_AUDIO_USE_NOTICE = [
  "【収録音源の使用について】",
  "本作は、アニメ制作を目指す前段階として制作するボイスドラマです。今回ご提出・収録いただく音源は、ボイスドラマ本編に加え、今後制作する同作品のアニメ版でも使用することを前提としています。ご了承いただける方のみご応募ください。"
].join("\n");

export const AUDITION_AUDIOBOOK_REFERENCE_URL = "https://youtu.be/Dt5xU3rGed8";

export const AUDITION_AUDIOBOOK_REFERENCE_NOTICE = [
  "【参考オーディオブック】",
  "作品全体の物語や世界観を知っていただくための参考として、オーディオブックをお聴きいただけます。",
  AUDITION_AUDIOBOOK_REFERENCE_URL,
  "※今回募集する役は、オーディオブックには登場しない、または登場がごくわずかな場合があります。演技見本ではなく、物語の参考としてご利用ください。",
  "",
  "※視聴は必須ではありません。ボイスドラマ版は、この物語をもとに新しい登場人物・場面・セリフを加え、脚本を加筆・再構成するため、オーディオブックと内容は完全に同じではありません。"
].join("\n");

export const AUDITION_RECORDING_SPEC_TEXT = [
  "• 形式: wav形式（モノラル）",
  "• ビットレート: 24bit",
  "• サンプリングレート: 44.1kHz",
  "• ファイル名に氏名（SNS名）を記載"
].join("\n");

export const AUDITION_SOCIAL_HASHTAGS = "#声優募集 #オーディション #ボイスドラマ";

export const AUDITION_FRIENDLY_CLOSING = "一緒に作品をつくってくださる方のご応募をお待ちしています＾＾";

export const AUDITION_EARLY_CLOSING_NOTICE = "※応募状況により、予定より早く募集を締め切る場合があります。";

export const DEFAULT_AUDITION_SOCIAL_TEMPLATE = Object.freeze({
  introductionText: "小説『{{作品名}}』のボイスドラマ化にあたり声優・キャストのオーディションを行います。",
  unpaidNoticeText: "【無償案件】\n本企画は有志による無償プロジェクトとなります。趣旨にご賛同いただける方のみご応募ください。",
  audioUseNoticeText: AUDITION_AUDIO_USE_NOTICE,
  applicationConditionsText: "【応募条件】\n• 収録環境: ノイズ・反響のない環境で収録可能な方\n• 技術: 滑舌ができていること。および標準語アクセントが「日本語発音アクセント辞典」に準じている方",
  resultNoticeText: "【結果発表】\n勝手ながら、今回は合格者のみご連絡させていただきます。",
  closingText: AUDITION_FRIENDLY_CLOSING,
  hashtagsText: AUDITION_SOCIAL_HASHTAGS
});

export const createDefaultAuditionSocialTemplate = () => ({
  ...DEFAULT_AUDITION_SOCIAL_TEMPLATE
});

export const normalizeAuditionSocialTemplate = (value = {}) => {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_AUDITION_SOCIAL_TEMPLATE).map(([key, defaultValue]) => [
    key,
    Object.prototype.hasOwnProperty.call(source, key) ? String(source[key] ?? "") : defaultValue
  ]));
};

export const normalizeAuditionSocialPostText = (value = "", options = {}) => {
  const ensureVoiceDramaHashtag = options.ensureVoiceDramaHashtag !== false;
  const ensureFriendlyClosing = options.ensureFriendlyClosing !== false;
  let text = String(value || "").replace(/\r\n?/gu, "\n");
  if (!text.trim()) return "";

  text = text
    .replace(/^[ \t]*https:\/\/(?:www\.)?x\.com\/compose\/post(?:\?[^\s]*)?[ \t]*$/gimu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  const hasEarlyClosingNotice = /応募状況[^\n]*(?:予定より早く|早期に)[^\n]*(?:締め切|締切)/u.test(text);
  if (!hasEarlyClosingNotice) {
    const deadlineBlock = /(【応募(?:締め切り|締切)】[ \t]*\n[^\n]+)/u;
    if (deadlineBlock.test(text)) {
      text = text.replace(deadlineBlock, `$1\n${AUDITION_EARLY_CLOSING_NOTICE}`);
    }
  }

  const audiobookSection = /【参考オーディオブック】\n[^\n]*\nhttps?:\/\/(?:www\.)?(?:youtu\.be\/Dt5xU3rGed8(?:\?[^\s]*)?|youtube\.com\/watch\?v=Dt5xU3rGed8[^\s]*)\n※[^\n]*(?:\n{1,2}※[^\n]*)?/u;
  if (audiobookSection.test(text)) {
    text = text.replace(audiobookSection, AUDITION_AUDIOBOOK_REFERENCE_NOTICE);
  } else if (!/Dt5xU3rGed8/u.test(text)) {
    const audioUseHeading = /^【収録音源の使用について】$/mu;
    text = audioUseHeading.test(text)
      ? text.replace(audioUseHeading, `${AUDITION_AUDIOBOOK_REFERENCE_NOTICE}\n\n【収録音源の使用について】`)
      : `${text.trimEnd()}\n\n${AUDITION_AUDIOBOOK_REFERENCE_NOTICE}`;
  }

  const has24Bit = /(?:ビットレート|ビット深度)\s*[:：]\s*24\s*bit/iu.test(text);
  if (!has24Bit) {
    const formatLine = /^[ \t]*[•・]\s*形式\s*[:：][^\n]*wav[^\n]*$/imu;
    const samplingLine = /^[ \t]*[•・]\s*サンプリングレート\s*[:：][^\n]*$/imu;
    if (formatLine.test(text)) {
      text = text.replace(formatLine, (line) => `${line}\n• ビットレート: 24bit`);
    } else if (samplingLine.test(text)) {
      text = text.replace(samplingLine, (line) => `• ビットレート: 24bit\n${line}`);
    } else {
      const auditionLinesHeading = /^〇セリフ\s*$/mu;
      text = auditionLinesHeading.test(text)
        ? text.replace(auditionLinesHeading, `• ビットレート: 24bit\n\n〇セリフ`)
        : `${text}\n\n• ビットレート: 24bit`;
    }
  }

  if (ensureVoiceDramaHashtag && !/#ボイスドラマ(?:\s|$)/u.test(text)) {
    const hashtagLine = /^.*(?:#声優募集|#オーディション).*$/mu;
    text = hashtagLine.test(text)
      ? text.replace(hashtagLine, (line) => `${line.trimEnd()} #ボイスドラマ`)
      : `${text.trimEnd()}\n\n#ボイスドラマ`;
  }

  if (ensureFriendlyClosing && !/ご応募.{0,20}お待ちしています/u.test(text)) {
    const hashtagLine = /^.*(?:#声優募集|#オーディション|#ボイスドラマ).*$/mu;
    text = hashtagLine.test(text)
      ? text.replace(hashtagLine, (line) => `${AUDITION_FRIENDLY_CLOSING}\n\n${line}`)
      : `${text.trimEnd()}\n\n${AUDITION_FRIENDLY_CLOSING}`;
  }

  return text;
};
