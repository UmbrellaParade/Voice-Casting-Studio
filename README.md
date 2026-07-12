# Umbrella Parade Voice Casting Studio

Voice Casting Studio is a voice drama audition management tool based on Radio Article Studio.

It keeps the original Umbrella Parade header style and local-first workflow, then narrows the visible screens to the audition workflow:

- create and publish audition forms
- set form reception dates and submission limits inside each form
- receive WAV/MP3 audition recordings
- save response JSON and attachments to a configured Google Drive folder
- sync submitted responses back into the management screen
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
