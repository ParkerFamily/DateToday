-- =============================================================================
-- date:today — initial schema
-- Extensions, enums, tables, functions, triggers, RLS, grants
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE public.account_status AS ENUM (
  'active',
  'suspended',
  'banned',
  'deleted'
);

CREATE TYPE public.user_role AS ENUM (
  'user',
  'admin',
  'moderator'
);

CREATE TYPE public.verification_status AS ENUM (
  'unverified',
  'pending',
  'verified',
  'failed',
  'manual_review'
);

CREATE TYPE public.dating_intention AS ENUM (
  'long_term',
  'short_term',
  'casual',
  'open',
  'figuring_out'
);

CREATE TYPE public.interest_option AS ENUM (
  'men',
  'women',
  'everyone'
);

CREATE TYPE public.live_session_status AS ENUM (
  'active',
  'expired',
  'ended'
);

CREATE TYPE public.ping_status AS ENUM (
  'pending',
  'mutual',
  'withdrawn',
  'expired',
  'rejected'
);

CREATE TYPE public.match_status AS ENUM (
  'active',
  'unmatched',
  'blocked'
);

CREATE TYPE public.date_status AS ENUM (
  'proposed',
  'accepted',
  'declined',
  'cancelled',
  'completed',
  'no_show'
);

CREATE TYPE public.report_status AS ENUM (
  'open',
  'reviewing',
  'resolved',
  'dismissed'
);

CREATE TYPE public.report_reason AS ENUM (
  'harassment',
  'impersonation',
  'underage',
  'scam_spam',
  'inappropriate_content',
  'safety_concern',
  'no_show',
  'other'
);

CREATE TYPE public.subscription_status AS ENUM (
  'active',
  'canceled',
  'past_due',
  'trialing',
  'incomplete',
  'expired'
);

CREATE TYPE public.lifestyle_habit AS ENUM (
  'never',
  'sometimes',
  'often',
  'prefer_not_to_say'
);

CREATE TYPE public.children_status AS ENUM (
  'none',
  'have_children',
  'prefer_not_to_say'
);

CREATE TYPE public.wants_children AS ENUM (
  'yes',
  'no',
  'maybe',
  'prefer_not_to_say'
);

CREATE TYPE public.feedback_quality AS ENUM (
  'great',
  'okay',
  'not_great'
);

CREATE TYPE public.feedback_outcome AS ENUM (
  'happened',
  'they_cancelled',
  'i_cancelled',
  'neither_showed',
  'other'
);

CREATE TYPE public.tonight_activity AS ENUM (
  'dinner',
  'drinks',
  'coffee',
  'activity',
  'walk',
  'movie',
  'chill',
  'surprise_me'
);

-- =============================================================================
-- HELPER: updated_at trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- =============================================================================
-- REFERENCE TABLES
-- =============================================================================

CREATE TABLE public.genders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE public.video_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- =============================================================================
-- USERS (account / security — linked to auth.users)
-- =============================================================================

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  date_of_birth date,
  age_confirmed_at timestamptz,
  role public.user_role NOT NULL DEFAULT 'user',
  account_status public.account_status NOT NULL DEFAULT 'active',
  trust_score numeric(5, 2) NOT NULL DEFAULT 50.00,
  stripe_customer_id text UNIQUE,
  community_standards_accepted_at timestamptz,
  onboarding_completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT users_age_18_plus CHECK (
    date_of_birth IS NULL
    OR date_of_birth <= (CURRENT_DATE - INTERVAL '18 years')
  ),
  CONSTRAINT users_trust_score_range CHECK (trust_score >= 0 AND trust_score <= 100)
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX users_account_status_idx ON public.users (account_status);
CREATE INDEX users_stripe_customer_id_idx ON public.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- =============================================================================
-- PROFILES
-- =============================================================================

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  display_name text,
  bio text,
  gender_id uuid REFERENCES public.genders (id),
  dating_intention public.dating_intention,
  height_cm integer,
  occupation text,
  school text,
  hometown text,
  neighborhood_label text,
  zodiac text,
  drinking public.lifestyle_habit,
  smoking public.lifestyle_habit,
  marijuana public.lifestyle_habit,
  children public.children_status,
  wants_children public.wants_children,
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  main_photo_url text,
  profile_completion jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 300),
  CONSTRAINT profiles_height_range CHECK (
    height_cm IS NULL OR (height_cm >= 90 AND height_cm <= 275)
  ),
  CONSTRAINT profiles_display_name_length CHECK (
    display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 40)
  )
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profiles_gender_id_idx ON public.profiles (gender_id);
CREATE INDEX profiles_verification_status_idx ON public.profiles (verification_status);

-- =============================================================================
-- DATING PREFERENCES
-- =============================================================================

CREATE TABLE public.dating_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  interested_in public.interest_option NOT NULL DEFAULT 'everyone',
  min_age integer NOT NULL DEFAULT 18,
  max_age integer NOT NULL DEFAULT 45,
  max_distance_miles integer NOT NULL DEFAULT 25,
  intentions public.dating_intention[] NOT NULL DEFAULT '{}'::public.dating_intention[],
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT dating_preferences_min_age_check CHECK (min_age >= 18),
  CONSTRAINT dating_preferences_max_age_check CHECK (max_age >= min_age AND max_age <= 99),
  CONSTRAINT dating_preferences_distance_check CHECK (
    max_distance_miles IN (5, 10, 15, 25, 50)
  )
);

CREATE TRIGGER dating_preferences_set_updated_at
  BEFORE UPDATE ON public.dating_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PROFILE MEDIA
-- =============================================================================

CREATE TABLE public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER profile_photos_set_updated_at
  BEFORE UPDATE ON public.profile_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profile_photos_user_id_idx ON public.profile_photos (user_id, sort_order);

CREATE TABLE public.profile_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES public.video_prompts (id) ON DELETE SET NULL,
  prompt_text text,
  video_url text NOT NULL,
  thumbnail_url text,
  storage_path text NOT NULL,
  duration_seconds numeric(5, 2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT profile_videos_duration_check CHECK (
    duration_seconds >= 3 AND duration_seconds <= 15
  )
);

CREATE TRIGGER profile_videos_set_updated_at
  BEFORE UPDATE ON public.profile_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profile_videos_user_id_idx ON public.profile_videos (user_id, sort_order);

-- =============================================================================
-- LIVE SESSIONS
-- =============================================================================

CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  status public.live_session_status NOT NULL DEFAULT 'active',
  radius_miles integer NOT NULL DEFAULT 10,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  geography extensions.geography(Point, 4326),
  available_from timestamptz,
  available_until timestamptz,
  availability_label text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT live_sessions_radius_check CHECK (
    radius_miles IN (5, 10, 15, 25, 50)
  ),
  CONSTRAINT live_sessions_max_12h CHECK (
    expires_at > started_at
    AND expires_at <= started_at + INTERVAL '12 hours'
  ),
  CONSTRAINT live_sessions_lat_check CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT live_sessions_lng_check CHECK (longitude BETWEEN -180 AND 180)
);

CREATE TRIGGER live_sessions_set_updated_at
  BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX live_sessions_user_id_idx ON public.live_sessions (user_id);
CREATE INDEX live_sessions_active_idx
  ON public.live_sessions (status, expires_at)
  WHERE status = 'active' AND ended_at IS NULL;
CREATE INDEX live_sessions_geography_idx
  ON public.live_sessions USING GIST (geography);

CREATE UNIQUE INDEX live_sessions_one_active_per_user
  ON public.live_sessions (user_id)
  WHERE status = 'active' AND ended_at IS NULL;

CREATE TABLE public.live_session_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  activity public.tonight_activity NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (live_session_id, activity)
);

CREATE INDEX live_session_activities_session_idx
  ON public.live_session_activities (live_session_id);

CREATE TABLE public.live_session_video (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_session_id uuid NOT NULL UNIQUE REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  video_url text NOT NULL,
  thumbnail_url text,
  storage_path text NOT NULL,
  duration_seconds numeric(5, 2) NOT NULL,
  prompt_text text,
  soft_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT live_session_video_duration_check CHECK (
    duration_seconds >= 3 AND duration_seconds <= 15
  )
);

CREATE TRIGGER live_session_video_set_updated_at
  BEFORE UPDATE ON public.live_session_video
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PINGS / MATCHES / CHAT
-- =============================================================================

CREATE TABLE public.pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  sender_live_session_id uuid REFERENCES public.live_sessions (id) ON DELETE SET NULL,
  recipient_live_session_id uuid NOT NULL REFERENCES public.live_sessions (id) ON DELETE CASCADE,
  status public.ping_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT pings_not_self CHECK (sender_id <> recipient_id)
);

CREATE TRIGGER pings_set_updated_at
  BEFORE UPDATE ON public.pings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX pings_unique_pending
  ON public.pings (sender_id, recipient_id, recipient_live_session_id)
  WHERE status = 'pending';

CREATE INDEX pings_recipient_pending_idx
  ON public.pings (recipient_id, status, created_at DESC);
CREATE INDEX pings_sender_idx
  ON public.pings (sender_id, status, created_at DESC);

CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  originating_live_session_a uuid REFERENCES public.live_sessions (id) ON DELETE SET NULL,
  originating_live_session_b uuid REFERENCES public.live_sessions (id) ON DELETE SET NULL,
  originating_ping_a uuid REFERENCES public.pings (id) ON DELETE SET NULL,
  originating_ping_b uuid REFERENCES public.pings (id) ON DELETE SET NULL,
  matched_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  status public.match_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT matches_ordered_pair CHECK (user_a_id < user_b_id)
);

CREATE TRIGGER matches_set_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX matches_unique_active_pair
  ON public.matches (user_a_id, user_b_id)
  WHERE status = 'active';

CREATE INDEX matches_user_a_idx ON public.matches (user_a_id, status);
CREATE INDEX matches_user_b_idx ON public.matches (user_b_id, status);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches (id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_read_at timestamptz,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX conversation_members_user_idx
  ON public.conversation_members (user_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body text,
  media_url text,
  media_type text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz,
  CONSTRAINT messages_has_content CHECK (
    body IS NOT NULL OR media_url IS NOT NULL
  )
);

CREATE TRIGGER messages_set_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX messages_conversation_idx
  ON public.messages (conversation_id, created_at DESC);

-- =============================================================================
-- DATES
-- =============================================================================

CREATE TABLE public.dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  proposed_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  venue_name text,
  venue_address text,
  venue_neighborhood text,
  venue_lat double precision,
  venue_lng double precision,
  activity public.tonight_activity,
  notes text,
  status public.date_status NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER dates_set_updated_at
  BEFORE UPDATE ON public.dates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX dates_match_idx ON public.dates (match_id, scheduled_at);
CREATE INDEX dates_status_idx ON public.dates (status, scheduled_at);

CREATE TABLE public.date_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id uuid NOT NULL REFERENCES public.dates (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  response public.date_status,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (date_id, user_id)
);

CREATE TABLE public.date_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id uuid NOT NULL REFERENCES public.dates (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  outcome public.feedback_outcome NOT NULL,
  quality public.feedback_quality,
  private_notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (date_id, user_id)
);

-- =============================================================================
-- SAFETY / MODERATION
-- =============================================================================

CREATE TABLE public.blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT blocks_not_self CHECK (blocker_id <> blocked_id),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX blocks_blocked_id_idx ON public.blocks (blocked_id);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches (id) ON DELETE SET NULL,
  date_id uuid REFERENCES public.dates (id) ON DELETE SET NULL,
  reason public.report_reason NOT NULL,
  details text,
  status public.report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT reports_not_self CHECK (reporter_id <> reported_id)
);

CREATE TRIGGER reports_set_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX reports_status_idx ON public.reports (status, created_at DESC);

CREATE TABLE public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports (id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  action_type text NOT NULL,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX moderation_actions_target_idx
  ON public.moderation_actions (target_user_id, created_at DESC);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text,
  device_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, token)
);

CREATE TRIGGER push_tokens_set_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  pings_enabled boolean NOT NULL DEFAULT true,
  mutual_pings_enabled boolean NOT NULL DEFAULT true,
  messages_enabled boolean NOT NULL DEFAULT true,
  dates_enabled boolean NOT NULL DEFAULT true,
  safety_enabled boolean NOT NULL DEFAULT true,
  marketing_enabled boolean NOT NULL DEFAULT false,
  discovery_while_offline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- MONETIZATION
-- =============================================================================

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  status public.subscription_status NOT NULL DEFAULT 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX subscriptions_user_status_idx
  ON public.subscriptions (user_id, status);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  stripe_payment_intent_id text UNIQUE,
  stripe_price_id text,
  product_key text NOT NULL,
  amount_cents integer,
  currency text DEFAULT 'usd',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX purchases_user_idx ON public.purchases (user_id, created_at DESC);

CREATE TABLE public.boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  live_session_id uuid REFERENCES public.live_sessions (id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.purchases (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT boosts_window_check CHECK (expires_at > started_at)
);

CREATE INDEX boosts_active_idx
  ON public.boosts (user_id, expires_at)
  WHERE expires_at > timezone('utc', now());

-- =============================================================================
-- SEED REFERENCE DATA (genders + video prompts)
-- =============================================================================

INSERT INTO public.genders (id, slug, label, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111001', 'woman', 'Woman', 1),
  ('11111111-1111-1111-1111-111111111002', 'man', 'Man', 2),
  ('11111111-1111-1111-1111-111111111003', 'non_binary', 'Non-binary', 3),
  ('11111111-1111-1111-1111-111111111004', 'other', 'Other', 4);

INSERT INTO public.video_prompts (id, prompt_text, sort_order) VALUES
  ('22222222-2222-2222-2222-222222222001', 'My ideal spontaneous date is...', 1),
  ('22222222-2222-2222-2222-222222222002', 'You''ll know I''m into you when...', 2),
  ('22222222-2222-2222-2222-222222222003', 'A perfect night out looks like...', 3),
  ('22222222-2222-2222-2222-222222222004', 'I''m looking for someone who...', 4),
  ('22222222-2222-2222-2222-222222222005', 'My friends would describe me as...', 5),
  ('22222222-2222-2222-2222-222222222006', 'The best thing about Atlanta is...', 6);

-- =============================================================================
-- CORE FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_age(dob date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN dob IS NULL THEN NULL
    ELSE date_part(
      'year',
      age(CURRENT_DATE, dob)
    )::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.users_are_blocked(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocks b
    WHERE (b.blocker_id = user_a AND b.blocked_id = user_b)
       OR (b.blocker_id = user_b AND b.blocked_id = user_a)
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_live_session_geography()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.geography := extensions.ST_SetSRID(
    extensions.ST_MakePoint(NEW.longitude, NEW.latitude),
    4326
  )::extensions.geography;
  RETURN NEW;
END;
$$;

CREATE TRIGGER live_sessions_sync_geography
  BEFORE INSERT OR UPDATE OF latitude, longitude
  ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_live_session_geography();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.dating_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.profile_ready_for_live(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_pref public.dating_preferences%ROWTYPE;
  v_video_count integer;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  SELECT * INTO v_pref FROM public.dating_preferences WHERE user_id = p_user_id;

  IF v_user.id IS NULL OR v_profile.user_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_user.account_status <> 'active' THEN
    RETURN false;
  END IF;

  IF v_user.date_of_birth IS NULL OR public.calculate_age(v_user.date_of_birth) < 18 THEN
    RETURN false;
  END IF;

  IF v_user.community_standards_accepted_at IS NULL THEN
    RETURN false;
  END IF;

  IF v_profile.display_name IS NULL OR length(trim(v_profile.display_name)) = 0 THEN
    RETURN false;
  END IF;

  IF v_profile.gender_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_profile.main_photo_url IS NULL THEN
    RETURN false;
  END IF;

  IF v_pref.user_id IS NULL OR v_pref.interested_in IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_video_count
  FROM public.profile_videos
  WHERE user_id = p_user_id;

  IF v_video_count < 2 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.gender_matches_interest(
  p_gender_slug text,
  p_interested_in public.interest_option
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_interested_in IS NOT NULL
    AND (
      p_interested_in = 'everyone'::public.interest_option
      OR (p_gender_slug IN ('woman', 'women') AND p_interested_in = 'women'::public.interest_option)
      OR (p_gender_slug IN ('man', 'men') AND p_interested_in = 'men'::public.interest_option)
      OR (p_gender_slug IN ('nonbinary', 'non_binary', 'other') AND p_interested_in = 'everyone'::public.interest_option)
    );
$$;

-- =============================================================================
-- LIVE SESSION RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.start_live_session(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_miles integer,
  p_expires_at timestamptz,
  p_activities public.tonight_activity[],
  p_available_from timestamptz DEFAULT NULL,
  p_available_until timestamptz DEFAULT NULL,
  p_availability_label text DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.live_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.profile_ready_for_live(v_uid) THEN
    RAISE EXCEPTION 'Profile not ready for live';
  END IF;

  IF p_radius_miles NOT IN (5, 10, 15, 25, 50) THEN
    RAISE EXCEPTION 'Invalid radius';
  END IF;

  IF p_expires_at <= timezone('utc', now()) THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;

  IF p_expires_at > timezone('utc', now()) + INTERVAL '12 hours' THEN
    RAISE EXCEPTION 'Live sessions may not exceed 12 hours';
  END IF;

  IF p_activities IS NULL OR cardinality(p_activities) = 0 THEN
    RAISE EXCEPTION 'At least one activity is required';
  END IF;

  -- End any stale active session for this user
  UPDATE public.live_sessions
  SET
    status = 'ended',
    ended_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE user_id = v_uid
    AND status = 'active'
    AND ended_at IS NULL;

  INSERT INTO public.live_sessions (
    user_id,
    started_at,
    expires_at,
    status,
    radius_miles,
    latitude,
    longitude,
    available_from,
    available_until,
    availability_label
  )
  VALUES (
    v_uid,
    timezone('utc', now()),
    p_expires_at,
    'active',
    p_radius_miles,
    p_latitude,
    p_longitude,
    p_available_from,
    p_available_until,
    p_availability_label
  )
  RETURNING * INTO v_session;

  INSERT INTO public.live_session_activities (live_session_id, activity)
  SELECT DISTINCT v_session.id, a
  FROM unnest(p_activities) AS a;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_live_session(
  p_session_id uuid DEFAULT NULL
)
RETURNS public.live_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.live_sessions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_session
  FROM public.live_sessions
  WHERE user_id = v_uid
    AND status = 'active'
    AND ended_at IS NULL
    AND (p_session_id IS NULL OR id = p_session_id)
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'No active live session';
  END IF;

  UPDATE public.live_sessions
  SET
    status = 'ended',
    ended_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  -- Withdraw outgoing pending pings from this session
  UPDATE public.pings
  SET
    status = 'withdrawn',
    updated_at = timezone('utc', now())
  WHERE sender_live_session_id = v_session.id
    AND status = 'pending';

  -- Expire incoming pending pings targeting this session
  UPDATE public.pings
  SET
    status = 'expired',
    updated_at = timezone('utc', now())
  WHERE recipient_live_session_id = v_session.id
    AND status = 'pending';

  -- Soft-delete tonight video
  UPDATE public.live_session_video
  SET
    soft_deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE live_session_id = v_session.id
    AND soft_deleted_at IS NULL;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_live_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.live_sessions
    WHERE status = 'active'
      AND ended_at IS NULL
      AND expires_at <= timezone('utc', now())
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.live_sessions
    SET
      status = 'expired',
      ended_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    WHERE id = r.id;

    UPDATE public.pings
    SET
      status = 'expired',
      updated_at = timezone('utc', now())
    WHERE status = 'pending'
      AND (
        sender_live_session_id = r.id
        OR recipient_live_session_id = r.id
      );

    UPDATE public.live_session_video
    SET
      soft_deleted_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    WHERE live_session_id = r.id
      AND soft_deleted_at IS NULL;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- PING / DISCOVERY RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.send_ping(p_recipient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sender_session public.live_sessions;
  v_recipient_session public.live_sessions;
  v_existing public.pings;
  v_reciprocal public.pings;
  v_new_ping public.pings;
  v_match public.matches;
  v_conversation public.conversations;
  v_user_a uuid;
  v_user_b uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = v_uid THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  PERFORM public.expire_stale_live_sessions();

  IF public.users_are_blocked(v_uid, p_recipient_id) THEN
    RAISE EXCEPTION 'Cannot ping this user';
  END IF;

  SELECT * INTO v_sender_session
  FROM public.live_sessions
  WHERE user_id = v_uid
    AND status = 'active'
    AND ended_at IS NULL
    AND expires_at > timezone('utc', now())
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sender_session.id IS NULL THEN
    RAISE EXCEPTION 'You must be live to send a ping';
  END IF;

  SELECT * INTO v_recipient_session
  FROM public.live_sessions
  WHERE user_id = p_recipient_id
    AND status = 'active'
    AND ended_at IS NULL
    AND expires_at > timezone('utc', now())
  ORDER BY started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_recipient_session.id IS NULL THEN
    RAISE EXCEPTION 'Recipient is not live';
  END IF;

  -- Race-safe: lock any reciprocal pending ping first
  SELECT * INTO v_reciprocal
  FROM public.pings
  WHERE sender_id = p_recipient_id
    AND recipient_id = v_uid
    AND recipient_live_session_id = v_sender_session.id
    AND status = 'pending'
  FOR UPDATE;

  SELECT * INTO v_existing
  FROM public.pings
  WHERE sender_id = v_uid
    AND recipient_id = p_recipient_id
    AND recipient_live_session_id = v_recipient_session.id
    AND status = 'pending'
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_pending',
      'ping_id', v_existing.id
    );
  END IF;

  INSERT INTO public.pings (
    sender_id,
    recipient_id,
    sender_live_session_id,
    recipient_live_session_id,
    status,
    expires_at
  )
  VALUES (
    v_uid,
    p_recipient_id,
    v_sender_session.id,
    v_recipient_session.id,
    'pending',
    LEAST(v_sender_session.expires_at, v_recipient_session.expires_at)
  )
  RETURNING * INTO v_new_ping;

  IF v_reciprocal.id IS NOT NULL THEN
    UPDATE public.pings
    SET status = 'mutual', updated_at = timezone('utc', now())
    WHERE id IN (v_new_ping.id, v_reciprocal.id);

    v_user_a := LEAST(v_uid, p_recipient_id);
    v_user_b := GREATEST(v_uid, p_recipient_id);

    SELECT * INTO v_match
    FROM public.matches
    WHERE user_a_id = v_user_a
      AND user_b_id = v_user_b
      AND status = 'active'
    LIMIT 1
    FOR UPDATE;

    IF v_match.id IS NULL THEN
      INSERT INTO public.matches (
        user_a_id,
        user_b_id,
        originating_live_session_a,
        originating_live_session_b,
        originating_ping_a,
        originating_ping_b,
        status
      )
      VALUES (
        v_user_a,
        v_user_b,
        CASE WHEN v_uid = v_user_a THEN v_sender_session.id ELSE v_recipient_session.id END,
        CASE WHEN v_uid = v_user_b THEN v_sender_session.id ELSE v_recipient_session.id END,
        CASE WHEN v_uid = v_user_a THEN v_new_ping.id ELSE v_reciprocal.id END,
        CASE WHEN v_uid = v_user_b THEN v_new_ping.id ELSE v_reciprocal.id END,
        'active'
      )
      RETURNING * INTO v_match;
    END IF;

    IF v_match.id IS NOT NULL THEN
      INSERT INTO public.conversations (match_id)
      VALUES (v_match.id)
      ON CONFLICT (match_id) DO NOTHING
      RETURNING * INTO v_conversation;

      IF v_conversation.id IS NULL THEN
        SELECT * INTO v_conversation
        FROM public.conversations
        WHERE match_id = v_match.id;
      END IF;

      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES
        (v_conversation.id, v_user_a),
        (v_conversation.id, v_user_b)
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'status', 'mutual',
      'ping_id', v_new_ping.id,
      'match_id', v_match.id,
      'conversation_id', v_conversation.id
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'pending',
    'ping_id', v_new_ping.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_ping(p_ping_id uuid)
RETURNS public.pings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ping public.pings;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.pings
  SET
    status = 'withdrawn',
    updated_at = timezone('utc', now())
  WHERE id = p_ping_id
    AND sender_id = v_uid
    AND status = 'pending'
  RETURNING * INTO v_ping;

  IF v_ping.id IS NULL THEN
    RAISE EXCEPTION 'Ping not found or not withdrawable';
  END IF;

  RETURN v_ping;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discovery_feed(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  live_session_id uuid,
  display_name text,
  age integer,
  neighborhood_label text,
  verification_status public.verification_status,
  dating_intention public.dating_intention,
  bio text,
  main_photo_url text,
  distance_miles double precision,
  availability_label text,
  available_from timestamptz,
  available_until timestamptz,
  expires_at timestamptz,
  activities public.tonight_activity[],
  tonight_video_url text,
  tonight_video_thumbnail_url text,
  prompt_video_url text,
  prompt_text text,
  is_boosted boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_viewer_session public.live_sessions;
  v_viewer_pref public.dating_preferences;
  v_viewer_gender_slug text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.expire_stale_live_sessions();

  SELECT * INTO v_viewer_session
  FROM public.live_sessions ls
  WHERE ls.user_id = v_uid
    AND ls.status = 'active'
    AND ls.ended_at IS NULL
    AND ls.expires_at > timezone('utc', now())
  ORDER BY ls.started_at DESC
  LIMIT 1;

  IF v_viewer_session.id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_viewer_pref
  FROM public.dating_preferences
  WHERE dating_preferences.user_id = v_uid;

  SELECT g.slug INTO v_viewer_gender_slug
  FROM public.profiles p
  JOIN public.genders g ON g.id = p.gender_id
  WHERE p.user_id = v_uid;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      p.user_id AS cand_user_id,
      ls.id AS cand_session_id,
      p.display_name,
      public.calculate_age(u.date_of_birth) AS cand_age,
      p.neighborhood_label,
      p.verification_status,
      p.dating_intention,
      p.bio,
      p.main_photo_url,
      (
        extensions.ST_Distance(ls.geography, v_viewer_session.geography) / 1609.344
      )::double precision AS dist_miles,
      ls.availability_label,
      ls.available_from,
      ls.available_until,
      ls.expires_at,
      ls.radius_miles AS their_radius,
      ls.started_at,
      g.slug AS gender_slug,
      dp.interested_in AS their_interested_in,
      dp.min_age AS their_min_age,
      dp.max_age AS their_max_age,
      EXISTS (
        SELECT 1
        FROM public.boosts b
        WHERE b.user_id = p.user_id
          AND b.live_session_id = ls.id
          AND b.expires_at > timezone('utc', now())
      ) AS boosted,
      (
        SELECT array_agg(lsa.activity ORDER BY lsa.activity)
        FROM public.live_session_activities lsa
        WHERE lsa.live_session_id = ls.id
      ) AS acts,
      (
        SELECT lsv.video_url
        FROM public.live_session_video lsv
        WHERE lsv.live_session_id = ls.id
          AND lsv.soft_deleted_at IS NULL
        LIMIT 1
      ) AS tonight_url,
      (
        SELECT lsv.thumbnail_url
        FROM public.live_session_video lsv
        WHERE lsv.live_session_id = ls.id
          AND lsv.soft_deleted_at IS NULL
        LIMIT 1
      ) AS tonight_thumb,
      (
        SELECT pv.video_url
        FROM public.profile_videos pv
        WHERE pv.user_id = p.user_id
        ORDER BY pv.sort_order ASC
        LIMIT 1
      ) AS prompt_url,
      (
        SELECT COALESCE(pv.prompt_text, vp.prompt_text)
        FROM public.profile_videos pv
        LEFT JOIN public.video_prompts vp ON vp.id = pv.prompt_id
        WHERE pv.user_id = p.user_id
        ORDER BY pv.sort_order ASC
        LIMIT 1
      ) AS prompt_label
    FROM public.live_sessions ls
    JOIN public.users u ON u.id = ls.user_id
    JOIN public.profiles p ON p.user_id = ls.user_id
    JOIN public.genders g ON g.id = p.gender_id
    JOIN public.dating_preferences dp ON dp.user_id = ls.user_id
    WHERE ls.status = 'active'
      AND ls.ended_at IS NULL
      AND ls.expires_at > timezone('utc', now())
      AND ls.user_id <> v_uid
      AND u.account_status = 'active'
      AND u.deleted_at IS NULL
      AND u.date_of_birth IS NOT NULL
      AND public.calculate_age(u.date_of_birth) >= 18
      AND NOT public.users_are_blocked(v_uid, ls.user_id)
      AND public.profile_ready_for_live(ls.user_id)
  )
  SELECT
    c.cand_user_id,
    c.cand_session_id,
    c.display_name,
    c.cand_age,
    c.neighborhood_label,
    c.verification_status,
    c.dating_intention,
    c.bio,
    c.main_photo_url,
    round(c.dist_miles::numeric, 1)::double precision,
    c.availability_label,
    c.available_from,
    c.available_until,
    c.expires_at,
    c.acts,
    c.tonight_url,
    c.tonight_thumb,
    c.prompt_url,
    c.prompt_label,
    c.boosted
  FROM candidates c
  WHERE c.dist_miles <= LEAST(v_viewer_session.radius_miles, c.their_radius)::double precision
    AND c.cand_age BETWEEN v_viewer_pref.min_age AND v_viewer_pref.max_age
    AND public.calculate_age(
          (SELECT u2.date_of_birth FROM public.users u2 WHERE u2.id = v_uid)
        ) BETWEEN c.their_min_age AND c.their_max_age
    AND public.gender_matches_interest(c.gender_slug, v_viewer_pref.interested_in)
    AND public.gender_matches_interest(v_viewer_gender_slug, c.their_interested_in)
  ORDER BY
    c.boosted DESC,
    c.dist_miles ASC,
    c.started_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- =============================================================================
-- SECURITY TRIGGERS (no client forge of role/trust/verification/subscriptions)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_sensitive_user_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Service role / postgres bypass via JWT role check
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify role';
    END IF;
    IF NEW.trust_score IS DISTINCT FROM OLD.trust_score THEN
      RAISE EXCEPTION 'Cannot modify trust_score';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'Cannot modify account_status';
    END IF;
    IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
      RAISE EXCEPTION 'Cannot modify stripe_customer_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_prevent_sensitive_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_sensitive_user_escalation();

CREATE OR REPLACE FUNCTION public.prevent_verification_forge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    -- Clients may only move unverified -> pending (request verification)
    IF NOT (
      OLD.verification_status = 'unverified'
      AND NEW.verification_status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Cannot forge verification_status';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
     AND NEW.verification_status IS DISTINCT FROM 'unverified' THEN
    RAISE EXCEPTION 'Cannot set verification_status on insert';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_prevent_verification_forge
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_verification_forge();

CREATE OR REPLACE FUNCTION public.prevent_subscription_forge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Subscriptions may only be modified by service role';
END;
$$;

CREATE TRIGGER subscriptions_prevent_forge
  BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_subscription_forge();

CREATE OR REPLACE FUNCTION public.prevent_purchase_forge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Purchases may only be modified by service role';
END;
$$;

CREATE TRIGGER purchases_prevent_forge
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_purchase_forge();

CREATE OR REPLACE FUNCTION public.prevent_boost_forge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     OR current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Boosts may only be modified by service role';
END;
$$;

CREATE TRIGGER boosts_prevent_forge
  BEFORE INSERT OR UPDATE OR DELETE ON public.boosts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_boost_forge();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dating_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_session_video ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boosts ENABLE ROW LEVEL SECURITY;

-- Reference data: readable by authenticated
CREATE POLICY genders_select_authenticated
  ON public.genders FOR SELECT TO authenticated
  USING (true);

CREATE POLICY video_prompts_select_authenticated
  ON public.video_prompts FOR SELECT TO authenticated
  USING (true AND is_active = true);

-- users: own row only (no public trust/role exposure via table reads of others)
CREATE POLICY users_select_own
  ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_update_own
  ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- profiles: own read/write; limited read of others for match/conversation context
CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profiles_select_matched
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE m.status = 'active'
        AND (
          (m.user_a_id = auth.uid() AND m.user_b_id = profiles.user_id)
          OR (m.user_b_id = auth.uid() AND m.user_a_id = profiles.user_id)
        )
    )
  );

CREATE POLICY profiles_select_ping_counterpart
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pings p
      WHERE p.status IN ('pending', 'mutual')
        AND (
          (p.sender_id = auth.uid() AND p.recipient_id = profiles.user_id)
          OR (p.recipient_id = auth.uid() AND p.sender_id = profiles.user_id)
        )
    )
  );

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- dating_preferences
CREATE POLICY dating_preferences_select_own
  ON public.dating_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY dating_preferences_insert_own
  ON public.dating_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY dating_preferences_update_own
  ON public.dating_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- profile_photos
CREATE POLICY profile_photos_select_own
  ON public.profile_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profile_photos_select_matched_or_ping
  ON public.profile_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.status = 'active'
        AND (
          (m.user_a_id = auth.uid() AND m.user_b_id = profile_photos.user_id)
          OR (m.user_b_id = auth.uid() AND m.user_a_id = profile_photos.user_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.pings p
      WHERE p.status IN ('pending', 'mutual')
        AND (
          (p.sender_id = auth.uid() AND p.recipient_id = profile_photos.user_id)
          OR (p.recipient_id = auth.uid() AND p.sender_id = profile_photos.user_id)
        )
    )
  );

CREATE POLICY profile_photos_mutate_own
  ON public.profile_photos FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- profile_videos
CREATE POLICY profile_videos_select_own
  ON public.profile_videos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY profile_videos_select_matched_or_ping
  ON public.profile_videos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.status = 'active'
        AND (
          (m.user_a_id = auth.uid() AND m.user_b_id = profile_videos.user_id)
          OR (m.user_b_id = auth.uid() AND m.user_a_id = profile_videos.user_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.pings p
      WHERE p.status IN ('pending', 'mutual')
        AND (
          (p.sender_id = auth.uid() AND p.recipient_id = profile_videos.user_id)
          OR (p.recipient_id = auth.uid() AND p.sender_id = profile_videos.user_id)
        )
    )
  );

CREATE POLICY profile_videos_mutate_own
  ON public.profile_videos FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- live_sessions: own only (discovery via RPC; never expose others' lat/lng)
CREATE POLICY live_sessions_select_own
  ON public.live_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY live_sessions_insert_own
  ON public.live_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY live_sessions_update_own
  ON public.live_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- live_session_activities
CREATE POLICY live_session_activities_select_own
  ON public.live_session_activities FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_session_activities.live_session_id
        AND ls.user_id = auth.uid()
    )
  );

CREATE POLICY live_session_activities_mutate_own
  ON public.live_session_activities FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_session_activities.live_session_id
        AND ls.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_session_activities.live_session_id
        AND ls.user_id = auth.uid()
    )
  );

-- live_session_video
CREATE POLICY live_session_video_select_own
  ON public.live_session_video FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY live_session_video_mutate_own
  ON public.live_session_video FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- pings
CREATE POLICY pings_select_involved
  ON public.pings FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY pings_insert_own
  ON public.pings FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY pings_update_own_sender
  ON public.pings FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- matches
CREATE POLICY matches_select_member
  ON public.matches FOR SELECT TO authenticated
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid());

CREATE POLICY matches_update_member
  ON public.matches FOR UPDATE TO authenticated
  USING (user_a_id = auth.uid() OR user_b_id = auth.uid())
  WITH CHECK (user_a_id = auth.uid() OR user_b_id = auth.uid());

-- conversations / members / messages
CREATE POLICY conversations_select_member
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_members_select_member
  ON public.conversation_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY conversation_members_update_own
  ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY messages_select_member
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_insert_member
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY messages_update_own
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- dates
CREATE POLICY dates_select_member
  ON public.dates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = dates.match_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY dates_insert_member
  ON public.dates FOR INSERT TO authenticated
  WITH CHECK (
    proposed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = dates.match_id
        AND m.status = 'active'
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY dates_update_member
  ON public.dates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = dates.match_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = dates.match_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY date_participants_select_own_dates
  ON public.date_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dates d
      JOIN public.matches m ON m.id = d.match_id
      WHERE d.id = date_participants.date_id
        AND (m.user_a_id = auth.uid() OR m.user_b_id = auth.uid())
    )
  );

CREATE POLICY date_participants_mutate_own
  ON public.date_participants FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY date_feedback_select_own
  ON public.date_feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY date_feedback_insert_own
  ON public.date_feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- blocks
CREATE POLICY blocks_select_own
  ON public.blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

CREATE POLICY blocks_insert_own
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY blocks_delete_own
  ON public.blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- reports
CREATE POLICY reports_select_own
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY reports_insert_own
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- moderation_actions: no client access (service role only)
CREATE POLICY moderation_actions_deny_all
  ON public.moderation_actions FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- push_tokens / notification_preferences
CREATE POLICY push_tokens_own
  ON public.push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notification_preferences_own
  ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- subscriptions / purchases / boosts: read own, write via service role only
CREATE POLICY subscriptions_select_own
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY purchases_select_own
  ON public.purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY boosts_select_own
  ON public.boosts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_age(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.users_are_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_ready_for_live(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_live_session(
  double precision, double precision, integer, timestamptz,
  public.tonight_activity[], timestamptz, timestamptz, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_live_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_live_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_ping(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_ping(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_discovery_feed(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gender_matches_interest(text, public.interest_option) TO authenticated;
