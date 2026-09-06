import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexAuditPrompt,
  buildCodexConnectionPrompt,
  buildCodexFolderPrompt,
  getConnectionDocumentUrlState,
  normalizeManualProjectName
} from "../src/lib/manual-setup.js";

test("作品名を整えて保存先作成の指示文へ反映する", () => {
  const projectName = normalizeManualProjectName("  雨を晴らせない男   の復活劇  ");
  const prompt = buildCodexFolderPrompt({
    projectName,
    publicUrl: "https://voice.example.com"
  });

  assert.equal(projectName, "雨を晴らせない男 の復活劇");
  assert.match(prompt, /作品名：雨を晴らせない男 の復活劇/);
  assert.match(prompt, /雨を晴らせない男 の復活劇_Voice Cast Studio/);
  assert.match(prompt, /https:\/\/voice\.example\.com/);
  assert.doesNotMatch(prompt, /\[作品名\]|\[URL/);
});

test("接続情報ドキュメントは作品名から探す指示をURLなしで作れる", () => {
  const prompt = buildCodexConnectionPrompt({
    projectName: "テスト作品",
    publicUrl: "https://voice.example.com"
  });

  assert.match(prompt, /親フォルダー「テスト作品_Voice Cast Studio」を検索/);
  assert.match(prompt, /Voice Cast Studio 接続情報（オーナー限定）/);
  assert.doesNotMatch(prompt, /\[URL\]/);
});

test("指定されたGoogleドキュメントURLを接続指示へ使う", () => {
  const documentUrl = "https://docs.google.com/document/d/abc123/edit";
  const state = getConnectionDocumentUrlState(documentUrl);
  const prompt = buildCodexConnectionPrompt({ projectName: "テスト作品", documentUrl });

  assert.equal(state.status, "valid");
  assert.match(prompt, /指定URLを使用：https:\/\/docs\.google\.com\/document\/d\/abc123\/edit/);
});

test("Googleドキュメント以外のURLを接続情報として受け付けない", () => {
  const driveFolder = getConnectionDocumentUrlState("https://drive.google.com/drive/folders/abc123");
  const malformed = getConnectionDocumentUrlState("URLをここに入力");

  assert.equal(driveFolder.status, "invalid");
  assert.equal(malformed.status, "invalid");
});

test("監査指示も作品名と公開URLを自動反映する", () => {
  const prompt = buildCodexAuditPrompt({
    projectName: "テスト作品",
    publicUrl: "https://voice.example.com"
  });

  assert.match(prompt, /作品名：テスト作品/);
  assert.match(prompt, /公開URL：https:\/\/voice\.example\.com/);
  assert.doesNotMatch(prompt, /\[作品名\]|\[URL\]/);
});
