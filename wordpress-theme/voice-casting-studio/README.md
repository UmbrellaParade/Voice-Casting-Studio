# Voice Casting Studio Theme

Dedicated private WordPress theme for the Umbrella Parade voice drama production workspace.

Build the React assets from the repository root:

```bash
npm run build:wordpress
```

Install this folder as a WordPress theme. The site requires login and stores actor recordings in Google Drive only. WordPress media uploads are restricted to JPEG, PNG, and WebP images.

Use `Voice Script Owner` or `Administrator` for the person who may replace, edit, delete, and restore scripts. Use `Voice Director` for production staff who manage recording reviews, cast, materials, questions, and schedules without script editing rights. Use `Voice Actor` for cast members.
