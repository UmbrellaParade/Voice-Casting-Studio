# Umbrella Parade Voice Casting Studio

Voice Casting Studio is a shared script recording and voice audition management tool based on Radio Article Studio.

The main screen is a recording board shared by the director and voice actors:

- paste a full script from Google Sheets, Excel, TSV, or CSV
- filter by one character or extract dialogue between multiple characters
- show neighboring lines as recording context
- assign characters and issue a dedicated URL to each actor
- share recorded, submitted, approved, retake, and hold progress
- upload MP3/WAV/M4A files to Google Drive or submit a Drive URL
- keep Google Forms audition import and applicant review screens
- export/import local backups

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The production build is configured for GitHub Pages at `/Voice-Casting-Studio/`.

## Google Drive Response Endpoint

1. Create a Google Apps Script project.
2. Copy `docs/google-apps-script/Code.gs` into the project.
3. Set `SECRET_TOKEN` in the script.
4. Deploy it as a Web app available to anyone with the link.
5. Paste the Web app URL into the tool's Settings as `回答保存Webhook URL`.
6. Paste the same token into `回答同期トークン`.
7. Paste the target Drive folder URL into `回答保存先Google DriveフォルダーURL`.

After changing webhook or Drive settings, publish/update the form short URL again so respondents receive the latest save destination.

The same Apps Script deployment supports the shared recording board. Set `共同収録 Apps Script URL` and `共同収録 Google DriveフォルダーURL`, then publish the project from `収録ボード > 配役・共有`.
