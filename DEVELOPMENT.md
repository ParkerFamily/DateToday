# date:today — Development Guide

## Architecture

```
/app                 Expo Router screens
/components          Shared UI primitives
/features/*          Domain modules (auth, live, pings, …)
/hooks               Shared hooks
/lib                 Supabase, Stripe, analytics, entitlements
/services            API/service layer
/store               Zustand local state
/types               Shared TypeScript types
/constants           Theme, copy, config
/utils               Pure helpers
/supabase            Migrations, Edge Functions, seed
```

Stack: Expo (SDK 57) · React Native · TypeScript · Expo Router · Supabase · TanStack Query · Zustand · RHF + Zod · Stripe (Edge) · Expo Notifications · PostGIS

## Environment variables

Copy `.env.example` → `.env` (never commit secrets).

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_APP_ENV=development

# Edge Functions / server only (Supabase secrets)
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_DATETODAY_PLUS_MONTHLY=
STRIPE_PRICE_TONIGHT_BOOST=
```

## Local setup

```bash
nvm use 20
npm install
npx expo start
```

Supabase (requires [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
npx supabase start
npx supabase db reset   # applies migrations + seed
npx supabase functions serve
```

Point `.env` at local Supabase (`supabase status` for keys).

## Database

Migrations: `supabase/migrations/`  
Docs: `DATABASE.md`  
Product rules: `PRODUCT.md`

```bash
npx supabase migration up
npx supabase db lint
```

## Stripe

1. Create Products: DateToday+ (subscription), Tonight Boost (one-time)
2. Put Price IDs in Edge secrets
3. Webhook → `stripe-webhook` function; persist entitlements from verified events only
4. Never put `STRIPE_SECRET_KEY` in the mobile app

## Push notifications

1. Configure Expo project + EAS credentials
2. Register token via `features/notifications` after contextual permission prompt (at Go Live)
3. Fanout from Edge Functions / DB triggers — do not rely on open WebSocket alone

Offline users: no discovery/marketing/ping bait. Allow safety, moderation, account, billing, active chat, scheduled dates.

## Auth

Email/password + Apple + Google. Phone auth reserved for later.  
`users` = account/security; `profiles` = public dating data.

## Testing

```bash
npm test
```

Critical unit coverage: age, live expiration, geo compatibility, blocks, ping duplicate/mutual, entitlements.

## Deployment

1. EAS Build (`eas build`)
2. Supabase production project + migrate
3. Deploy Edge Functions
4. Configure Stripe webhook production URL
5. App Store / Play listing (18+)

## Known TODOs

- [ ] Wire real video liveness verification provider (keep `verification_status` honest)
- [ ] Google Places for venue search
- [ ] Always-on location only if product later requires it
- [ ] Captions for video prompts (a11y)
- [ ] Admin web console (schema is admin-ready)
- [ ] Travel mode (DateToday+)
- [ ] Replace seed placeholder videos with licensed stock

## Implementation phases

See `IMPLEMENTATION.md`.
