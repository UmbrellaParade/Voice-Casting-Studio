import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { normalizeRecordingProject } from "../src/lib/recording.js";

const [backupDirectory, endpoint] = process.argv.slice(2);
assert.ok(backupDirectory && endpoint, "Backup directory and GAS endpoint are required");
assert.equal(new URL(endpoint).origin, "https://script.google.com");
const source = await fs.readFile(path.join(backupDirectory, "Code.prepared-v6.gs"), "utf8");
const token = JSON.parse(source.match(/^const SECRET_TOKEN = ("(?:[^"\\]|\\.)*");/m)[1]);
const suffix = crypto.randomBytes(6).toString("hex");
const projectId = `vcs_owner_verification_${suffix}`;
const characterId = "test_form_role";
const roleName = `GAS動作確認専用${suffix}`;
const checks = [];
const report = { at: new Date().toISOString(), projectId, checks, paidGeneration: false };
const write = async (name, data) => {
  const filename = path.join(backupDirectory, `owner-verification-${suffix}.${name}.json`);
  await fs.writeFile(filename, JSON.stringify(data, null, 2), { flag: "wx" });
  JSON.parse(await fs.readFile(filename, "utf8"));
  return { filename, bytes: (await fs.stat(filename)).size };
};
async function request(operation, payload = {}, authenticated = true) {
  const response = await fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "ownerRequest", operation, ...payload, ...(authenticated ? { token } : {}) }),
    signal: AbortSignal.timeout(180000),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const check = (condition, label) => {
  assert.ok(condition, label);
  checks.push(label);
  console.log(`PASS ${label}`);
};
const settings = await request("getAuditionSettings");
check(settings.ok && settings.protocolVersion === 3 && settings.appsScriptConfigured, "integration settings survived deployment");
check(!("openAiApiKey" in settings) && !("token" in settings), "settings response does not return secrets");
const denied = await request("getAuditionSettings", {}, false);
check(denied.ok === false, "anonymous user cannot read owner settings");
const before = await request("loadWorkspace");
assert.ok(before.ok && before.data?.recordingProjects);
report.backup = await write("before.private", before);
const project = normalizeRecordingProject({
  id: projectId, title: "GASフォーム検証専用（募集には使用しません）",
  characters: [{ id: characterId, name: `${roleName}(検証役)`, scriptName: roleName }],
  lines: [], castMembers: [], sharedAt: "",
  auditionRoleProgress: [{ characterId, auditionDeadline: "2020-01-01T23:59", auditionRoleSummary: "動作確認専用。実際の募集ではありません。" }],
});
let added = false;
try {
  const saved = await request("saveWorkspace", { version: before.version,
    data: { ...before.data, recordingProjects: [...before.data.recordingProjects, project] } });
  assert.ok(saved.ok, saved.error);
  added = true;
  check(saved.data.recordingProjects.some(item => item.id === projectId), "isolated test project saved");
  let created = await request("createAuditionForm", { version: saved.version, projectId, characterId });
  if (!created.ok && created.code === "workspace_conflict") {
    const latest = await request("loadWorkspace");
    created = await request("createAuditionForm", { version: latest.version, projectId, characterId });
  }
  report.formResult = created;
  assert.ok(created.ok, JSON.stringify({ code: created.code, error: created.error, message: created.message }));
  check(created.progress.formCreated && created.progress.formStructureVerified, "template copied and structure verified");
  check(Boolean(created.progress.formEditUrl && created.progress.formResponderUrl), "editor and respondent URLs stored");
  check(created.progress.formValidation?.fileUploadItems === 1, "one file upload question retained");
  check(created.headerThemeNeedsManualSelection && created.uploadFolderNeedsManualVerification,
    "API does not falsely claim browser finishing completed");
  check(!created.progress.headerApplied && !created.progress.uploadVerified, "unverified finishing flags remain false");
  const reloaded = await request("loadWorkspace");
  const stored = reloaded.data.recordingProjects.find(item => item.id === projectId).auditionRoleProgress[0];
  check(stored.formEditUrl === created.progress.formEditUrl, "form result survives reloading");
  const repeated = await request("createAuditionForm", { version: reloaded.version, projectId, characterId });
  assert.ok(repeated.ok, repeated.error);
  check(repeated.progress.formEditUrl === created.progress.formEditUrl, "repeat request reuses the same form");
  report.formEditUrl = repeated.progress.formEditUrl;
  report.formResponderUrl = repeated.progress.formResponderUrl;
  report.validation = repeated.progress.formValidation;
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  if (added) {
    // Remove only this run's fictional project, preserving concurrent real-work changes.
    const latest = await request("loadWorkspace");
    assert.ok(latest.ok);
    const result = await request("saveWorkspace", { version: latest.version,
      data: { ...latest.data, recordingProjects: latest.data.recordingProjects.filter(item => item.id !== projectId) } });
    assert.ok(result.ok, "Test project cleanup conflicted; retry cleanup from latest workspace");
    check(!result.data.recordingProjects.some(item => item.id === projectId), "temporary project removed from owner workspace");
    for (const original of before.data.recordingProjects) {
      const current = result.data.recordingProjects.find(item => item.id === original.id);
      assert.ok(current, "Existing project preserved");
      assert.deepEqual(current.lines, original.lines, "Existing script preserved");
      assert.deepEqual(current.characters, original.characters, "Existing characters preserved");
      assert.deepEqual(current.castMembers, original.castMembers, "Existing actor access preserved");
    }
    check(true, "existing scripts characters and actor access preserved");
    report.finalBackup = await write("after.private", result);
  }
  report.passed = checks.length;
  report.result = report.error ? "failed" : "passed";
  const savedReport = await write("report", report);
  console.log(JSON.stringify({ result: report.result, passed: checks.length, error: report.error, report: savedReport }));
}
