import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const itemTypes = {
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TEXT: "TEXT",
  CHECKBOX: "CHECKBOX",
  FILE_UPLOAD: "FILE_UPLOAD",
  IMAGE: "IMAGE"
};

function createItem({ id, type, title, choices = [], required = true }) {
  return {
    id,
    type,
    title,
    choices,
    required,
    getId() { return this.id; },
    getType() { return this.type; },
    getTitle() { return this.title; },
    setTitle(value) { this.title = value; return this; },
    asMultipleChoiceItem() { return this; },
    asCheckboxItem() { return this; },
    getChoices() { return this.choices.map((value) => ({ getValue: () => value })); },
    setChoiceValues(values) { this.choices = [...values]; return this; },
    isRequired() { return this.required; },
    setRequired(value) { this.required = value; return this; }
  };
}

function createForm(items, { description = "", title = "「テスト役」役オーディション応募フォーム" } = {}) {
  return {
    items,
    description,
    title,
    acceptingResponses: true,
    customClosedFormMessage: "",
    getItems(type) { return type ? this.items.filter((item) => item.type === type) : [...this.items]; },
    deleteItem(item) { this.items = this.items.filter((candidate) => candidate.id !== item.id); },
    getId() { return "test-form-id"; },
    getEditUrl() { return "https://docs.google.com/forms/d/test-form-id/edit"; },
    getTitle() { return this.title; },
    setTitle(value) { this.title = value; return this; },
    getDescription() { return this.description; },
    setDescription(value) { this.description = value; return this; },
    getPublishedUrl() { return "https://docs.google.com/forms/d/e/test/viewform"; },
    isAcceptingResponses() { return this.acceptingResponses; },
    setAcceptingResponses(value) { this.acceptingResponses = Boolean(value); return this; },
    setCustomClosedFormMessage(value) { this.customClosedFormMessage = value; return this; },
    isPublished() { return true; },
    setPublished() { return this; }
  };
}

function loadAuditionScript() {
  const propertyValues = {};
  const triggers = [];
  const parseTokyoDate = (value) => new Date(`${String(value).replace(" ", "T")}:00+09:00`);
  const tokyoParts = (value) => {
    const shifted = new Date(value.getTime() + (9 * 60 * 60 * 1000));
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes()
    };
  };
  const pad = (value) => String(value).padStart(2, "0");
  const context = vm.createContext({
    console,
    FormApp: { ItemType: itemTypes },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => propertyValues[key] ?? null,
        setProperty: (key, value) => { propertyValues[key] = String(value); },
        deleteProperty: (key) => { delete propertyValues[key]; },
        getProperties: () => ({ ...propertyValues })
      })
    },
    ScriptApp: {
      getProjectTriggers: () => [...triggers],
      newTrigger: (handler) => ({
        timeBased() { return this; },
        everyMinutes() { return this; },
        create() {
          const trigger = { getHandlerFunction: () => handler };
          triggers.push(trigger);
          return trigger;
        }
      })
    },
    Utilities: {
      parseDate: (value) => parseTokyoDate(value),
      formatDate: (value, _timeZone, format) => {
        const parts = tokyoParts(value);
        if (format === "yyyy-MM-dd'T'HH:mm") {
          return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
        }
        if (format === "yyyy年M月d日 HH:mm") {
          return `${parts.year}年${parts.month}月${parts.day}日 ${pad(parts.hour)}:${pad(parts.minute)}`;
        }
        return "";
      }
    },
    Date,
    Number,
    Object,
    String
  });
  const source = readFileSync(new URL("../docs/google-apps-script/AuditionForms.gs", import.meta.url), "utf8");
  vm.runInContext(source, context);
  context.__deadlineProperties = propertyValues;
  context.__triggers = triggers;
  return context;
}

const titles = {
  consent: "今回ご提出いただく収録音声を、ボイスドラマ本編に加え、同作品をアニメ化する際にも使用することに同意いただけますか？",
  name: "お名前（SNS名）をご記入ください",
  x: "Xのアカウントをお書きください",
  follow: "べるぼのアカウントのフォローをお願いします。",
  upload: "こちらから音声データを提出してください。"
};

function validItems() {
  return [
    createItem({ id: 1, type: itemTypes.MULTIPLE_CHOICE, title: titles.consent, choices: ["上記の内容を確認し、使用に同意します"] }),
    createItem({ id: 2, type: itemTypes.TEXT, title: titles.name }),
    createItem({ id: 3, type: itemTypes.TEXT, title: titles.x }),
    createItem({ id: 4, type: itemTypes.CHECKBOX, title: titles.follow, choices: ["フォローしました"] }),
    createItem({ id: 5, type: itemTypes.FILE_UPLOAD, title: titles.upload })
  ];
}

test("normalization removes duplicate uploads and unwanted consent choices", () => {
  const context = loadAuditionScript();
  const items = validItems();
  items[0].choices.push("選択肢 2");
  items.push(createItem({ id: 6, type: itemTypes.FILE_UPLOAD, title: titles.upload }));
  const form = createForm(items);

  const repaired = context.vcsNormalizeAuditionForm_(form);
  const validation = context.vcsValidateAuditionForm_(
    form,
    { formName: "「テスト役」役オーディション応募フォーム" },
    repaired
  );

  assert.equal(validation.passed, true);
  assert.equal(validation.fileUploadItems, 1);
  assert.deepEqual([...validation.consentChoices], ["上記の内容を確認し、使用に同意します"]);
  assert.ok(repaired.includes("consentChoices"));
  assert.ok(repaired.includes("duplicateUploadRemoved"));
});

test("validation rejects a copied form with a missing required question", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems().filter((item) => item.title !== titles.x));
  const validation = context.vcsValidateAuditionForm_(
    form,
    { formName: "「テスト役」役オーディション応募フォーム" },
    []
  );

  assert.equal(validation.passed, false);
  assert.ok(validation.errors.some((error) => error.includes(titles.x)));
});

test("a validated form can be stored before audition images are generated", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems());
  const validation = context.vcsValidateAuditionForm_(
    form,
    { formName: "「テスト役」役オーディション応募フォーム" },
    []
  );
  const result = context.vcsBuildAuditionResult_(form, null, null, false, validation);

  assert.equal(result.found, true);
  assert.equal(result.imagesComplete, false);
  assert.equal(result.headerImageUrl, "");
  assert.equal(result.socialImageUrl, "");
  assert.equal(result.formValidation.passed, true);
});

test("form preparation includes the role description without changing the form title", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems());
  const validation = context.vcsPrepareAuditionForm_(form, null, {
    roleName: "バルガス・ロウ",
    roleDescription: "警備員の役です。",
    formName: "「テスト役」役オーディション応募フォーム"
  });

  assert.equal(validation.passed, true);
  assert.equal(validation.descriptionMatches, true);
  assert.equal(
    form.getDescription(),
    [
      "「バルガス・ロウ」役オーディションに応募される方は、このフォームからお願いします。",
      "【募集する役】\n警備員の役です。",
      "【参考オーディオブック】\n作品全体の物語や世界観を知っていただくための参考として、オーディオブックをお聴きいただけます。\nhttps://youtu.be/Dt5xU3rGed8\n※今回募集する役は、オーディオブックには登場しない、または登場がごくわずかな場合があります。演技見本ではなく、物語の参考としてご利用ください。\n※視聴は必須ではありません。ボイスドラマ版は、この物語をもとに新しい登場人物・場面・セリフを加え、脚本を加筆・再構成するため、オーディオブックと内容は完全に同じではありません。"
    ].join("\n\n")
  );
  assert.equal(validation.audiobookReferenceIncluded, true);
  assert.equal(form.getTitle(), "「テスト役」役オーディション応募フォーム");
});

test("form preparation displays a future deadline and schedules automatic closing", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems());
  const names = {
    roleName: "バルガス・ロウ",
    roleDescription: "警備員の役です。",
    requestKey: "deadline-test",
    auditionDeadline: "2099-08-31T23:59",
    formName: "「テスト役」役オーディション応募フォーム"
  };

  const first = context.vcsPrepareAuditionForm_(form, null, names);
  const second = context.vcsPrepareAuditionForm_(form, null, names);

  assert.equal(first.passed, true);
  assert.equal(first.deadlineConfigured, true);
  assert.equal(first.deadlineAutomationReady, true);
  assert.equal(first.auditionDeadlineLabel, "2099年8月31日 23:59");
  assert.equal(form.isAcceptingResponses(), true);
  assert.match(form.getDescription(), /【応募締め切り】\n2099年8月31日 23:59/);
  assert.match(form.getDescription(), /予定より早く募集を締め切る場合があります/);
  assert.ok(context.__deadlineProperties["VCS_AUDITION_DEADLINE_test-form-id"]);
  assert.equal(context.__triggers.length, 1);
  assert.equal(second.deadlineAutomationReady, true);
});

test("form preparation immediately closes a form whose deadline has passed", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems());
  const validation = context.vcsPrepareAuditionForm_(form, null, {
    roleName: "バルガス・ロウ",
    requestKey: "expired-deadline-test",
    auditionDeadline: "2020-08-31T23:59",
    formName: "「テスト役」役オーディション応募フォーム"
  });

  assert.equal(validation.passed, true);
  assert.equal(validation.deadlineExpired, true);
  assert.equal(form.isAcceptingResponses(), false);
  assert.match(form.customClosedFormMessage, /応募受付は終了しました/);
  assert.equal(context.__triggers.length, 0);
});

test("form preparation still closes when Google rejects the custom closed message", () => {
  const context = loadAuditionScript();
  const form = createForm(validItems());
  form.setCustomClosedFormMessage = () => {
    throw new Error("Invalid data updating form.");
  };

  const validation = context.vcsPrepareAuditionForm_(form, null, {
    roleName: "テスト役",
    requestKey: "closed-message-fallback-test",
    auditionDeadline: "2020-08-31T23:59",
    formName: "テスト役オーディション応募フォーム"
  });

  assert.equal(validation.passed, true);
  assert.equal(validation.deadlineExpired, true);
  assert.equal(form.isAcceptingResponses(), false);
});

test("normalizes X handles and legacy Twitter URLs in audition answers", () => {
  const context = loadAuditionScript();

  assert.equal(context.vcsNormalizeXProfileUrl_("@aobakanade"), "https://x.com/aobakanade");
  assert.equal(context.vcsNormalizeXProfileUrl_("twitter.com/aobakanade/status/123"), "https://x.com/aobakanade");
  assert.equal(context.vcsNormalizeXProfileUrl_("https://x.com/aobakanade"), "https://x.com/aobakanade");
});

test("extracts only applicant contact details from a Google Form response", () => {
  const context = loadAuditionScript();
  const itemResponse = (title, value) => ({
    getItem: () => ({ getTitle: () => title }),
    getResponse: () => value
  });
  const response = {
    getId: () => "response-001",
    getTimestamp: () => new Date("2026-08-10T03:04:05.000Z"),
    getItemResponses: () => [
      itemResponse(titles.name, "青葉かなで"),
      itemResponse(titles.x, "@aobakanade"),
      itemResponse(titles.upload, ["private-drive-file-id"])
    ]
  };

  const applicant = context.vcsExtractAuditionApplicant_(response, {
    characterId: "character_vel",
    roleName: "ヴェル13世"
  }, "form-001");

  assert.equal(applicant.name, "青葉かなで");
  assert.equal(applicant.socialInput, "@aobakanade");
  assert.equal(applicant.socialUrl, "https://x.com/aobakanade");
  assert.equal(applicant.sourceCharacterId, "character_vel");
  assert.equal(applicant.submittedAt, "2026-08-10T03:04:05.000Z");
  assert.equal(Object.hasOwn(applicant, "audio"), false);
});

test("applicant import prefers the exact form id stored by WordPress", () => {
  const context = loadAuditionScript();
  const requestedIds = [];
  context.DriveApp = { getFolderById: () => ({}) };
  context.vcsGetAuditionNames_ = (role) => ({
    requestKey: role.requestKey,
    roleName: role.roleName,
    formName: `「${role.roleName}」役オーディション応募フォーム`
  });
  context.vcsGetFileById_ = (fileId) => {
    requestedIds.push(fileId);
    return fileId === "form-from-wordpress" ? { getId: () => fileId } : null;
  };
  context.vcsFindFile_ = () => {
    throw new Error("The exact form id should avoid a name-based search.");
  };
  context.FormApp.openById = (formId) => ({
    getId: () => formId,
    getResponses: () => []
  });

  const result = context.vcsListAuditionApplicants_({
    roles: [{
      characterId: "character-1",
      requestKey: "request-1",
      roleName: "モーリス・ペック",
      formId: "form-from-wordpress"
    }]
  });

  assert.deepEqual(requestedIds, ["form-from-wordpress"]);
  assert.equal(result.roleSummaries[0].found, true);
  assert.equal(result.roleSummaries[0].formId, "form-from-wordpress");
});
