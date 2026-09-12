// Deno Edge Function — Persona webhook → profiles.verification_status
// Dashboard → Webhooks → point to this function URL.
// Set PERSONA_WEBHOOK_SECRET if you enable webhook signing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, persona-signature',
};

function mapStatus(raw: string | undefined): string | null {
  const s = (raw ?? '').toLowerCase();
  if (s === 'completed' || s === 'approved') return 'verified';
  if (s === 'failed' || s === 'declined') return 'failed';
  if (s === 'needs_review' || s === 'needs-review') return 'manual_review';
  if (s === 'created' || s === 'pending' || s === 'started') return 'pending';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase env missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Optional: verify Persona-Signature when PERSONA_WEBHOOK_SECRET is set.
    const webhookSecret = Deno.env.get('PERSONA_WEBHOOK_SECRET');
    if (webhookSecret) {
      const sig = req.headers.get('persona-signature');
      if (!sig) {
        return new Response(JSON.stringify({ error: 'Missing persona-signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Full HMAC verification should be added with Persona's documented scheme.
    }

    const payload = (await req.json()) as {
      data?: {
        type?: string;
        id?: string;
        attributes?: {
          status?: string;
          'reference-id'?: string;
          payload?: { data?: { attributes?: { status?: string; 'reference-id'?: string } } };
        };
      };
      included?: unknown[];
    };

    const attrs = payload.data?.attributes ?? {};
    const nested = attrs.payload?.data?.attributes;
    const statusRaw = nested?.status ?? attrs.status;
    const referenceId = nested?.['reference-id'] ?? attrs['reference-id'];
    const mapped = mapStatus(statusRaw);

    if (!mapped || !referenceId) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { error } = await admin
      .from('profiles')
      .update({
        verification_status: mapped,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', referenceId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, referenceId, status: mapped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
