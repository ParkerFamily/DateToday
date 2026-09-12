// Deno Edge Function — create a Persona inquiry (server-only API key).
// Set secrets: PERSONA_API_KEY, PERSONA_TEMPLATE_ID
// Optional: PERSONA_ENVIRONMENT (sandbox|production) — defaults to sandbox from key prefix.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type Body = {
  referenceId?: string;
  nameFirst?: string;
  birthdate?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('PERSONA_API_KEY');
    const templateId = Deno.env.get('PERSONA_TEMPLATE_ID');
    if (!apiKey || !templateId) {
      return new Response(
        JSON.stringify({
          error: 'PERSONA_API_KEY and PERSONA_TEMPLATE_ID must be set on the function',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!templateId.startsWith('itmpl_')) {
      return new Response(
        JSON.stringify({
          error: 'PERSONA_TEMPLATE_ID must start with itmpl_',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as Body;
    const referenceId = body.referenceId?.trim();
    if (!referenceId) {
      return new Response(JSON.stringify({ error: 'referenceId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fields: Record<string, string> = {};
    if (body.nameFirst?.trim()) fields['name-first'] = body.nameFirst.trim();
    if (body.birthdate?.trim()) fields.birthdate = body.birthdate.trim();

    const personaRes = await fetch('https://api.withpersona.com/api/v1/inquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Persona-Version': '2023-01-05',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            'inquiry-template-id': templateId,
            'reference-id': referenceId,
            ...(Object.keys(fields).length ? { fields } : {}),
          },
        },
      }),
    });

    const json = (await personaRes.json()) as {
      data?: {
        id?: string;
        attributes?: { 'session-token'?: string; status?: string };
      };
      errors?: { title?: string; details?: string }[];
    };

    if (!personaRes.ok || !json.data?.id) {
      return new Response(
        JSON.stringify({
          error: json.errors?.[0]?.details ?? json.errors?.[0]?.title ?? 'Persona create failed',
        }),
        {
          status: personaRes.status >= 400 ? personaRes.status : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const inquiryId = json.data.id;
    const sessionToken = json.data.attributes?.['session-token'];
    const redirectUri = 'datetoday://persona';
    const params = new URLSearchParams({
      'is-webview': 'true',
      'inquiry-id': inquiryId,
      'redirect-uri': redirectUri,
    });
    if (sessionToken) params.set('session-token', sessionToken);

    return new Response(
      JSON.stringify({
        inquiryId,
        sessionToken: sessionToken ?? null,
        status: json.data.attributes?.status ?? 'created',
        verifyUrl: `https://withpersona.com/verify?${params.toString()}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
