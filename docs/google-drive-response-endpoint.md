# Google Drive Response Endpoint

Voice Casting Studio is a static GitHub Pages app, so form submissions are received by Google Apps Script.

For the current GAS owner workspace and audition services, follow the [current setup in README](../README.md#gas-owner-workspace-and-shared-recording). This endpoint also retains the older form-submission routes described below; those are not a separate installation.

The Apps Script endpoint handles:

- public form submission
- response JSON storage
- WAV/MP3 and image attachment storage in Google Drive
- response list sync back to the management screen
- short URL form payload publishing
- recording script publishing and progress sync
- actor recording uploads and director review updates

## Folder Layout

The configured Drive folder will contain files like this:

```text
Voice Casting Responses/
├─ _forms/
├─ _responses/
├─ _recording_projects/
│  └─ recording_project_id.json
├─ 収録提出/
│  └─ 作品名/
│     └─ 声優さん名/
│        └─ 20260720-120000_recording.wav
├─ ボイスドラマ声優応募フォーム/
│  ├─ 20260712-120000_applicant_sample.wav
│  └─ ...
└─ 回答ログ
```

If a submission is tied to a募集企画, the attachment folder uses that企画名. Otherwise it falls back to the form name.

## Setup

1. Run `npm run build:all` and create an Apps Script project owned by the person who will use this installation.
2. Copy the generated `artifacts/paired-build/gas-backend/Code.gs` and `appsscript.json`. Do not copy the split source file alone.
3. Set `SECRET_TOKEN` to a unique random secret of at least 32 characters and `FOLDER_ID` to that owner's shared recording folder.
4. Run `authorizeVoiceCastStudio`; the owner reviews and approves the requested Google permissions.
5. Deploy as a Web app, executing as the owner. Review access settings; anonymous actor links require access for anyone, with owner and actor operations protected by their distinct secrets.
6. Copy the `/exec` URL into `設定 > GAS制作オーナー接続`, together with the shared Drive folder URL and owner token.
7. Configure the owner's own OpenAI/ElevenLabs keys and audition resources in the corresponding tool settings. Never include real keys or tokens in distributed source or give actors Apps Script editing access.

`FOLDER_ID` in `Code.gs` is only a fallback. The tool setting `回答保存先Google DriveフォルダーURL` takes priority.

## Shared Recording Board

The recording board uses the same Apps Script deployment and `SECRET_TOKEN`.

1. In Settings, complete `GAS制作オーナー接続` as described above.
2. Confirm that the owner workspace has loaded and the shared Drive folder is set.
3. Open `台本`, then `配役・共有`.
4. Assign one or more characters to each actor.
5. Select `共有を開始`.
6. Copy each actor's dedicated URL and send it to that actor.

The actor URL contains an access key. An actor can view the shared script and progress, but can only change recording fields for assigned characters. Director-only review fields require the `SECRET_TOKEN`.

When `共同収録 Apps Script URL` or its Drive folder is blank, the response endpoint settings are reused.

Script ruby readings are stored inside each line with Aozora Bunko-style notation such as `｜覚悟《かくご》`. The management and actor views render that notation as HTML ruby text. The same notation can be entered directly in a Google Sheets/CSV script source.

## Google Docs Script Paste

Open `収録ボード > 台本編集`, select `Google Docs`, and paste the full document text. The preview recognizes common screenplay forms such as:

```text
〇雨上がり
アマモリ「本当に行くつもりなの？」
ヴェル
「うん。もう｜決めた《きめた》んだ。」
（静かな決意で）
```

Scene headings, inline dialogue, speaker names on a separate line, and parenthetical directions are detected before import. Unrecognized prose is retained as `ト書き`, displayed to both sides, and excluded from recording progress. Choose whether to replace the current script or append to it before applying the preview.
