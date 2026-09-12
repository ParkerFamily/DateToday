import { supabase } from '@/lib/supabase/client';
import { assertSupabaseConfigured } from '@/lib/env';
import type { ReportReason } from '@/types';
import { analytics } from '@/lib/analytics';

/** Legacy Supabase path — only used when Firebase is not the active backend. */
export async function blockUserSupabase(blockedId: string, reason?: string): Promise<void> {
  assertSupabaseConfigured();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase.from('blocks').insert({
    blocker_id: user.id,
    blocked_id: blockedId,
    reason: reason ?? null,
  });
  if (error) throw error;
  analytics.track('user_blocked');
}

export async function reportUserSupabase(input: {
  reportedId: string;
  reason: ReportReason;
  details?: string;
  matchId?: string;
  dateId?: string;
}): Promise<void> {
  assertSupabaseConfigured();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    reported_id: input.reportedId,
    reason: input.reason,
    details: input.details ?? null,
    match_id: input.matchId ?? null,
    date_id: input.dateId ?? null,
  });
  if (error) throw error;
  analytics.track('report_submitted', { reason: input.reason });
}

export async function unblockUserSupabase(blockedId: string): Promise<void> {
  assertSupabaseConfigured();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}
