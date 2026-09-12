# date:today — Implementation Plan

## Audit (2026-09-07)

Repository was **empty**. Scaffolded Expo SDK 57, then built DateToday domain architecture from scratch.

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Foundation: structure, theme, Supabase client, auth, migrations, RLS | Done |
| 2 | Onboarding screens + profile completion gates | Done (UI + local persist; wire uploads to Storage next) |
| 3 | Live engine: sessions, go live, expiration, radius | Done (client + SQL RPCs) |
| 4 | Discovery: geo feed RPC + video-first UI | Done (UI + RPC; polish video preload next) |
| 5 | Pings: send/receive/mutual/expire | Done (SQL race-safe `send_ping` + screens) |
| 6 | Notifications: tokens, contextual permission, push fanout | Partial (permission helper + prefs schema; Edge fanout TODO) |
| 7 | Chat: realtime messaging | Partial (UI + schema; wire Realtime channels next) |
| 8 | Dates: propose/accept/feedback | Partial (UI + schema; RPCs for accept/feedback next) |
| 9 | Monetization: Stripe, +, boost | Partial (paywall UI + webhook stub; wire Prices) |
| 10 | Hardening: security, perf, tests | In progress (unit tests for age/live/entitlements/completion) |

## Delivered in this build

- Domain folders under `/features`, `/services`, `/lib`, `/store`, `/types`
- Dark design system + `d:t` app icon
- Full SQL migrations (PostGIS, RLS, live/ping RPCs, storage buckets)
- Atlanta TEST seed profiles
- Auth (email) + Apple/Google provider-ready notes
- Tabs: Live · Pings · Dates · Profile
- Go Live setup sheet, offline/live home, discovery, mutual ping, chat, dates, paywall, safety, settings, onboarding
- Edge stubs: `stripe-webhook`, `expire-sessions`
- Docs: PRODUCT, DATABASE, DEVELOPMENT, README
- Jest unit tests (11 passing)

## Next engineering priorities

1. Point `.env` at a Supabase project and `db reset`
2. Wire photo/video uploads to Storage with progress UI
3. Push notification Edge fanout on ping/mutual/message/date
4. Chat Realtime subscriptions + typing/read receipts entitlement
5. Date propose/accept RPCs + post-date feedback cron
6. Stripe Checkout / Customer Portal via Edge Functions
7. Device QA of full success-criteria loop (PRODUCT §71)

## Risk notes

- Live expiration + mutual ping stay server-side
- Discovery never returns exact lat/lng
- Entitlements only from Stripe webhooks
- Do not disable RLS to “fix” client errors
