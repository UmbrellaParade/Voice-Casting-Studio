# Voice Cast Studio Theme

Dedicated private WordPress theme for the Umbrella Parade voice drama production workspace.

Build the React assets from the repository root:

```bash
npm run build:wordpress
```

Install this folder as a WordPress theme. The site root shows shared production content in a login-free read-only view. Production owners sign in to WordPress, while actors open an unguessable member-specific share URL to add recording checks and questions without a username or password. Recordings remain in Google Drive. WordPress media uploads are restricted to JPEG, PNG, and WebP images.

Use `Voice Script Owner` or `Administrator` for the person who may replace, edit, delete, and restore scripts. Use `Voice Director` for production staff who manage recording reviews, cast, materials, questions, and schedules without script editing rights. `Voice Actor` remains available for account-based access, but ordinary cast sharing uses the login-free URL shown in the character screen.
