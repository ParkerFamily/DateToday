// Deno Edge Function — Stripe webhook (server-only secrets).
// Never ship STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET to the mobile client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing stripe-signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stub: verify signature with Stripe SDK in production.
    // const event = stripe.webhooks.constructEvent(await req.text(), signature, webhookSecret);
    const body = (await req.json()) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase env missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const eventType = body.type ?? 'unknown';
    const obj = body.data?.object ?? {};

    if (eventType.startsWith('customer.subscription.')) {
      const userId = typeof obj.metadata === 'object' && obj.metadata !== null
        ? String((obj.metadata as Record<string, unknown>).user_id ?? '')
        : '';
      if (userId) {
        await admin.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_subscription_id: String(obj.id ?? ''),
            stripe_price_id: String(
              (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data?.[0]
                ?.price?.id ?? '',
            ),
            status: String(obj.status ?? 'incomplete'),
            current_period_start: obj.current_period_start
              ? new Date(Number(obj.current_period_start) * 1000).toISOString()
              : null,
            current_period_end: obj.current_period_end
              ? new Date(Number(obj.current_period_end) * 1000).toISOString()
              : null,
            cancel_at_period_end: Boolean(obj.cancel_at_period_end),
          },
          { onConflict: 'stripe_subscription_id' },
        );
      }
    }

    if (eventType === 'payment_intent.succeeded') {
      const userId = typeof obj.metadata === 'object' && obj.metadata !== null
        ? String((obj.metadata as Record<string, unknown>).user_id ?? '')
        : '';
      const productKey = typeof obj.metadata === 'object' && obj.metadata !== null
        ? String((obj.metadata as Record<string, unknown>).product_key ?? 'tonight_boost')
        : 'tonight_boost';
      if (userId) {
        await admin.from('purchases').insert({
          user_id: userId,
          stripe_payment_intent_id: String(obj.id ?? ''),
          stripe_price_id: Deno.env.get('STRIPE_PRICE_TONIGHT_BOOST') ?? null,
          product_key: productKey,
          amount_cents: typeof obj.amount === 'number' ? obj.amount : null,
          currency: typeof obj.currency === 'string' ? obj.currency : 'usd',
        });
      }
    }

    return new Response(JSON.stringify({ received: true, type: eventType }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
