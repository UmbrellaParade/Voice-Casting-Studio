# Umbrella Parade Voice Casting Studio

Voice Casting Studio is a shared voice drama script and recording management tool based on Radio Article Studio.

The current product is a voice drama production workspace shared by the director and voice actors:

- track recording, review, questions, deadlines, and announcements from Home
- paste a full script from Google Docs and preview detected chapters, scenes, speakers, dialogue, and stage directions
- choose progress-preserving differential updates, a true full replacement, or an append import
- automatically archive the script before updates, replacements, deletions, and restores, while retaining the pasted source text
- navigate from the full script to a chapter, then to a scene without merging repeated scene names across chapters
- import structured scripts from Google Sheets, Excel, TSV, or CSV
- add ruby readings in the editor or import `｜漢字《かんじ》` notation from a sheet
- filter by one character or extract dialogue between multiple characters
- show neighboring lines as recording context
- assign characters and issue a dedicated URL to each actor
- share recorded, submitted, approved, retake, and hold progress
- keep actor recordings in Google Drive and store only their Drive URLs in WordPress
- separate WordPress access into production owner, production director, and voice actor permissions
- manage character profiles, assigned actors, Drive folders, production materials, questions, schedules, and announcements
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

## Dedicated WordPress Theme

The private subdomain can run Voice Casting Studio as its whole WordPress experience without a separate plugin and without modifying WordPress core.

```bash
npm run build:wordpress
```

The installable theme is generated at `wordpress-theme/voice-casting-studio`. See [docs/wordpress-theme-setup.md](docs/wordpress-theme-setup.md) for installation, roles, Drive permissions, and update steps.

## Google Drive Response Endpoint

1. Create a Google Apps Script project.
2. Copy `docs/google-apps-script/Code.gs` into the project.
3. Set `SECRET_TOKEN` in the script.
4. Deploy it as a Web app available to anyone with the link.
5. Paste the Web app URL into the tool's Settings as `共同収録 Apps Script URL`.
6. Paste the same token into `共同収録 同期トークン`.
7. Paste the target Drive folder URL into `共同収録 Google DriveフォルダーURL`.

Publish the project from `収録ボード > 配役・共有` after setting the shared recording connection. The same Apps Script deployment still supports the dormant audition workflow when it is re-enabled.
