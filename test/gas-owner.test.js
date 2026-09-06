import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";
import { bundleGasSource } from "../tools/bundle-gas.mjs";
import { createGasOwnerConnection, prepareGasOwnerData, saveGasOwnerConfiguration } from "../src/lib/gas-owner.js";

const token = "owner-test-token-private";
const data = () => ({ settings: { recordingDriveFolderUrl: "folder_123456789012345678901234567890", responseSyncToken: token },
  recordingProjects: [{ id: "project_test", title: "Test", sharedAt: "", characters: [{ id: "c", name: "テスト" }], castMembers: [], lines: [], questions: [],
    contactMessageDrafts: [{ body: "PRIVATE DRAFT" }], auditionRoleProgress: [] }], studioConcept: { title: "TEST" } });
const iterator = (items) => { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; };
function server() {
  const files = new Map();
  const properties = new Map();
  const calls = [];
  let serial = 0;
  const blob = (value, type = "text/plain") => ({ getDataAsString: () => typeof value === "string" ? value : Buffer.from(value).toString(), getBytes: () => [...Buffer.from(value)], getContentType: () => type, setName() { return this; } });
  const folder = { getName: () => "folder", getFoldersByName: () => iterator([folder]),
    getFilesByName: (name) => iterator([...files.values()].filter((file) => file.name === name)),
    createFile: (name, content) => createFile(name, content) };
  const createFile = (name, content) => {
    const file = { id: `file_${++serial}`, name, content, sharing: "PRIVATE", viewers: [], editors: [],
      getId() { return this.id; }, getName() { return this.name; }, getBlob() { return blob(this.content); },
      setContent(value) { this.content = value; }, getSharingAccess() { return this.sharing; },
      getViewers() { return this.viewers; }, getEditors() { return this.editors; }, setSharing(value) { this.sharing = value; } };
    files.set(file.id, file);
    return file;
  };
  const props = { getProperty: (key) => properties.get(key) || null, setProperty: (key, value) => properties.set(key, value), deleteProperty: (key) => properties.delete(key) };
  const context = vm.createContext({
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ setMimeType: () => JSON.parse(body) }) },
    MimeType: { PLAIN_TEXT: "text/plain" },
    PropertiesService: { getScriptProperties: () => props },
    DriveApp: { Access: { PRIVATE: "PRIVATE", ANYONE_WITH_LINK: "ANYONE" }, Permission: { VIEW: "VIEW" }, createFile, getFileById: (id) => { if (!files.has(id)) throw new Error("File missing"); return files.get(id); }, getFolderById: () => folder },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { getUuid: () => `uuid-${++serial}`, newBlob: blob, base64Decode: (s) => [...Buffer.from(s, "base64")], base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
      computeHmacSha256Signature: (text, secret) => [...createHmac("sha256", secret).update(text).digest()], computeDigest: (_, text) => [...createHash("sha256").update(text).digest()] },
    FormApp: { openById: () => ({ getItems: () => [] }), ItemType: {} },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ url, options });
      const result = url.endsWith("/user/subscription") ? { tier: "starter", character_count: 20, character_limit: 30000, status: "active", next_character_count_reset_unix: 123 } : {};
      return { getContentText: () => JSON.stringify(result), getResponseCode: () => 200, getBlob: () => blob("audio bytes", "audio/mpeg"), getAllHeaders: () => ({ "character-cost": "30" }) };
    } }
  });
  vm.runInContext(bundleGasSource().replace('const SECRET_TOKEN = "ここを好きな合言葉に変更";', `const SECRET_TOKEN = "${token}";`), context);
  const post = (operation, payload = {}) => context.doPost({ postData: { contents: JSON.stringify({ action: "ownerRequest", token, operation, ...payload }) } });
  return { context, post, files, properties, calls, createFile };
}

test("distributed GAS bundle has one router and no Belbo API keys or storage defaults", () => {
  const source = bundleGasSource();
  assert.equal((source.match(/function doPost\(/g) || []).length, 1);
  assert.equal((source.match(/function doGet\(/g) || []).length, 1);
  assert.doesNotMatch(source, /1LR58DIiMLNu5BaOEVBvYwQrxC9ffDudS|11uxFA2aHVaKv99sRq7yXJKiR5blVn_s9|1-xfkPZchzQDyAjJUVcfxODw8Cjd61pHaqkv1UyLWSkY/);
  assert.doesNotMatch(source, /sk-(?:proj-)?[A-Za-z0-9_-]{30,}/);
});

test("all owner operations reject missing, wrong and actor credentials before accessing storage/providers", () => {
  const api = server();
  for (const operation of ["loadWorkspace", "saveWorkspace", "getAuditionSettings", "saveAuditionSettings", "getElevenLabsSettings", "saveElevenLabsSettings", "generateElevenLabsSound", "createAuditionForm", "listAuditionApplicants", "uploadImage"]) {
    const result = api.post(operation, { token: "actor-key" });
    assert.equal(result.ok, false, operation);
  }
  assert.equal(api.files.size, 0);
  assert.equal(api.calls.length, 0);
});

test("owner data is stored in a separate private file, without provider keys or connection token", () => {
  const api = server();
  assert.equal(api.post("loadWorkspace").data, null);
  const result = api.post("saveWorkspace", { version: 0, data: data() });
  assert.equal(result.ok, true);
  assert.equal(result.version, 1);
  assert.match(JSON.stringify(result.data), /PRIVATE DRAFT/);
  assert.doesNotMatch(JSON.stringify(result.data), /owner-test-token/);
  assert.equal(api.files.size, 1);
  const file = [...api.files.values()][0];
  assert.equal(file.sharing, "PRIVATE");
  assert.equal(api.post("loadWorkspace").data.recordingProjects[0].id, "project_test");
});

test("stale owner saves and corrupt private storage cannot overwrite newer data", () => {
  const api = server();
  api.post("saveWorkspace", { version: 0, data: data() });
  const stale = api.post("saveWorkspace", { version: 0, data: data() });
  assert.equal(stale.code, "workspace_conflict");
  assert.equal(api.post("loadWorkspace").version, 1);
  [...api.files.values()][0].content = "broken-json";
  assert.equal(api.post("saveWorkspace", { version: 1, data: data() }).ok, false);
  assert.equal([...api.files.values()][0].content, "broken-json");
});

test("owner storage fails closed if the private file is shared", () => {
  const api = server();
  api.post("saveWorkspace", { version: 0, data: data() });
  [...api.files.values()][0].sharing = "ANYONE";
  assert.equal(api.post("loadWorkspace").code, "private_workspace_shared");
});

test("publishing from owner storage does not put private drafts in the shared project file", () => {
  const api = server();
  const workspace = data();
  workspace.recordingProjects[0].sharedAt = new Date().toISOString();
  workspace.recordingProjects[0].castMembers = [{ id: "actor", actorName: "Actor", accessKey: "cast-secret", characterIds: ["c"] }];
  const result = api.post("saveWorkspace", { version: 0, data: workspace });
  assert.equal(result.ok, true, result.error);
  const shared = [...api.files.values()].find((file) => file.name === "project_test.json");
  assert.ok(shared);
  assert.doesNotMatch(shared.content, /PRIVATE DRAFT|responseSyncToken/);
  assert.match(shared.content, /cast-secret/);
  assert.match(JSON.stringify(result.data), /PRIVATE DRAFT/);
});

test("API keys are per installation, stored only in script properties and never returned", () => {
  const one = server();
  const two = server();
  const key = "sk-proj-" + "test".repeat(8);
  const result = one.post("saveAuditionSettings", { settings: { openAiApiKey: key } });
  assert.equal(result.hasOpenAiKey, true);
  assert.doesNotMatch(JSON.stringify(result), /sk-proj-/);
  assert.equal(two.post("getAuditionSettings").hasOpenAiKey, false);
  assert.equal(one.post("saveAuditionSettings", { settings: { clearOpenAiApiKey: true } }).hasOpenAiKey, false);
  assert.equal(one.files.size, 0);
});

test("ElevenLabs requires confirmation, supports only 450 characters and returns audio without storing it", () => {
  const api = server();
  const key = "sk_test_eleven_key_1234567890";
  assert.equal(api.post("saveElevenLabsSettings", { settings: { apiKey: key } }).connected, true);
  assert.equal(api.post("generateElevenLabsSound", { prompt: "rain", confirmed: false }).ok, false);
  assert.equal(api.post("generateElevenLabsSound", { prompt: "a".repeat(451), confirmed: true }).ok, false);
  const result = api.post("generateElevenLabsSound", { prompt: "Rain on leaves", confirmed: true, durationSeconds: 3 });
  assert.equal(result.ok, true, result.error);
  assert.equal(Buffer.from(result.audioBase64, "base64").toString(), "audio bytes");
  assert.equal(result.settings.toolGenerationCount, 1);
  assert.equal(result.creditsUsed, 30);
  assert.doesNotMatch(JSON.stringify(result), /sk_test/);
  assert.equal(api.files.size, 0);
  assert.equal(api.properties.has("VCS_LEASE_elevenlabs"), false);
});

test("the owner adapter seeds only an empty cloud workspace and serializes revisions", async () => {
  const api = server();
  const connection = createGasOwnerConnection({ endpointUrl: "https://script.google.com/macros/s/example/exec", token }, {
    seed: data, post: async (_, request) => {
      const result = api.post(request.operation, request);
      if (!result.ok) throw Object.assign(new Error(result.error), { code: result.code, data: result.data });
      return result;
    }
  });
  const loaded = await connection.load();
  assert.equal(loaded.version, 1);
  assert.equal(loaded.data.settings.responseSyncToken, token);
  await Promise.all([connection.save(data()), connection.save(data())]);
  assert.equal(api.post("loadWorkspace").version, 3);
  assert.equal((await connection.load()).version, 3);
});

test("owner conflict preserves the draft and stops later overwrites", async () => {
  const recovery = new Map();
  const connection = createGasOwnerConnection({ endpointUrl: "https://script.google.com/macros/s/example/exec", token }, {
    storage: { setItem: (key, value) => recovery.set(key, value) },
    post: async (_, request) => {
      if (request.operation === "loadWorkspace") return { protocolVersion: 3, version: 2, data: data() };
      throw Object.assign(new Error("conflict"), { code: "workspace_conflict" });
    }
  });
  await connection.load();
  await assert.rejects(() => connection.save(data()), /conflict/);
  assert.equal(recovery.size, 1);
  await assert.rejects(() => connection.save(data()), /競合/);
});

test("connection credentials never travel in query URLs or prepared workspace exports", () => {
  assert.doesNotMatch(JSON.stringify(prepareGasOwnerData(data())), /owner-test-token/);
  assert.throws(() => saveGasOwnerConfiguration({ endpointUrl: "https://attacker.test/exec", token }, { setItem() {} }), /Webアプリ/);
});

test("invalid imported owner endpoints fail before transmitting any credentials", async () => {
  let sent = false;
  for (const endpointUrl of ["https://attacker.test/exec", "https://script.google.com/macros/s/example/exec?token=x", "http://script.google.com/macros/s/example/exec"]) {
    const connection = createGasOwnerConnection({ endpointUrl, token }, { post: async () => { sent = true; } });
    await assert.rejects(() => connection.load(), /Webアプリ/);
  }
  assert.equal(sent, false);
});

test("audition forms retain aliases internally while titles, deadlines and applicant forms use the selected role", () => {
  const api = server();
  const workspace = data();
  workspace.recordingProjects[0].characters[0].name = "ダリオ・グレン(観客A)";
  workspace.recordingProjects[0].auditionRoleProgress = [{ characterId: "c", auditionRoleSummary: "劇場の観客", auditionDeadline: "2026-10-01T23:59" }];
  api.post("saveWorkspace", { data: workspace, version: 0 });
  api.post("saveAuditionSettings", { settings: { templateFormUrl: "https://docs.google.com/forms/d/template/edit", formsFolderUrl: "https://drive.google.com/drive/folders/forms", imageFolderUrl: "https://drive.google.com/drive/folders/images" } });
  let copied = 0;
  api.context.vcsLookupAuditionForm_ = () => ({ found: false });
  api.context.vcsCreateAuditionForm_ = (request) => {
    copied++;
    assert.equal(request.roleName, "ダリオ・グレン");
    assert.equal(request.roleDescription, "劇場の観客");
    assert.equal(request.auditionDeadline, "2026-10-01T23:59");
    return { ok: true, formEditUrl: "https://docs.google.com/forms/d/test/edit", formResponderUrl: "https://docs.google.com/forms/d/test/viewform", formValidation: { passed: true } };
  };
  const result = api.post("createAuditionForm", { projectId: "project_test", characterId: "c", version: 1 });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.progress.formCreated, true);
  assert.equal(result.progress.headerApplied, false);
  assert.equal(result.progress.uploadVerified, false);
  assert.equal(result.progress.auditionRoleSummary, "劇場の観客");
  assert.equal(copied, 1);
  assert.equal(api.post("createAuditionForm", { projectId: "project_test", characterId: "c", version: 1 }).code, "workspace_conflict");
});

test("a malformed or oversized final image never reaches the paid audit or Drive save", () => {
  const api = server();
  api.post("saveWorkspace", { data: data(), version: 0 });
  api.post("saveAuditionSettings", { settings: { openAiApiKey: "sk-proj-" + "test".repeat(8), templateFormUrl: "https://docs.google.com/forms/d/template/edit", formsFolderUrl: "https://drive.google.com/drive/folders/forms", imageFolderUrl: "https://drive.google.com/drive/folders/images" } });
  const result = api.post("finishAuditionImage", { projectId: "project_test", characterId: "c", version: 1, step: "header", imageBase64: Buffer.from("invalid").toString("base64") });
  assert.equal(result.code, "png_invalid");
  assert.equal(api.calls.length, 0);
});
