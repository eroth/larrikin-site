// Receives the join form, checks it's from a human (Cloudflare Turnstile), and posts it to a private
// Discord channel. Nothing is stored here. Secrets (DISCORD_WEBHOOK_URL, TURNSTILE_SECRET) are set
// with `wrangler secret put`, never committed.

const MAX_BODY_BYTES = 4096;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Collapse whitespace/control characters so a field can't forge extra lines in the Discord message.
const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim().slice(0, max) : '';

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = [env.ALLOWED_ORIGIN, env.DEV_ORIGIN].filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!cors) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { ok: false, error: 'method' }, cors);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' }, cors);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: 'invalid' }, cors);
    }

    // Bots fill the hidden field. Pretend it worked so they don't learn it was caught.
    if (clean(body.website, 50)) return json(200, { ok: true }, cors);

    const name = clean(body.name, 80);
    const email = clean(body.email, 120);
    const hub = clean(body.hub, 40);
    const coffee = clean(body.coffee, 200);
    if (!name || !EMAIL.test(email) || !hub) return json(400, { ok: false, error: 'invalid' }, cors);

    const token = clean(body.turnstileToken, 2048);
    if (!token) return json(400, { ok: false, error: 'verification' }, cors);
    const verify = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('CF-Connecting-IP') ?? undefined }),
    });
    const result = verify.ok ? await verify.json() : { success: false };
    if (!result.success) return json(400, { ok: false, error: 'verification' }, cors);

    const discord = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Submitted text must never ping anyone, whatever it contains.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: 'New join request',
            fields: [
              { name: 'Name', value: name },
              { name: 'Email', value: email },
              { name: 'Hub', value: hub },
              { name: 'Favourite way to drink coffee', value: coffee || '(skipped)' },
            ],
          },
        ],
      }),
    });
    if (!discord.ok) return json(502, { ok: false, error: 'delivery' }, cors);
    return json(200, { ok: true }, cors);
  },
};
