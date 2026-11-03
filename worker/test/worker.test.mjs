import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

const ORIGIN = 'https://larrikincoffeecollective.com.au';
const env = { ALLOWED_ORIGIN: ORIGIN, DEV_ORIGIN: 'http://localhost:4321', DISCORD_WEBHOOK_URL: 'https://discord.test/hook', TURNSTILE_SECRET: 'turnstile-secret' };
const good = { name: 'Sam Rivera', email: 'sam@example.com', hub: 'Thornbury', coffee: 'Flat white', turnstileToken: 'tok', website: '' };

const realFetch = globalThis.fetch;
let calls;
let turnstileSuccess;
let discordOk;
beforeEach(() => {
  calls = [];
  turnstileSuccess = true;
  discordOk = true;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    if (String(url).includes('siteverify')) return new Response(JSON.stringify({ success: turnstileSuccess }), { status: 200 });
    return new Response(null, { status: discordOk ? 204 : 500 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const post = (body, headers = {}) =>
  worker.fetch(new Request('https://join.test/', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);
const discordCalls = () => calls.filter((c) => c.url === env.DISCORD_WEBHOOK_URL);

test('answers the CORS preflight for the site only', async () => {
  const ok = await worker.fetch(new Request('https://join.test/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const dev = await worker.fetch(new Request('https://join.test/', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4321' } }), env);
  assert.equal(dev.status, 204);
});

test('rejects other origins and requests with no origin', async () => {
  assert.equal((await post(good, { Origin: 'https://evil.example' })).status, 403);
  const none = await worker.fetch(new Request('https://join.test/', { method: 'POST', body: JSON.stringify(good) }), env);
  assert.equal(none.status, 403);
  assert.equal(discordCalls().length, 0);
});

test('rejects non-POST methods', async () => {
  const res = await worker.fetch(new Request('https://join.test/', { method: 'GET', headers: { Origin: ORIGIN } }), env);
  assert.equal(res.status, 405);
});

test('a valid, verified submission is posted to Discord and nothing else is stored', async () => {
  const res = await post(good);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const sent = discordCalls();
  assert.equal(sent.length, 1);
  const fields = Object.fromEntries(sent[0].body.embeds[0].fields.map((f) => [f.name, f.value]));
  assert.deepEqual(fields, { Name: 'Sam Rivera', Email: 'sam@example.com', Hub: 'Thornbury', 'Favourite way to drink coffee': 'Flat white' });
});

test('sends the Turnstile secret and token to siteverify', async () => {
  await post(good, { 'CF-Connecting-IP': '203.0.113.7' });
  const verify = calls.find((c) => c.url.includes('siteverify'));
  assert.equal(verify.body.secret, 'turnstile-secret');
  assert.equal(verify.body.response, 'tok');
  assert.equal(verify.body.remoteip, '203.0.113.7');
});

test('a failed Turnstile check is rejected and nothing reaches Discord', async () => {
  turnstileSuccess = false;
  const res = await post(good);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'verification');
  assert.equal(discordCalls().length, 0);
});

test('a missing Turnstile token is rejected without calling Cloudflare or Discord', async () => {
  const res = await post({ ...good, turnstileToken: '' });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('the honeypot field gets a fake success and sends nothing', async () => {
  const res = await post({ ...good, website: 'http://spam.example' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 0);
});

test('validates required fields and email shape', async () => {
  for (const bad of [{ name: '' }, { email: 'not-an-email' }, { email: '' }, { hub: '' }]) {
    const res = await post({ ...good, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.equal(calls.length, 0);
});

test('the optional coffee answer can be skipped', async () => {
  await post({ ...good, coffee: '' });
  const fields = discordCalls()[0].body.embeds[0].fields;
  assert.equal(fields.find((f) => f.name.startsWith('Favourite')).value, '(skipped)');
});

test('submitted text can never ping anyone or inject lines', async () => {
  await post({ ...good, name: '@everyone\n\nnew line', coffee: '<@123> hi' });
  const sent = discordCalls()[0].body;
  assert.deepEqual(sent.allowed_mentions, { parse: [] });
  const name = sent.embeds[0].fields.find((f) => f.name === 'Name').value;
  assert.equal(name.includes('\n'), false);
});

test('over-long fields are cut to their limits', async () => {
  await post({ ...good, name: 'a'.repeat(500), coffee: 'b'.repeat(900) });
  const fields = Object.fromEntries(discordCalls()[0].body.embeds[0].fields.map((f) => [f.name, f.value]));
  assert.equal(fields.Name.length, 80);
  assert.equal(fields['Favourite way to drink coffee'].length, 200);
});

test('rejects oversized and malformed bodies', async () => {
  assert.equal((await post({ ...good, name: 'x'.repeat(5000) })).status, 413);
  assert.equal((await post('{not json')).status, 400);
  assert.equal(calls.length, 0);
});

test('a Discord outage is reported as a delivery failure, not success', async () => {
  discordOk = false;
  const res = await post(good);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'delivery');
});
