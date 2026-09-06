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
- manage audition forms, applicants, contact templates, and SNS drafts from Tasks
- export/import local backups

The older standalone audition screens remain hidden while `SHOW_AUDITION_WORKFLOW` in `src/main.jsx` is `false`. The current audition workflow is available in Tasks.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:all
```

This runs the shared tests and builds both versions from the same source. The GAS frontend is generated in `dist/` for GitHub Pages at `/Voice-Casting-Studio/`. The WordPress theme and bundled GAS backend are generated under `artifacts/paired-build/`; their build metadata records the same source hash. See [docs/gas-parity.md](docs/gas-parity.md) for the deployment checklist and verified/pending capabilities.

## Dedicated WordPress Theme

The private subdomain can run Voice Casting Studio as its whole WordPress experience without a separate plugin and without modifying WordPress core.

```bash
npm run build:all
```

The paired release theme is generated at `artifacts/paired-build/wordpress/voice-casting-studio`. Zip that directory with `voice-casting-studio/` as the archive root. Keep a backup before updating the installed theme. See [docs/wordpress-theme-setup.md](docs/wordpress-theme-setup.md) for roles and Drive permissions.

## GAS Owner Workspace and Shared Recording

1. Run `npm run build:all`. Each production owner creates their own Apps Script project and Drive folder.
2. Copy **both** generated files from `artifacts/paired-build/gas-backend/`: `Code.gs` and `appsscript.json`. Enable the manifest in the Apps Script project settings to edit it. Do not deploy the split source `docs/google-apps-script/Code.gs` alone.
3. Replace the `SECRET_TOKEN` placeholder with a unique, randomly generated secret of at least 32 characters and set `FOLDER_ID` to this owner's shared recording folder. Never commit these values or send the owner token to voice actors.
4. Run `authorizeVoiceCastStudio` in the editor. The owner reviews and approves Drive, Forms, Sheets, external request, and trigger permissions themselves.
5. Deploy as a Web app, executing as this owner. To use actor links without a Google sign-in, permit access to anyone; server-side owner tokens and individual actor keys still protect operations. Review this access choice before publishing.
6. In the tool's Settings, open `GAS制作オーナー接続`. Enter the deployed `/exec` URL, the shared Drive folder URL, and the owner token, then connect.
7. The owner workspace is stored in a separate private My Drive JSON file. Only an empty workspace is initialized from existing browser data. Actor-facing data is published separately from `台本 > 配役・共有`.
8. In Tasks, configure this owner's template form, form folder, image folder, logo, and OpenAI API key. Configure their ElevenLabs key under Materials. Keys are stored in this installation's Script Properties, not in shared recording responses or the frontend bundle.

Distributions must not include Belbo's API keys, owner token, private workspace backup, or personal integration defaults. Each receiving production owner supplies their own API keys and pays for their own usage. Voice actors do not need those keys and must not be added as Apps Script editors; editors can read Script Properties.

Google Form theme headers, upload-folder recovery, and image attachment to X use the existing local `start-audition-finisher.cmd` helper and its logged-in Chrome profile. For another frontend origin, set `VCS_ALLOWED_ORIGINS` to the exact HTTPS origin before starting the helper. These PC-assisted actions are not cloud-only features.

After changing the GAS backend, update the existing Apps Script deployment to a new version. Publishing GitHub Pages does not update Apps Script or WordPress automatically. Check [the parity record](docs/gas-parity.md) before calling a release fully verified.
