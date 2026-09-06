import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { makeGasPublishedProject } from "../src/lib/gas-workspace.js";
import { normalizeRecordingProject } from "../src/lib/recording.js";

// Memory-only GAS emulator. No production endpoints, credentials or Drive writes.
let json = JSON.stringify(makeGasPublishedProject(normalizeRecordingProject({
  id: "gas_demo", title: "GAS版 動作確認用作品", description: "本番とは別のテストデータ", sharedAt: "2026-09-06T00:00:00.000Z",
  characters: [{ id: "ao", name: "アオ", color: "#168b9a", recordingFolderUrl: "https://drive.google.com/" },
    { id: "midori", name: "ミドリ", color: "#b04f74" }],
  castMembers: [{ id: "actor_a", actorName: "声優テストA", socialUrl: "https://x.com/example", characterIds: ["ao"], accessKey: "demo-a" },
    { id: "actor_b", actorName: "声優テストB", characterIds: ["midori"], accessKey: "demo-b" }],
  lines: [
    { id: "chapter1", chapterTitle: "第一章", manualBody: true, kind: "direction", text: "## シーン1\nSE：静かな風。\nアオ「おはよう。今日はいい天気だね。」\nミドリ「さあ、出発しよう。」\n## シーン2\nアオ「ここで少し休もう。」" },
    { id: "chapter2", chapterTitle: "第二章", manualBody: true, kind: "direction", text: "## シーン1\nアオ「やっと着いたね。」\nミドリ「お疲れさま。」" }
  ],
  materials: [{ id: "music", title: "試聴テスト", category: "SE", url: "http://127.0.0.1:5272/tone.wav", status: "完成" }],
  sharedLinks: [{ id: "link", title: "作品資料", url: "https://example.com/" }],
  scheduleItems: [{ id: "date", title: "収録確認", date: "2026-10-01", type: "確認日" }],
  tasks: [{ id: "task", title: "本番前の動作確認", completed: false }],
  questions: [{ id: "question_demo", authorName: "声優テストA", castMemberId: "actor_a", body: "この読み方でよいですか？", answer: "はい、その読み方でお願いします。", status: "回答済み", createdAt: "2026-09-06T00:00:00.000Z" }]
}), { title: "共有テスト", body: "制作オーナーと声優さんが同じ作品を確認するためのテストです。", vision: "台本・進捗・質問をひとつの画面で共有します。" }));
const file = { getBlob: () => ({ getDataAsString: () => json }), setContent: (value) => { json = value; } };
const folder = { getFoldersByName: () => ({ hasNext: () => true, next: () => folder }),
  getFilesByName: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return file; } }; } };
const context = vm.createContext({
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: (body) => ({ setMimeType: () => body }) },
  DriveApp: { getFolderById: () => folder },
  Utilities: { getUuid: () => crypto.randomUUID() },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
});
vm.runInContext(readFileSync(new URL("../docs/google-apps-script/Code.gs", import.meta.url), "utf8")
  .replace('const SECRET_TOKEN = "ここを好きな合言葉に変更";', 'const SECRET_TOKEN = "demo-owner";'), context);
const wav = Buffer.alloc(44 + 22050 * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 22050; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 22050) * 700), 44 + i * 2);
createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  const url = new URL(request.url, "http://127.0.0.1:5272");
  if (url.pathname === "/tone.wav") { response.setHeader("Content-Type", "audio/wav"); response.end(wav); return; }
  let body = "";
  for await (const chunk of request) body += chunk;
  response.setHeader("Content-Type", "application/json");
  try {
    response.end(request.method === "POST" ? context.doPost({ postData: { contents: body } }) : context.doGet({ parameter: Object.fromEntries(url.searchParams) }));
  } catch (error) { response.end(JSON.stringify({ ok: false, error: error.message })); }
}).listen(5272, "127.0.0.1", () => console.log("Memory-only GAS test receiver: http://127.0.0.1:5272"));
