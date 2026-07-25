# Umbrella Parade Voice Casting Studio

Voice Casting Studio is a shared voice drama script and recording management tool based on Radio Article Studio.

The main screen is a recording board shared by the director and voice actors:

- paste a full script from Google Docs and preview detected scenes, speakers, dialogue, and stage directions
- import structured scripts from Google Sheets, Excel, TSV, or CSV
- add ruby readings in the editor or import `｜漢字《かんじ》` notation from a sheet
- filter by one character or extract dialogue between multiple characters
- show neighboring lines as recording context
- assign characters and issue a dedicated URL to each actor
- share recorded, submitted, approved, retake, and hold progress
- upload MP3/WAV/M4A files to Google Drive or submit a Drive URL
- keep the former audition workflow dormant in the codebase for possible reuse
- export/import local backups

The audition overview, campaign, Google Forms, response import, and applicant review screens are hidden while `SHOW_AUDITION_WORKFLOW` in `src/main.jsx` is `false`.

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
5. Paste the Web app URL into the tool's Settings as `共同収録 Apps Script URL`.
6. Paste the same token into `共同収録 同期トークン`.
7. Paste the target Drive folder URL into `共同収録 Google DriveフォルダーURL`.

Publish the project from `収録ボード > 配役・共有` after setting the shared recording connection. The same Apps Script deployment still supports the dormant audition workflow when it is re-enabled.
