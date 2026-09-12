# date:today — Database Architecture

PostgreSQL via Supabase. PostGIS for geographic queries. UUID PKs. RLS mandatory.

## Entity overview

```
auth.users
  └── public.users (account/security)
        └── profiles (public dating profile)
              ├── profile_photos
              ├── profile_videos (+ video_prompts)
              └── dating_preferences
        └── live_sessions
              ├── live_session_activities
              ├── live_session_video (tonight video)
              └── boosts
        └── pings → matches → conversations → messages
        └── dates → date_participants → date_feedback
        └── blocks / reports / moderation_actions
        └── push_tokens / notification_preferences
        └── subscriptions / purchases
```

## Core tables

### users
Internal account metadata linked to `auth.users.id`.
- `id` UUID PK = auth.users.id
- `email`, `date_of_birth` (private), `age_confirmed_at`
- `role` (`user` | `admin` | `moderator`)
- `account_status` (`active` | `suspended` | `banned` | `deleted`)
- `trust_score` (internal, never public)
- `stripe_customer_id`
- `community_standards_accepted_at`
- `onboarding_completed_at`
- `deleted_at`

### profiles
Public dating profile.
- `user_id` PK/FK
- `display_name`, `bio`, `gender_id`, `height_cm`, occupation, school, hometown
- `zodiac`, drinking/smoking/marijuana/children enums
- `verification_status` (`unverified` | `pending` | `verified` | `failed` | `manual_review`)
- `main_photo_url`, `neighborhood_label`
- `profile_completion` jsonb checklist
- **No** public DOB; age computed server-side via RPC/view

### live_sessions
Auditable live history. Current live = `status = 'active' AND expires_at > now() AND ended_at IS NULL`.
- `started_at`, `expires_at`, `ended_at`, `status` (`active` | `expired` | `ended`)
- `radius_miles`, `latitude`, `longitude`, `geography` (geography Point, SRID 4326)
- `available_from`, `available_until` (tonight window labels / timestamps)
- Exact coords **never** selected for other users via RLS/views

### pings
- `sender_id`, `recipient_id`, session FKs
- `status` (`pending` | `mutual` | `withdrawn` | `expired` | `rejected`)
- Unique active pending ping per (sender, recipient, recipient_live_session)
- Mutual detection via transactional RPC `send_ping`

### matches
- Ordered pair uniqueness: `user_a_id < user_b_id`
- `status` (`active` | `unmatched` | `blocked`)

## Live eligibility (server)

A user appears in discovery iff:
1. Active non-expired live session
2. Inside mutual radius (PostGIS)
3. Mutual gender interest
4. Not blocked either direction
5. Account active, 18+, not self
6. Profile complete for live

Discovery ranking (deterministic): distance → overlapping availability → overlapping activities → preference fit → profile quality → recent activity → boost.

## RLS principles

- Users read/write own rows for profile, preferences, notification settings, own live sessions
- Discovery via security-definer RPCs that strip exact coordinates
- Conversation members only for messages
- Subscriptions/purchases/trust/verification: server/webhook only (no client forge)
- Blocks hide both directions immediately

## Storage buckets

| Bucket | Purpose |
|--------|---------|
| profile-photos | Main + gallery photos |
| profile-videos | Permanent prompt videos |
| tonight-videos | Live-session-only videos |
| chat-media | Optional chat images |

Policies: owner write; authenticated read for public profile media; chat-media members only. Validate mime + size in Edge Functions / storage policies.

## Sensitive RPCs (security definer)

- `get_discovery_feed`
- `send_ping` / `withdraw_ping`
- `end_live_session`
- `start_live_session`
- `propose_date` / `respond_to_date`
- Age helper: `calculate_age(dob)`

## Cron / scheduled

- Expire live sessions (`expires_at < now()`)
- Expire pending pings (session end / day rollover)
- Expire boosts
- Soft-delete tonight videos after session end

Discovery queries **must** also filter `expires_at > now()` even if cron lags.

See `supabase/migrations/` for full DDL + policies.
