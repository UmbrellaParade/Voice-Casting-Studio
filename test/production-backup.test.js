import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductionBackupJson,
  makeProductionBackupFileName,
  saveProductionBackupCopies,
  saveProductionBackupToDirectory,
  writeProductionBackupFile
} from "../src/lib/production-backup.js";

const makeDirectoryHandle = (name) => {
  const files = new Map();
  return {
    name,
    files,
    async queryPermission() {
      return "granted";
    },
    async getFileHandle(fileName) {
      return {
        async createWritable() {
          return {
            async write(blob) {
              files.set(fileName, await blob.text());
            },
            async close() {}
          };
        }
      };
    }
  };
};

test("creates a timestamped production backup file name", () => {
  const date = new Date(2026, 7, 31, 21, 34, 5);
  assert.equal(makeProductionBackupFileName(date), "voice-cast-studio-backup_20260831-213405.json");
});

test("keeps the production workspace directly importable as JSON", () => {
  const data = { settings: { siteName: "Voice Cast Studio" }, recordingProjects: [{ id: "project_1" }] };
  assert.deepEqual(JSON.parse(buildProductionBackupJson(data)), data);
});

test("writes the same production backup to PC and Drive directories", async () => {
  const pcHandle = makeDirectoryHandle("PCバックアップ");
  const driveHandle = makeDirectoryHandle("Driveバックアップ");
  const data = { recordingProjects: [{ id: "project_1", title: "作品" }] };
  const result = await saveProductionBackupCopies({
    data,
    pcHandle,
    driveHandle,
    date: new Date(2026, 7, 31, 22, 10, 0)
  });

  assert.equal(result.ok, true);
  assert.equal(result.fileName, "voice-cast-studio-backup_20260831-221000.json");
  assert.equal(result.results.length, 2);
  assert.deepEqual(JSON.parse(pcHandle.files.get(result.fileName)), data);
  assert.equal(pcHandle.files.get(result.fileName), driveHandle.files.get(result.fileName));
});

test("reports an unset backup destination without losing the successful copy", async () => {
  const pcHandle = makeDirectoryHandle("PCバックアップ");
  const result = await saveProductionBackupCopies({
    data: { ok: true },
    pcHandle,
    driveHandle: null,
    date: new Date(2026, 7, 31, 22, 20, 0)
  });

  assert.equal(result.ok, false);
  assert.equal(result.results[0].ok, true);
  assert.equal(result.results[1].ok, false);
  assert.match(result.results[1].error, /未設定/);
});

test("writes a production backup through a directory handle", async () => {
  const handle = makeDirectoryHandle("保存先");
  const saved = await writeProductionBackupFile(handle, "backup.json", "{\"ok\":true}");
  assert.deepEqual(saved, { fileName: "backup.json", folderName: "保存先" });
  assert.equal(handle.files.get("backup.json"), "{\"ok\":true}");
});

test("writes one production backup directly to the selected destination", async () => {
  const handle = makeDirectoryHandle("PC direct");
  const saved = await saveProductionBackupToDirectory({
    data: { activeView: "recording" },
    handle,
    date: new Date(2026, 7, 31, 22, 5, 6)
  });

  assert.equal(saved.fileName, "voice-cast-studio-backup_20260831-220506.json");
  assert.equal(saved.folderName, "PC direct");
  assert.deepEqual(JSON.parse(handle.files.get(saved.fileName)), { activeView: "recording" });
});
