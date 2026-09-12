# date:today — Product Rules

> Future agents: read this before changing product behavior. Do **not** turn DateToday into a swipe app.

## Positioning

**date:today** is a video-first, same-day dating platform.

Tagline: **Go live. Get pinged. Go out.**  
Secondary: Single today. Date tonight.

Users explicitly turn themselves **LIVE** when available to meet that day (driver online/offline model). Discovery only shows currently live people.

## Core loop

```
GO LIVE → DISCOVER LIVE PEOPLE → SEND PING → MUTUAL PING → CHAT → PLAN DATE → GO OUT
```

## Non-negotiables

1. **VIDEO FIRST** — discovery is full-screen vertical video, not photo cards.
2. **SAME-DAY FIRST** — optimize for tonight, not endless browsing.
3. **ACTIVE ONLY** — discovery = currently live + non-expired sessions. Never fake nearby profiles.
4. **INTENTIONAL LIVE** — going live requires setup (activities, availability, radius, expiration).
5. **OFFLINE = HIDDEN** — no dating/discovery/ping notifications when offline (safety/account/billing/active chat/scheduled dates still allowed).
6. **SERVER-AUTHORITATIVE LIVE** — expiration lives in Postgres; never trust client timers alone.
7. **BACKGROUND OK** — live sessions continue when app is closed; push brings users back.
8. **PING ≠ LIKE** — UI says Ping, never Like as primary interaction.
9. **MUTUAL = "IT'S A PING"** — never customer-facing "It's a Match!"
10. **REAL DATES** — product optimizes for going out, not maximizing swipes.

## Availability model

| State | Discovery | Dating pings | Chat / scheduled dates |
|-------|-----------|--------------|------------------------|
| Offline | Hidden | No new dating pings | Allowed |
| Live | Visible in radius | Can send/receive | Allowed |

Every live session **must expire** (max 12 hours). `is_live` is derived from an active, non-expired `live_sessions` row.

## Copy rules

- Mutual: **IT'S A PING ⚡** — "You both want to meet tonight."
- Confirmed date: **TONIGHT'S ON ⚡**
- Live CTA: **START PINGING** / **GO LIVE ⚡** / **STOP PINGING**
- Never: "It's a Match!", primary "Like", heart-heavy romantic UI

## Age & safety

- Strictly 18+. DOB collected; only age shown publicly.
- Block/report/unmatch are first-class.
- Exact GPS never exposed — approximate distance + neighborhood only.
- Verification statuses must be real; do not mark everyone verified.

## Monetization (entitlement-driven)

- **Free**: live, browse, limited pings/session, basic filters, chat, plan dates
- **DateToday+**: unlimited pings, advanced filters, more received pings, extended radius, priority ranking, optional read receipts
- **Tonight Boost**: one-time, live-only ranking boost via Stripe (never hardcode price in business logic)

## What not to build

- Tinder-like swipe decks as the product
- Photo-first discovery
- Fake supply when quiet
- Client-only live timers
- Stripe secrets in the app
- Disabled RLS
- Engagement spam while offline
