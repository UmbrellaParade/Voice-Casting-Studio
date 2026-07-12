# Google Drive Response Endpoint

Voice Casting Studio is a static GitHub Pages app, so form submissions are received by Google Apps Script.

The Apps Script endpoint handles:

- public form submission
- response JSON storage
- WAV/MP3 and image attachment storage in Google Drive
- response list sync back to the management screen
- short URL form payload publishing

## Folder Layout

The configured Drive folder will contain files like this:

```text
Voice Casting Responses/
├─ _forms/
├─ _responses/
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
