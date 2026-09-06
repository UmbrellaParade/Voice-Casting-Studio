import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createGasWorkspaceConnection, makeGasPublishedProject } from "../src/lib/gas-workspace.js";
import { mergeRecordingProgress, stampProgressPatch } from "../src/lib/recording-sync.js";
import { getRecordingDisplayProject, normalizeRecordingProject, patchRecordingLineProgress, mergeRemoteRecordingProject } from "../src/lib/recording.js";

const before = "2026-09-01T00:00:00.000Z";
const after = "2026-09-02T00:00:00.000Z";
const fixture = () => normalizeRecordingProject({
  id: "test_project", title: "共有テスト", characters: [{ id: "a", name: "アオ" }, { id: "b", name: "ミドリ" }],
  castMembers: [{ id: "cast_a", actorName: "声優A", socialUrl: "https://x.com/example", contact: "PRIVATE", accessKey: "test-key-a", characterIds: ["a"] },
    { id: "cast_b", actorName: "声優B", accessKey: "test-key-b", characterIds: ["b"] }],
  lines: [{ id: "body", manualBody: true, kind: "direction", chapterTitle: "第一章", text: "## シーン1\nアオ「おはよう。」\nミドリ「こんにちは。」", updatedAt: before }],
  contactMessageDrafts: [{ body: "PRIVATE" }], auditionFormsFolderUrl: "PRIVATE", questions: []
});

function server(project) {
  let saved = JSON.stringify(project);
  let writes = 0;
  let releases = 0;
  const file = { getBlob: () => ({ getDataAsString: () => saved }), setContent: (value) => { saved = value; writes++; } };
  const files = () => { let read = false; return { hasNext: () => !read, next: () => { read = true; return file; } }; };
  const folder = { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }), getFilesByName: files };
  const context = vm.createContext({
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ setMimeType: () => JSON.parse(body) }) },
    DriveApp: { getFolderById: () => folder },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { releases++; } }) },
    Utilities: { getUuid: () => `id_${writes}_${releases}` }
  });
  const source = fs.readFileSync(new URL("../docs/google-apps-script/Code.gs", import.meta.url), "utf8")
    .replace('const SECRET_TOKEN = "ここを好きな合言葉に変更";', 'const SECRET_TOKEN = "owner-test-token";');
  vm.runInContext(source, context);
  const post = (payload) => context.doPost({ postData: { contents: JSON.stringify({ driveFolderUrl: "folder_123456789012345678901234567890", projectId: project.id, ...payload }) } });
  return { context, post, read: () => JSON.parse(saved), writes: () => writes, releases: () => releases,
    get: (extra = {}) => context.doGet({ parameter: { action: "getRecordingProject", folder: "folder_123456789012345678901234567890", projectId: project.id, memberId: "cast_a", key: "test-key-a", ...extra } }) };
}

test("GAS publication indexes derived lines and keeps current concept/vision", () => {
  const project = fixture();
  const published = makeGasPublishedProject(project, { vision: "shared vision" });
  const lines = getRecordingDisplayProject(project).lines.filter((line) => line.kind === "dialogue");
  assert.equal(lines.length, 2);
  assert.equal(published.recordingLineIndex[lines[0].id].characterId, "a");
  assert.equal(published.studioConcept.vision, "shared vision");
  assert.equal(published.contactMessageDrafts, undefined);
});

test("field-level merge preserves newer retakes while applying actor checks and empty notes", () => {
  const local = { reviewStatus: "リテイク", directorNote: "new request", actorNote: "old note", updatedAt: after,
    fieldUpdatedAt: { reviewStatus: after, directorNote: after, actorNote: before } };
  const remote = { reviewStatus: "OK", directorNote: "old request", actorStatus: "収録済み", actorNote: "", updatedAt: after,
    fieldUpdatedAt: { reviewStatus: before, directorNote: before, actorStatus: after, actorNote: after } };
  const result = mergeRecordingProgress(local, remote);
  assert.equal(result.reviewStatus, "リテイク");
  assert.equal(result.directorNote, "new request");
  assert.equal(result.actorNote, "");
  assert.equal(result.actorStatus, "収録済み");
});

test("normalization and polling preserve per-field clocks for derived lines", () => {
  const project = fixture();
  const line = getRecordingDisplayProject(project).lines.find((item) => item.characterId === "a");
  const edited = normalizeRecordingProject(patchRecordingLineProgress(project, line.id, { directorNote: "new", updatedAt: after }, line));
  const merged = mergeRemoteRecordingProject(edited, { derivedLineProgress: { [line.id]: { directorNote: "old", updatedAt: before } } });
  assert.equal(merged.derivedLineProgress[line.id].directorNote, "new");
  assert.equal(merged.derivedLineProgress[line.id].fieldUpdatedAt.directorNote, after);
  assert.equal(stampProgressPatch({ updatedAt: before }, { actorStatus: "収録済み", updatedAt: after }).fieldUpdatedAt.directorNote, before);
});

test("GAS actors can update derived lines but cannot impersonate another character", () => {
  const published = makeGasPublishedProject(fixture());
  const api = server(published);
  const ids = Object.keys(published.recordingLineIndex);
  const own = ids.find((id) => published.recordingLineIndex[id].characterId === "a");
  const other = ids.find((id) => published.recordingLineIndex[id].characterId === "b");
  const auth = { memberId: "cast_a", accessKey: "test-key-a" };
  const ok = api.post({ ...auth, action: "updateRecordingLine", lineId: own, patch: { actorStatus: "収録済み", reviewStatus: "OK" } });
  assert.equal(ok.ok, true);
  assert.equal(ok.line.actorStatus, "収録済み");
  assert.equal(ok.line.reviewStatus, "未確認");
  const rejected = api.post({ ...auth, action: "updateRecordingLine", lineId: other, lineContext: { characterId: "a", sourceLineId: "body" }, patch: { actorStatus: "収録済み" } });
  assert.equal(rejected.ok, false);
  assert.equal(api.writes(), 1);
  assert.equal(api.releases(), 2);
});

test("bulk recording updates are all-or-nothing and reject unknown lines", () => {
  const published = makeGasPublishedProject(fixture());
  const api = server(published);
  const ids = Object.keys(published.recordingLineIndex);
  const result = api.post({ action: "updateRecordingLines", memberId: "cast_a", accessKey: "test-key-a", actorStatus: "収録済み", updates: ids.map((lineId) => ({ lineId })) });
  assert.equal(result.ok, false);
  assert.equal(api.writes(), 0);
  assert.equal(api.post({ action: "updateRecordingLine", memberId: "cast_a", accessKey: "test-key-a", lineId: "derived_line_invented", patch: { actorStatus: "収録済み" } }).ok, false);
});

test("GAS questions support answers, resolution, follow-ups and questioner authorization", () => {
  const published = makeGasPublishedProject(fixture());
  const api = server(published);
  const auth = { memberId: "cast_a", accessKey: "test-key-a" };
  const created = api.post({ ...auth, action: "createRecordingQuestion", body: "読み方を教えてください", authorName: "impersonation" });
  assert.equal(created.ok, true);
  assert.equal(created.question.authorName, "声優A");
  const updated = api.read();
  updated.questions[0].answer = "テスト回答";
  updated.questions[0].status = "回答済み";
  updated.questions[0].updatedAt = "2099-01-01T00:00:00.000Z";
  assert.equal(api.post({ action: "publishRecordingProject", token: "owner-test-token", project: updated }).ok, true);
  assert.equal(api.post({ action: "resolveRecordingQuestion", memberId: "cast_b", accessKey: "test-key-b", questionId: created.question.id }).ok, false);
  assert.equal(api.post({ ...auth, action: "resolveRecordingQuestion", questionId: created.question.id }).question.status, "解決済み");
  const followup = api.post({ ...auth, action: "createRecordingQuestion", body: "追加質問", parentQuestionId: created.question.id });
  assert.equal(followup.question.parentQuestionId, created.question.id);
  assert.equal(followup.question.status, "未回答");
});

test("actor responses preserve SNS but never expose owner secrets, private drafts or access keys", () => {
  const published = makeGasPublishedProject(fixture());
  published.contactMessageDrafts = [{ body: "PRIVATE" }];
  published.auditionFormsFolderUrl = "PRIVATE";
  published.futureSecret = "PRIVATE";
  const result = server(published).get();
  assert.equal(result.protocolVersion, 2);
  assert.equal(result.project.castMembers[0].socialUrl, "https://x.com/example");
  assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(result).includes("test-key"), false);
  assert.equal(result.project.recordingLineIndex, undefined);
});

test("GAS adapter maps the current workspace contract and rejects obsolete receivers", async () => {
  const project = { id: "p", syncRevision: 3, studioConcept: { title: "Concept" } };
  const calls = [];
  const connection = createGasWorkspaceConnection({ projectId: "p", memberId: "m", accessKey: "k", endpointUrl: "https://example.test/exec" }, {
    get: async () => ({ ok: true, protocolVersion: 2, project, viewer: { id: "m", actorName: "Actor", characterIds: ["a"] } }),
    post: async (_, payload) => { calls.push(payload); return { ok: true, protocolVersion: 2, project, line: { actorStatus: "収録済み" } }; }
  });
  const loaded = await connection.load();
  assert.equal(loaded.data.recordingProjects[0].id, "p");
  assert.equal(loaded.currentUser.castMemberId, "m");
  assert.equal(loaded.canEditScript, false);
  await connection.updateLine({ projectId: "p", lineId: "l", patch: { actorStatus: "収録済み" } });
  assert.equal(calls[0].action, "updateRecordingLine");
  await assert.rejects(() => connection.updateLine({ projectId: "another" }));
  const obsolete = createGasWorkspaceConnection({ endpointUrl: "https://example.test/exec" }, { get: async () => ({ ok: true, project }) });
  await assert.rejects(() => obsolete.load(), /更新/);
});

test("GAS and WordPress use the same current application entry and production views", () => {
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.equal(main.includes("return <SharedRecordingBoard"), false);
  for (const component of ["RecordingStudio", "ProductionWorkspace", "ConceptView", "ManualView"]) assert.match(main, new RegExp(`<${component}`));
  assert.match(main, /from "\.\/lib\/workspace\.js"/);
});

test("deleted questions are not resurrected by polling or republishing", () => {
  const project = fixture();
  project.questions = [{ id: "q", body: "old", updatedAt: before }];
  const local = { ...project, questions: [], deletedQuestionIds: ["q"] };
  assert.equal(mergeRemoteRecordingProject(local, project).questions.length, 0);
  const published = makeGasPublishedProject(project);
  const api = server(published);
  const result = api.post({ action: "publishRecordingProject", token: "owner-test-token", project: makeGasPublishedProject(local) });
  assert.equal(result.project.questions.length, 0);
});

test("late GAS responses cannot replace a newer acknowledged revision", async () => {
  let reads = 0;
  const connection = createGasWorkspaceConnection({ projectId: "p", endpointUrl: "https://example.test/exec" }, {
    get: async () => ({ protocolVersion: 2, project: { id: "p", syncRevision: ++reads === 1 ? 4 : 2, title: reads === 1 ? "new" : "old" } }),
    post: async () => ({ protocolVersion: 2, project: { id: "p", syncRevision: 1, title: "oldest" } })
  });
  await connection.load();
  assert.equal((await connection.load()).data.recordingProjects[0].title, "new");
  assert.equal((await connection.updateLine({ projectId: "p", lineId: "l" })).project.title, "new");
});
