# Google Drive Response Endpoint

Voice Casting Studio is a static GitHub Pages app, so form submissions are received by Google Apps Script.

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

1. Open Google Apps Script and create a new project.
2. Copy `docs/google-apps-script/Code.gs` into the editor.
3. Set `SECRET_TOKEN` to any private passphrase.
4. Deploy as a Web app.
5. Set access to anyone with the link.
6. Copy the Web app URL.
7. In Voice Casting Studio Settings, paste it into `回答保存Webhook URL`.
8. Paste the same passphrase into `回答同期トークン`.
9. Paste the target Drive folder URL into `回答保存先Google DriveフォルダーURL`.
10. Publish/update the form short URL.

`FOLDER_ID` in `Code.gs` is only a fallback. The tool setting `回答保存先Google DriveフォルダーURL` takes priority.

## Shared Recording Board

The recording board uses the same Apps Script deployment and `SECRET_TOKEN`.

1. In Settings, enter the Web app URL in `共同収録 Apps Script URL`.
2. Enter the target Drive folder in `共同収録 Google DriveフォルダーURL`.
3. Open `収録ボード`, then `配役・共有`.
4. Assign one or more characters to each actor.
5. Select `共有を開始`.
6. Copy each actor's dedicated URL and send it to that actor.

The actor URL contains an access key. An actor can view the shared script and progress, but can only change recording fields for assigned characters. Director-only review fields require the `SECRET_TOKEN`.

When `共同収録 Apps Script URL` or its Drive folder is blank, the response endpoint settings are reused.

Script ruby readings are stored inside each line with Aozora Bunko-style notation such as `｜覚悟《かくご》`. The management and actor views render that notation as HTML ruby text. The same notation can be entered directly in a Google Sheets/CSV script source.
