-- =============================================================================
-- date:today — DEVELOPMENT SEED DATA ONLY
-- Mock Atlanta profiles for local/dev. DO NOT run against production.
-- Password for all seed users: password123
-- =============================================================================

-- Guard: refuse if clearly not a local/dev database name pattern (best-effort)
DO $$
BEGIN
  RAISE NOTICE 'Loading DateToday DEVELOPMENT seed data (Atlanta mock profiles)';
END $$;

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Stable test UUIDs
-- Maya, Jordan, Alex, Sam, Riley, Casey, Taylor, Morgan, Avery, Quinn

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated',
    'maya.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Maya (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated',
    'jordan.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Jordan (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated',
    'alex.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Alex (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated',
    'sam.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sam (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated',
    'riley.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Riley (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000006',
    'authenticated', 'authenticated',
    'casey.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Casey (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000007',
    'authenticated', 'authenticated',
    'taylor.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Taylor (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000008',
    'authenticated', 'authenticated',
    'morgan.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Morgan (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000009',
    'authenticated', 'authenticated',
    'avery.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Avery (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000010',
    'authenticated', 'authenticated',
    'quinn.test@datetoday.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    timezone('utc', now()),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Quinn (TEST)"}'::jsonb,
    timezone('utc', now()), timezone('utc', now()),
    '', '', '', ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  timezone('utc', now()),
  timezone('utc', now()),
  timezone('utc', now())
FROM auth.users u
WHERE u.id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-000000000010'
)
AND NOT EXISTS (
  SELECT 1 FROM auth.identities i
  WHERE i.user_id = u.id AND i.provider = 'email'
);

-- Account metadata (trigger already created users/profiles/prefs)
UPDATE public.users SET
  date_of_birth = v.dob,
  age_confirmed_at = timezone('utc', now()),
  community_standards_accepted_at = timezone('utc', now()),
  onboarding_completed_at = timezone('utc', now()),
  account_status = 'active',
  trust_score = 55,
  updated_at = timezone('utc', now())
FROM (
  VALUES
    ('a0000000-0000-4000-8000-000000000001'::uuid, DATE '2003-04-12'), -- Maya ~22
    ('a0000000-0000-4000-8000-000000000002'::uuid, DATE '2001-08-03'), -- Jordan ~24
    ('a0000000-0000-4000-8000-000000000003'::uuid, DATE '1999-11-21'), -- Alex ~26
    ('a0000000-0000-4000-8000-000000000004'::uuid, DATE '2002-02-18'), -- Sam ~23
    ('a0000000-0000-4000-8000-000000000005'::uuid, DATE '2000-06-30'), -- Riley ~25
    ('a0000000-0000-4000-8000-000000000006'::uuid, DATE '1998-01-09'), -- Casey ~27
    ('a0000000-0000-4000-8000-000000000007'::uuid, DATE '2004-09-15'), -- Taylor ~21
    ('a0000000-0000-4000-8000-000000000008'::uuid, DATE '1997-12-05'), -- Morgan ~28
    ('a0000000-0000-4000-8000-000000000009'::uuid, DATE '2001-03-22'), -- Avery ~24
    ('a0000000-0000-4000-8000-000000000010'::uuid, DATE '2000-10-11')  -- Quinn ~25
) AS v(id, dob)
WHERE public.users.id = v.id;

UPDATE public.profiles SET
  display_name = v.display_name,
  bio = v.bio,
  gender_id = v.gender_id,
  dating_intention = v.dating_intention,
  height_cm = v.height_cm,
  occupation = v.occupation,
  school = v.school,
  hometown = v.hometown,
  neighborhood_label = v.neighborhood_label,
  zodiac = v.zodiac,
  drinking = v.drinking,
  smoking = v.smoking,
  marijuana = v.marijuana,
  children = 'none',
  wants_children = v.wants_children,
  -- Keep verification honest: only a couple marked verified for UI testing
  verification_status = v.verification_status,
  main_photo_url = v.main_photo_url,
  profile_completion = '{"name":true,"photo":true,"videos":true,"prefs":true,"standards":true}'::jsonb,
  updated_at = timezone('utc', now())
FROM (
  VALUES
    (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      'Maya',
      'TEST PROFILE — Midtown. Coffee first, rooftop drinks later.',
      '11111111-1111-1111-1111-111111111001'::uuid,
      'figuring_out'::public.dating_intention,
      168, 'Product designer', 'Georgia Tech', 'Atlanta', 'Midtown',
      'Aries', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'maybe'::public.wants_children,
      'verified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-maya/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000002'::uuid,
      'Jordan',
      'TEST PROFILE — Buckhead. Looking for dinner + a good conversation.',
      '11111111-1111-1111-1111-111111111002'::uuid,
      'short_term'::public.dating_intention,
      183, 'Software engineer', 'Emory', 'Charlotte', 'Buckhead',
      'Leo', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'sometimes'::public.lifestyle_habit, 'no'::public.wants_children,
      'unverified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-jordan/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000003'::uuid,
      'Alex',
      'TEST PROFILE — Downtown. Spontaneous plans only.',
      '11111111-1111-1111-1111-111111111003'::uuid,
      'casual'::public.dating_intention,
      175, 'Bartender', NULL, 'Miami', 'Downtown',
      'Scorpio', 'often'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'sometimes'::public.lifestyle_habit, 'prefer_not_to_say'::public.wants_children,
      'pending'::public.verification_status,
      'https://picsum.photos/seed/datetoday-alex/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000004'::uuid,
      'Sam',
      'TEST PROFILE — Old Fourth Ward. Walks, galleries, late bites.',
      '11111111-1111-1111-1111-111111111001'::uuid,
      'long_term'::public.dating_intention,
      165, 'Nurse', 'UGA', 'Savannah', 'Old Fourth Ward',
      'Cancer', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'yes'::public.wants_children,
      'verified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-sam/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000005'::uuid,
      'Riley',
      'TEST PROFILE — Virginia-Highland. Movie tonight if the vibes are right.',
      '11111111-1111-1111-1111-111111111002'::uuid,
      'open'::public.dating_intention,
      178, 'Teacher', 'GSU', 'Atlanta', 'Virginia-Highland',
      'Virgo', 'never'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'maybe'::public.wants_children,
      'unverified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-riley/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000006'::uuid,
      'Casey',
      'TEST PROFILE — Midtown. Climbing gym then tacos.',
      '11111111-1111-1111-1111-111111111001'::uuid,
      'figuring_out'::public.dating_intention,
      170, 'Physical therapist', 'Auburn', 'Birmingham', 'Midtown',
      'Gemini', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'yes'::public.wants_children,
      'unverified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-casey/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000007'::uuid,
      'Taylor',
      'TEST PROFILE — Buckhead. Surprise me.',
      '11111111-1111-1111-1111-111111111002'::uuid,
      'short_term'::public.dating_intention,
      180, 'Marketing', 'SCAD', 'Atlanta', 'Buckhead',
      'Aquarius', 'often'::public.lifestyle_habit, 'sometimes'::public.lifestyle_habit,
      'sometimes'::public.lifestyle_habit, 'no'::public.wants_children,
      'failed'::public.verification_status,
      'https://picsum.photos/seed/datetoday-taylor/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000008'::uuid,
      'Morgan',
      'TEST PROFILE — Downtown. Live music or a quiet patio.',
      '11111111-1111-1111-1111-111111111003'::uuid,
      'open'::public.dating_intention,
      172, 'Attorney', 'Morehouse', 'Atlanta', 'Downtown',
      'Capricorn', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'maybe'::public.wants_children,
      'manual_review'::public.verification_status,
      'https://picsum.photos/seed/datetoday-morgan/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000009'::uuid,
      'Avery',
      'TEST PROFILE — Old Fourth Ward. Coffee shops and people-watching.',
      '11111111-1111-1111-1111-111111111001'::uuid,
      'long_term'::public.dating_intention,
      163, 'Photographer', NULL, 'Nashville', 'Old Fourth Ward',
      'Libra', 'sometimes'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'sometimes'::public.lifestyle_habit, 'yes'::public.wants_children,
      'unverified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-avery/800/1200'
    ),
    (
      'a0000000-0000-4000-8000-000000000010'::uuid,
      'Quinn',
      'TEST PROFILE — Virginia-Highland. Chill hang, maybe a walk.',
      '11111111-1111-1111-1111-111111111004'::uuid,
      'casual'::public.dating_intention,
      176, 'Chef', 'CIA', 'New Orleans', 'Virginia-Highland',
      'Pisces', 'often'::public.lifestyle_habit, 'never'::public.lifestyle_habit,
      'never'::public.lifestyle_habit, 'no'::public.wants_children,
      'unverified'::public.verification_status,
      'https://picsum.photos/seed/datetoday-quinn/800/1200'
    )
) AS v(
  id, display_name, bio, gender_id, dating_intention, height_cm, occupation, school,
  hometown, neighborhood_label, zodiac, drinking, smoking, marijuana, wants_children,
  verification_status, main_photo_url
)
WHERE public.profiles.user_id = v.id;

-- Dating preferences
UPDATE public.dating_preferences SET
  interested_in = v.interested_in,
  min_age = v.min_age,
  max_age = v.max_age,
  max_distance_miles = v.max_distance_miles,
  updated_at = timezone('utc', now())
FROM (
  VALUES
    ('a0000000-0000-4000-8000-000000000001'::uuid, 'men'::public.interest_option[], 21, 32, 15),
    ('a0000000-0000-4000-8000-000000000002'::uuid, 'women'::public.interest_option[], 21, 30, 25),
    ('a0000000-0000-4000-8000-000000000003'::uuid, 'everyone'::public.interest_option[], 21, 35, 10),
    ('a0000000-0000-4000-8000-000000000004'::uuid, 'men'::public.interest_option[], 22, 35, 15),
    ('a0000000-0000-4000-8000-000000000005'::uuid, 'everyone'::public.interest_option, 21, 30, 25),
    ('a0000000-0000-4000-8000-000000000006'::uuid, 'men'::public.interest_option[], 24, 35, 10),
    ('a0000000-0000-4000-8000-000000000007'::uuid, 'women'::public.interest_option[], 18, 28, 25),
    ('a0000000-0000-4000-8000-000000000008'::uuid, 'everyone'::public.interest_option[], 24, 40, 15),
    ('a0000000-0000-4000-8000-000000000009'::uuid, 'everyone'::public.interest_option, 22, 34, 15),
    ('a0000000-0000-4000-8000-000000000010'::uuid, 'everyone'::public.interest_option[], 21, 35, 50)
) AS v(id, interested_in, min_age, max_age, max_distance_miles)
WHERE public.dating_preferences.user_id = v.id;

-- Profile photos (placeholder URLs)
DELETE FROM public.profile_photos
WHERE user_id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-000000000010'
);

INSERT INTO public.profile_photos (user_id, storage_path, public_url, sort_order, is_main)
SELECT
  u.id,
  u.id::text || '/main.jpg',
  p.main_photo_url,
  0,
  true
FROM public.users u
JOIN public.profiles p ON p.user_id = u.id
WHERE u.id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-000000000010'
);

-- At least 2 profile videos each (placeholder media)
DELETE FROM public.profile_videos
WHERE user_id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000008',
  'a0000000-0000-4000-8000-000000000009',
  'a0000000-0000-4000-8000-000000000010'
);

INSERT INTO public.profile_videos (
  user_id, prompt_id, prompt_text, video_url, thumbnail_url, storage_path, duration_seconds, sort_order
)
SELECT
  x.user_id,
  x.prompt_id,
  vp.prompt_text,
  'https://picsum.photos/seed/' || x.seed || '/720/1280',
  'https://picsum.photos/seed/' || x.seed || '-thumb/720/1280',
  x.user_id::text || '/video-' || x.sort_order || '.mp4',
  x.duration_seconds,
  x.sort_order
FROM (
  VALUES
    ('a0000000-0000-4000-8000-000000000001'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'maya-v1', 8.5, 0),
    ('a0000000-0000-4000-8000-000000000001'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 'maya-v2', 10.0, 1),
    ('a0000000-0000-4000-8000-000000000002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'jordan-v1', 7.0, 0),
    ('a0000000-0000-4000-8000-000000000002'::uuid, '22222222-2222-2222-2222-222222222004'::uuid, 'jordan-v2', 12.0, 1),
    ('a0000000-0000-4000-8000-000000000003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'alex-v1', 6.5, 0),
    ('a0000000-0000-4000-8000-000000000003'::uuid, '22222222-2222-2222-2222-222222222006'::uuid, 'alex-v2', 9.0, 1),
    ('a0000000-0000-4000-8000-000000000004'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'sam-v1', 11.0, 0),
    ('a0000000-0000-4000-8000-000000000004'::uuid, '22222222-2222-2222-2222-222222222005'::uuid, 'sam-v2', 8.0, 1),
    ('a0000000-0000-4000-8000-000000000005'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 'riley-v1', 9.5, 0),
    ('a0000000-0000-4000-8000-000000000005'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'riley-v2', 7.5, 1),
    ('a0000000-0000-4000-8000-000000000006'::uuid, '22222222-2222-2222-2222-222222222004'::uuid, 'casey-v1', 10.5, 0),
    ('a0000000-0000-4000-8000-000000000006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'casey-v2', 8.0, 1),
    ('a0000000-0000-4000-8000-000000000007'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'taylor-v1', 6.0, 0),
    ('a0000000-0000-4000-8000-000000000007'::uuid, '22222222-2222-2222-2222-222222222006'::uuid, 'taylor-v2', 13.0, 1),
    ('a0000000-0000-4000-8000-000000000008'::uuid, '22222222-2222-2222-2222-222222222005'::uuid, 'morgan-v1', 9.0, 0),
    ('a0000000-0000-4000-8000-000000000008'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 'morgan-v2', 11.5, 1),
    ('a0000000-0000-4000-8000-000000000009'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, 'avery-v1', 8.0, 0),
    ('a0000000-0000-4000-8000-000000000009'::uuid, '22222222-2222-2222-2222-222222222004'::uuid, 'avery-v2', 10.0, 1),
    ('a0000000-0000-4000-8000-000000000010'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'quinn-v1', 7.0, 0),
    ('a0000000-0000-4000-8000-000000000010'::uuid, '22222222-2222-2222-2222-222222222006'::uuid, 'quinn-v2', 14.0, 1)
) AS x(user_id, prompt_id, seed, duration_seconds, sort_order)
JOIN public.video_prompts vp ON vp.id = x.prompt_id;

-- Live sessions for a subset (coords approx Atlanta neighborhoods)
-- Midtown 33.7838,-84.3833 | Buckhead 33.8487,-84.3733 | Downtown 33.7490,-84.3880
-- Old Fourth Ward 33.7637,-84.3618 | Virginia-Highland 33.7828,-84.3547

INSERT INTO public.live_sessions (
  id, user_id, started_at, expires_at, status, radius_miles,
  latitude, longitude, available_from, available_until, availability_label
)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '4 hours',
    'active', 15,
    33.7838, -84.3833,
    timezone('utc', now()) + INTERVAL '1 hour',
    timezone('utc', now()) + INTERVAL '4 hours',
    'Until ~11 PM'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '3 hours',
    'active', 25,
    33.8487, -84.3733,
    timezone('utc', now()) + INTERVAL '30 minutes',
    timezone('utc', now()) + INTERVAL '3 hours',
    'Free after 8'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000003',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '5 hours',
    'active', 10,
    33.7490, -84.3880,
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '5 hours',
    'Now–midnight'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000004',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '2 hours',
    'active', 15,
    33.7637, -84.3618,
    timezone('utc', now()) + INTERVAL '45 minutes',
    timezone('utc', now()) + INTERVAL '2 hours',
    'Quick window'
  ),
  (
    'b0000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000005',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '6 hours',
    'active', 25,
    33.7828, -84.3547,
    timezone('utc', now()) + INTERVAL '2 hours',
    timezone('utc', now()) + INTERVAL '6 hours',
    'Late night OK'
  ),
  (
    'b0000000-0000-4000-8000-000000000006',
    'a0000000-0000-4000-8000-000000000006',
    timezone('utc', now()),
    timezone('utc', now()) + INTERVAL '3 hours',
    'active', 10,
    33.7855, -84.3790,
    timezone('utc', now()) + INTERVAL '1 hour',
    timezone('utc', now()) + INTERVAL '3 hours',
    'After gym'
  );

INSERT INTO public.live_session_activities (live_session_id, activity)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'drinks'),
  ('b0000000-0000-4000-8000-000000000001', 'dinner'),
  ('b0000000-0000-4000-8000-000000000002', 'dinner'),
  ('b0000000-0000-4000-8000-000000000002', 'activity'),
  ('b0000000-0000-4000-8000-000000000003', 'drinks'),
  ('b0000000-0000-4000-8000-000000000003', 'surprise_me'),
  ('b0000000-0000-4000-8000-000000000004', 'walk'),
  ('b0000000-0000-4000-8000-000000000004', 'coffee'),
  ('b0000000-0000-4000-8000-000000000005', 'movie'),
  ('b0000000-0000-4000-8000-000000000005', 'chill'),
  ('b0000000-0000-4000-8000-000000000006', 'activity'),
  ('b0000000-0000-4000-8000-000000000006', 'dinner');

INSERT INTO public.live_session_video (
  live_session_id, user_id, video_url, thumbnail_url, storage_path, duration_seconds, prompt_text
)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'https://picsum.photos/seed/datetoday-maya-tonight/720/1280',
    'https://picsum.photos/seed/datetoday-maya-tonight-t/720/1280',
    'a0000000-0000-4000-8000-000000000001/tonight.mp4',
    9.0,
    'TEST: Just got off work. Trying to grab tacos and drinks around 8.'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'https://picsum.photos/seed/datetoday-jordan-tonight/720/1280',
    'https://picsum.photos/seed/datetoday-jordan-tonight-t/720/1280',
    'a0000000-0000-4000-8000-000000000002/tonight.mp4',
    8.0,
    'TEST: Free in Buckhead after 8 — dinner ideas welcome.'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000003',
    'https://picsum.photos/seed/datetoday-alex-tonight/720/1280',
    'https://picsum.photos/seed/datetoday-alex-tonight-t/720/1280',
    'a0000000-0000-4000-8000-000000000003/tonight.mp4',
    7.5,
    'TEST: Downtown and ready for whatever tonight brings.'
  );

DO $$
BEGIN
  RAISE NOTICE 'DateToday seed complete: 10 TEST Atlanta profiles, 6 live sessions.';
END $$;
