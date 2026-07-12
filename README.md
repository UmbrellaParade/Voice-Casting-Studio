# Umbrella Parade Voice Casting Studio

Voice Casting Studio is a browser-based tool for creating voice actor audition forms and receiving submitted recordings through Google Drive.

## Features

- Build audition forms.
- Add recording upload questions for voice samples.
- Set application periods.
- Choose a Google Drive folder for form responses and recordings.
- Share portable compressed form URLs.
- Publish short form URLs through Google Apps Script.
- Sync received responses back into the management screen.

## Development

```bash
npm install
npm run dev
```

## GitHub Pages

The app is built with Vite and configured for:

```text
https://umbrellaparade.github.io/Voice-Casting-Studio/
```

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the app on pushes to `main`.

## Google Apps Script

Use:

```text
docs/google-apps-script/Code.gs
```

Setup notes:

```text
docs/google-drive-response-endpoint.md
```

For short published URLs (`#/r/...`), put the deployed GAS Web App URL into:

```text
public/app-config.json
```

Portable compressed URLs (`#/s/...`) work without editing `app-config.json` because the form payload carries the submission endpoint.
