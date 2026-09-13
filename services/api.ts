import { supabase } from '@/lib/supabase/client';
import { assertSupabaseConfigured, env, isBackendConfigured } from '@/lib/env';
import type {
  DatingPreferences,
  InterestOption,
  LiveSession,
  Profile,
  RadiusMiles,
  TonightActivity,
  FoodCuisine,
  DiscoveryCard,
  SendPingResult,
} from '@/types';
import { analytics } from '@/lib/analytics';

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    bio: (row.bio as string | null) ?? null,
    genderId: (row.gender_id as string | null) ?? null,
    datingIntention: (row.dating_intention as Profile['datingIntention']) ?? null,
    heightCm: (row.height_cm as number | null) ?? null,
    occupation: (row.occupation as string | null) ?? null,
    school: (row.school as string | null) ?? null,
    hometown: (row.hometown as string | null) ?? null,
    neighborhoodLabel: (row.neighborhood_label as string | null) ?? null,
    zodiac: (row.zodiac as string | null) ?? null,
    verificationStatus: row.verification_status as Profile['verificationStatus'],
    mainPhotoUrl: (row.main_photo_url as string | null) ?? null,
    profileCompletion: (row.profile_completion as Record<string, boolean>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data) : null;
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<{
    display_name: string;
    bio: string | null;
    gender_id: string;
    dating_intention: string;
    height_cm: number | null;
    occupation: string | null;
    school: string | null;
    hometown: string | null;
    neighborhood_label: string | null;
    zodiac: string | null;
    drinking: string | null;
    smoking: string | null;
    marijuana: string | null;
    children: string | null;
    wants_children: string | null;
    main_photo_url: string | null;
    profile_completion: Record<string, boolean>;
  }>,
): Promise<Profile> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return mapProfile(data);
}

export async function fetchPreferences(userId: string): Promise<DatingPreferences | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('dating_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    userId: data.user_id,
    interestedIn: data.interested_in as InterestOption,
    minAge: data.min_age,
    maxAge: data.max_age,
    maxDistanceMiles: data.max_distance_miles,
    intentions: data.intentions ?? [],
  };
}

export async function updatePreferences(
  userId: string,
  patch: Partial<{
    interested_in: InterestOption;
    min_age: number;
    max_age: number;
    max_distance_miles: number;
    intentions: string[];
  }>,
): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from('dating_preferences')
    .update(patch)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchActiveLiveSession(userId: string): Promise<LiveSession | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('live_sessions')
    .select('id, user_id, started_at, expires_at, ended_at, status, radius_miles, available_from, available_until, availability_label')
    .eq('user_id', userId)
    .eq('status', 'active')
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
    endedAt: data.ended_at,
    status: data.status,
    radiusMiles: data.radius_miles as RadiusMiles,
    availableFrom: data.available_from,
    availableUntil: data.available_until,
    availabilityLabel: data.availability_label,
  };
}

export interface StartLiveInput {
  latitude: number;
  longitude: number;
  radiusMiles: RadiusMiles;
  expiresAt: string;
  activities: TonightActivity[];
  foodCuisines?: FoodCuisine[];
  availableFrom?: string | null;
  availableUntil?: string | null;
  availabilityLabel?: string | null;
  laterTonightHour?: number | null;
}

export async function startLiveSession(input: StartLiveInput): Promise<LiveSession> {
  if (isBackendConfigured()) {
    analytics.track('go_live_started');
    const { publishLiveSession } = await import('@/features/live/firestoreLive');
    return publishLiveSession(input);
  }
  assertSupabaseConfigured();
  analytics.track('go_live_started');
  const { data, error } = await supabase.rpc('start_live_session', {
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_radius_miles: input.radiusMiles,
    p_expires_at: input.expiresAt,
    p_activities: input.activities,
    p_available_from: input.availableFrom ?? null,
    p_available_until: input.availableUntil ?? null,
    p_availability_label: input.availabilityLabel ?? null,
  });
  if (error) throw error;
  analytics.track('go_live_completed');
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    startedAt: String(row.started_at),
    expiresAt: String(row.expires_at),
    endedAt: (row.ended_at as string | null) ?? null,
    status: row.status as LiveSession['status'],
    radiusMiles: row.radius_miles as RadiusMiles,
    availableFrom: (row.available_from as string | null) ?? null,
    availableUntil: (row.available_until as string | null) ?? null,
    availabilityLabel: (row.availability_label as string | null) ?? null,
    activities: input.activities,
    foodCuisines: input.foodCuisines,
    laterTonightHour: input.laterTonightHour ?? null,
  };
}

export async function endLiveSession(sessionId?: string): Promise<void> {
  if (isBackendConfigured()) {
    const { endFirestoreLiveSession } = await import('@/features/live/firestoreLive');
    await endFirestoreLiveSession(sessionId);
    return;
  }
  assertSupabaseConfigured();
  const { error } = await supabase.rpc('end_live_session', {
    p_session_id: sessionId ?? null,
  });
  if (error) throw error;
  analytics.track('go_live_ended');
}

export async function fetchDiscoveryFeed(limit = 20): Promise<DiscoveryCard[]> {
  if (isBackendConfigured()) {
    const { fetchFirestoreDiscoveryFeed } = await import('@/features/live/firestoreLive');
    return fetchFirestoreDiscoveryFeed(limit);
  }
  if (!env.supabaseUrl || !env.supabaseAnonKey) return [];
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('get_discovery_feed', {
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: String(row.user_id),
    displayName: String(row.display_name),
    age: Number(row.age),
    neighborhoodLabel: (row.neighborhood_label as string | null) ?? null,
    distanceMiles: Number(row.distance_miles),
    verificationStatus: row.verification_status as DiscoveryCard['verificationStatus'],
    datingIntention: (row.dating_intention as DiscoveryCard['datingIntention']) ?? null,
    bio: (row.bio as string | null) ?? null,
    mainPhotoUrl: (row.main_photo_url as string | null) ?? null,
    liveSessionId: String(row.live_session_id),
    liveUntil: String(row.expires_at),
    availabilityLabel: (row.availability_label as string | null) ?? null,
    activities: (row.activities as TonightActivity[]) ?? [],
    isBoosted: Boolean(row.is_boosted),
    rankScore: 0,
    videoPrompts: Array.isArray(row.video_prompts)
      ? (row.video_prompts as DiscoveryCard['videoPrompts'])
      : [],
  }));
}

export async function sendPing(recipientId: string): Promise<SendPingResult> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('send_ping', {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
  const result = data as {
    ping: Record<string, unknown>;
    mutual: boolean;
    match_id?: string;
    conversation_id?: string;
  };
  analytics.track(result.mutual ? 'ping_mutual' : 'ping_sent', {
    recipient_id: recipientId,
  });
  return {
    ping: {
      id: String(result.ping.id),
      senderId: String(result.ping.sender_id),
      recipientId: String(result.ping.recipient_id),
      senderLiveSessionId: String(result.ping.sender_live_session_id),
      recipientLiveSessionId: String(result.ping.recipient_live_session_id),
      status: result.ping.status as SendPingResult['ping']['status'],
      createdAt: String(result.ping.created_at),
      expiresAt: String(result.ping.expires_at),
    },
    mutual: result.mutual,
    matchId: result.match_id,
    conversationId: result.conversation_id,
  };
}
