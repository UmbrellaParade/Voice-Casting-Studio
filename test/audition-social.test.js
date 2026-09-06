import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDITION_AUDIOBOOK_REFERENCE_NOTICE,
  AUDITION_AUDIOBOOK_REFERENCE_URL,
  AUDITION_AUDIO_USE_NOTICE,
  AUDITION_EARLY_CLOSING_NOTICE,
  AUDITION_FRIENDLY_CLOSING,
  buildAuditionDeadlineValue,
  buildAuditionSocialPost,
  buildXPostIntentUrl,
  createDefaultAuditionSocialTemplate,
  getAuditionDeadlineParts,
  getAuditionApplicantGenderGuidance,
  getAuditionDisplayRoleName,
  getAuditionLineCandidateDetails,
  getAuditionLineCandidates,
  getAuditionRoleDescription,
  normalizeAuditionSocialPostText,
  normalizeAuditionSocialTemplate
} from "../src/lib/audition-social.js";

test("audition line candidates keep chapter, scene, and performance context", () => {
  const project = {
    characters: [{ id: "vel", name: "ヴェル13世", scriptName: "ヴェル" }],
    lines: [
      { id: "line_1", order: 1, chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_1", sceneTitle: "試験会場", characterId: "vel", kind: "dialogue", performanceType: "通常", text: "行こう。" },
      { id: "line_2", order: 2, chapterId: "chapter_1", chapterTitle: "第一章", sceneId: "scene_2", sceneTitle: "控室", characterId: "vel", kind: "dialogue", performanceType: "心の声", text: "  まだ終われない。  " },
      { id: "line_3", order: 3, chapterId: "chapter_2", chapterTitle: "第二章", sceneId: "scene_3", sceneTitle: "街路", characterId: "vel", kind: "dialogue", performanceType: "通常", text: "行こう。" },
      { id: "direction", order: 4, characterId: "vel", kind: "direction", text: "SE：雨" }
    ]
  };

  assert.deepEqual(getAuditionLineCandidateDetails(project, "vel"), [
    {
      id: "line_1",
      characterId: "vel",
      text: "行こう。",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_1",
      sceneTitle: "試験会場",
      performanceType: "通常",
      order: 1
    },
    {
      id: "line_2",
      characterId: "vel",
      text: "まだ終われない。",
      chapterId: "chapter_1",
      chapterTitle: "第一章",
      sceneId: "scene_2",
      sceneTitle: "控室",
      performanceType: "心の声",
      order: 2
    }
  ]);
  assert.deepEqual(getAuditionLineCandidates(project, "vel", 1), ["行こう。"]);
});

test("X post intent keeps the current recruitment text and line breaks", () => {
  const postText = "1行目\n2行目 #声優募集";
  const url = new URL(buildXPostIntentUrl(postText));

  assert.equal(url.origin, "https://x.com");
  assert.equal(url.pathname, "/intent/post");
  assert.equal(url.searchParams.get("text"), postText);
});

test("audition role display name removes only trailing parenthetical aliases", () => {
  assert.equal(getAuditionDisplayRoleName("ダリオ・グレン(観客A)"), "ダリオ・グレン");
  assert.equal(getAuditionDisplayRoleName("ガンズ（ネスト13の住人B）"), "ガンズ");
  assert.equal(getAuditionDisplayRoleName("候補者C"), "候補者C");
});

test("audition role description uses the trailing role label", () => {
  assert.equal(getAuditionRoleDescription("バルガス・ロウ(警備員)"), "警備員の役です。");
  assert.equal(getAuditionRoleDescription("ダリオ・グレン（観客A）"), "観客Aの役です。");
  assert.equal(getAuditionRoleDescription("オルディス・グランベル"), "");
});

test("audition deadlines default to 23:59 when a date is selected", () => {
  assert.deepEqual(getAuditionDeadlineParts(""), { date: "", time: "23:59" });
  assert.equal(buildAuditionDeadlineValue("2026-08-31"), "2026-08-31T23:59");
  assert.deepEqual(getAuditionDeadlineParts("2026-08-31T20:30"), {
    date: "2026-08-31",
    time: "20:30"
  });
});

test("social post follows the Ordis structure and explains later anime use", () => {
  const post = buildAuditionSocialPost({
    roleName: "モーリス・ペック（観客B）",
    roleSummary: "快活な男性の役です。",
    auditionLines: "最初のセリフ\n「二つ目のセリフ」",
    deadline: "2026-08-01T22:00",
    formUrl: "https://docs.google.com/forms/d/e/test/viewform"
  });

  assert.match(post, /今回募集するのは、モーリス・ペックという役です。/u);
  assert.ok(post.includes(AUDITION_AUDIOBOOK_REFERENCE_NOTICE));
  assert.ok(post.includes(AUDITION_AUDIOBOOK_REFERENCE_URL));
  assert.match(post, /作品全体の物語や世界観/u);
  assert.match(post, /演技見本ではなく、物語の参考/u);
  assert.match(post, /登場しない、または登場がごくわずか/u);
  assert.match(post, /視聴は必須ではありません/u);
  assert.match(post, /物語の参考としてご利用ください。\n\n※視聴は必須ではありません/u);
  assert.match(post, /新しい登場人物・場面・セリフ/u);
  assert.match(post, /脚本を加筆・再構成/u);
  assert.ok(post.includes(AUDITION_AUDIO_USE_NOTICE));
  assert.match(post, /アニメ制作を目指す前段階/u);
  assert.match(post, /今後制作する同作品のアニメ版でも使用/u);
  assert.match(post, /「最初のセリフ」\n「二つ目のセリフ」/u);
  assert.match(post, /• 形式: wav形式（モノラル）\n• ビットレート: 24bit\n• サンプリングレート: 44\.1kHz/u);
  assert.match(post, /8\/1（.）22:00まで/u);
  assert.match(post, new RegExp(`8/1（.）22:00まで\\n${AUDITION_EARLY_CLOSING_NOTICE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.match(post, /https:\/\/docs\.google\.com\/forms\/d\/e\/test\/viewform/u);
  assert.match(post, /#声優募集 #オーディション #ボイスドラマ/u);
  assert.ok(post.includes(AUDITION_FRIENDLY_CLOSING));
});

test("audition social templates preserve editable blanks and fill missing defaults", () => {
  const defaults = createDefaultAuditionSocialTemplate();
  const normalized = normalizeAuditionSocialTemplate({
    introductionText: "『{{作品名}}』の特別募集です。",
    closingText: ""
  });

  assert.equal(normalized.introductionText, "『{{作品名}}』の特別募集です。");
  assert.equal(normalized.closingText, "");
  assert.equal(normalized.audioUseNoticeText, defaults.audioUseNoticeText);
  assert.equal(normalized.hashtagsText, defaults.hashtagsText);
});

test("custom audition template changes fixed copy while keeping role fields automatic", () => {
  const post = buildAuditionSocialPost({
    workTitle: "テスト作品",
    roleName: "テスト役（警備員）",
    roleSummary: "街を守る警備員の役です。",
    acceptsFemaleApplicants: false,
    acceptsMaleApplicants: true,
    auditionLines: "止まってください。",
    deadline: "2026-09-01T23:59",
    formUrl: "https://example.com/audition",
    template: {
      ...createDefaultAuditionSocialTemplate(),
      introductionText: "『{{作品名}}』特別オーディションです。",
      unpaidNoticeText: "",
      resultNoticeText: "【選考結果】\n選考後にご案内します。",
      closingText: "あなたのご参加をお待ちしています。",
      hashtagsText: "#独自募集"
    }
  });

  assert.match(post, /『テスト作品』特別オーディションです。/u);
  assert.match(post, /今回募集するのは、テスト役という役です。/u);
  assert.match(post, /※女性の応募はご遠慮ください/u);
  assert.match(post, /「止まってください。」/u);
  assert.match(post, /9\/1（.）23:59まで/u);
  assert.match(post, /https:\/\/example\.com\/audition/u);
  assert.match(post, /【選考結果】\n選考後にご案内します。/u);
  assert.match(post, /あなたのご参加をお待ちしています。/u);
  assert.match(post, /#独自募集/u);
  assert.doesNotMatch(post, /【無償案件】/u);
  assert.ok(!post.includes(AUDITION_FRIENDLY_CLOSING));
  assert.doesNotMatch(post, /#ボイスドラマ/u);
});

test("social post adds the selected applicant gender guidance", () => {
  assert.equal(
    getAuditionApplicantGenderGuidance({
      acceptsFemaleApplicants: false,
      acceptsMaleApplicants: true
    }),
    "※女性の応募はご遠慮ください"
  );
  assert.equal(
    getAuditionApplicantGenderGuidance({
      acceptsFemaleApplicants: true,
      acceptsMaleApplicants: false
    }),
    "※男性の応募はご遠慮ください"
  );
  assert.equal(
    getAuditionApplicantGenderGuidance(),
    "※女性・男性どちらもご応募いただけます"
  );

  const maleOnlyPost = buildAuditionSocialPost({
    roleName: "オルディス・グランベル",
    roleSummary: "老齢の男性の役になります。",
    acceptsFemaleApplicants: false,
    acceptsMaleApplicants: true
  });
  assert.match(maleOnlyPost, /※女性の応募はご遠慮ください/u);

  const femaleOnlyPost = buildAuditionSocialPost({
    roleName: "アイリス",
    acceptsFemaleApplicants: true,
    acceptsMaleApplicants: false
  });
  assert.match(femaleOnlyPost, /※男性の応募はご遠慮ください/u);

  const allApplicantsPost = buildAuditionSocialPost({
    roleName: "モーリス・ペック",
    acceptsFemaleApplicants: true,
    acceptsMaleApplicants: true
  });
  assert.match(allApplicantsPost, /※女性・男性どちらもご応募いただけます/u);
});

test("social post does not duplicate matching legacy gender guidance", () => {
  const post = buildAuditionSocialPost({
    roleName: "オルディス・グランベル",
    roleSummary: "老齢の男性の役になります（女性の応募はご遠慮ください）。",
    acceptsFemaleApplicants: false,
    acceptsMaleApplicants: true
  });
  assert.equal(post.match(/女性の応募はご遠慮ください/gu)?.length, 1);

  const openPost = buildAuditionSocialPost({
    roleName: "モーリス・ペック",
    roleSummary: "女性・男性どちらもご応募いただけます。",
    acceptsFemaleApplicants: true,
    acceptsMaleApplicants: true
  });
  assert.equal(openPost.match(/女性・男性どちらもご応募いただけます/gu)?.length, 1);
});

test("saved social posts gain 24bit and voice drama tags without losing edits", () => {
  const previous = [
    "【オーディション用セリフ】",
    "手で編集した説明です。",
    "",
    "• 形式: wav形式（モノラル）",
    "• サンプリングレート: 44.1kHz",
    "• ファイル名に氏名（SNS名）を記載",
    "",
    "〇セリフ",
    "「テストです」",
    "",
    "#声優募集 #オーディション"
  ].join("\n");
  const updated = normalizeAuditionSocialPostText(previous);

  assert.match(updated, /手で編集した説明です。/u);
  assert.match(updated, /wav形式（モノラル）\n• ビットレート: 24bit\n• サンプリングレート/u);
  assert.match(updated, /#声優募集 #オーディション #ボイスドラマ/u);
  assert.ok(updated.includes(AUDITION_AUDIOBOOK_REFERENCE_NOTICE));
  assert.ok(updated.includes(AUDITION_FRIENDLY_CLOSING));
  assert.equal(normalizeAuditionSocialPostText(updated), updated);
});

test("saved social posts add the early closing notice directly below the deadline", () => {
  const previous = [
    "【応募締め切り】",
    "8/31（月）23:59まで",
    "",
    "下記フォームより、お申し込みください。",
    "https://example.com/form"
  ].join("\n");
  const updated = normalizeAuditionSocialPostText(previous);

  assert.match(updated, new RegExp(`8/31（月）23:59まで\\n${AUDITION_EARLY_CLOSING_NOTICE.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.equal(updated.match(/予定より早く募集を締め切る場合があります/gu)?.length, 1);
  assert.equal(normalizeAuditionSocialPostText(updated), updated);
});

test("saved social posts keep one audiobook reference notice", () => {
  const updated = normalizeAuditionSocialPostText([
    "募集文です。",
    "",
    AUDITION_AUDIOBOOK_REFERENCE_NOTICE,
    "",
    AUDITION_AUDIO_USE_NOTICE
  ].join("\n"));

  assert.equal(updated.match(/Dt5xU3rGed8/gu)?.length, 1);
});

test("saved social posts add a blank line between audiobook notes", () => {
  const packed = AUDITION_AUDIOBOOK_REFERENCE_NOTICE.replace(
    "ご利用ください。\n\n※視聴",
    "ご利用ください。\n※視聴"
  );
  const updated = normalizeAuditionSocialPostText(packed);

  assert.match(updated, /ご利用ください。\n\n※視聴/u);
  assert.equal(normalizeAuditionSocialPostText(updated), updated);
});

test("saved social posts replace the former character-reference wording", () => {
  const previous = [
    "募集文です。",
    "",
    "【参考オーディオブック】",
    "作品の世界観や登場人物の雰囲気を知っていただく参考として、オーディオブックをお聴きいただけます。",
    AUDITION_AUDIOBOOK_REFERENCE_URL,
    "※視聴は必須ではありません。ボイスドラマ版は、このオーディオブックをもとに新しい場面やセリフを加え、脚本を加筆・再構成するため、内容は完全に同じではありません。",
    "",
    AUDITION_AUDIO_USE_NOTICE
  ].join("\n");
  const updated = normalizeAuditionSocialPostText(previous);

  assert.doesNotMatch(updated, /登場人物の雰囲気/u);
  assert.match(updated, /演技見本ではなく、物語の参考/u);
  assert.equal(updated.match(/Dt5xU3rGed8/gu)?.length, 1);
});

test("social posts remove X compose links from generated and saved text", () => {
  const generated = buildAuditionSocialPost({
    roleName: "テスト役",
    formUrl: "https://x.com/compose/post"
  });
  const saved = normalizeAuditionSocialPostText([
    "【結果発表】",
    "勝手ながら、今回は合格者のみご連絡させていただきます。",
    "https://x.com/compose/post",
    "",
    AUDITION_FRIENDLY_CLOSING,
    "https://x.com/compose/post"
  ].join("\n"));

  assert.doesNotMatch(generated, /x\.com\/compose\/post/u);
  assert.doesNotMatch(saved, /x\.com\/compose\/post/u);
  assert.match(saved, /【結果発表】\n勝手ながら、今回は合格者のみご連絡させていただきます。\n\n一緒に作品をつくってくださる方のご応募をお待ちしています＾＾/u);
});
