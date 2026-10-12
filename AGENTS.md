# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Cloud Agent

Expo SDK 57 needs Node.js 22.13 or newer. This environment already provides it. Skip the README `nvm use 20` step.

- App dependencies: `npm ci --no-audit --no-fund`
- Cloud Functions dependencies: `npm ci --prefix functions --no-audit --no-fund`
- If `.env` is missing, copy `.env.example`. Empty `EXPO_PUBLIC_FIREBASE_*` values fall back to the client config in `app.json` and `lib/env.ts`.
- Web app: `npx expo start --web --host lan --port 8081`, then open http://localhost:8081. In dev, Welcome includes "Login for me (dev)", which opens the Live tab with a local session.
- Tests: `npm test`
- `functions/` deploys to Firebase and is not started with the web app. Files under `supabase/` are leftover; Firebase is the backend.
