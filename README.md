# date:today

**Go live. Get pinged. Go out.**

Video-first, same-day dating. Users turn themselves LIVE when available to meet that day — not endless swiping.

Read **[PRODUCT.md](./PRODUCT.md)** before changing product behavior.

## Stack

Expo · React Native · TypeScript · Expo Router · Supabase · PostGIS · TanStack Query · Zustand · Zod · Stripe (Edge) · Expo Notifications

## Quick start

```bash
nvm use 20
cp .env.example .env
npm install
npx expo start
```

Configure Supabase URL + anon key in `.env`. See **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

Database schema + RLS: **[DATABASE.md](./DATABASE.md)** · migrations in `supabase/migrations/`.

```bash
npm test
```

## Core loop

`GO LIVE → DISCOVER LIVE → PING → IT'S A PING → CHAT → PLAN DATE → GO OUT`

## Docs

| File | Purpose |
|------|---------|
| PRODUCT.md | Product rules (do not turn this into Tinder) |
| DATABASE.md | Schema + RLS overview |
| DEVELOPMENT.md | Env, local, Stripe, push, deploy |
| IMPLEMENTATION.md | Phase plan + status |
