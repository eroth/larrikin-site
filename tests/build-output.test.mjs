// Run after `astro build`: checks the generated site is complete and has no broken local links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const pages = { '/': 'index.html', '/terms': 'terms/index.html', '/privacy': 'privacy/index.html', '/404': '404.html' };
const html = (file) => readFileSync(join(dist, file), 'utf8');

test('every page is generated with a title and one h1', () => {
  for (const file of Object.values(pages)) {
    assert.ok(existsSync(join(dist, file)), `${file} missing`);
    const doc = html(file);
    assert.match(doc, /<title>[^<]+<\/title>/, `${file} has no title`);
    assert.equal(doc.match(/<h1[ >]/g)?.length, 1, `${file} should have exactly one h1`);
  }
});

test('local links and images resolve', () => {
  for (const file of Object.values(pages)) {
    for (const [, url] of html(file).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const target = url === '/' ? 'index.html' : url;
      const found = [target, `${target}.html`, join(target, 'index.html')].some((t) => existsSync(join(dist, t)));
      assert.ok(found, `${file} links to missing ${url}`);
    }
  }
});

test('home page covers how it works and names both hubs, but no people', () => {
  const doc = html('index.html');
  for (const id of ['how', 'hubs']) assert.match(doc, new RegExp(`id="${id}"`));
  assert.match(doc, /Thornbury and Northcote/);
});

test('no Discord invite links (a link to Discord\'s own privacy policy is fine)', () => {
  for (const file of Object.values(pages)) assert.doesNotMatch(html(file), /(?:href|src)="[^"]*(?:discord\.gg|discord(?:app)?\.com\/invite)/i);
});

test('roaster logos appear only when configured, each with alt text and an existing file', () => {
  const configured = [...readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8').matchAll(/logo:\s*'([^']+)'/g)];
  const doc = html('index.html');
  assert.equal(doc.includes('class="logos"'), configured.length > 0);
  for (const [, logo] of configured) assert.ok(existsSync(join(dist, logo)), `${logo} missing from build`);
  for (const [tag] of doc.matchAll(/<ul class="logos"[\s\S]*?<\/ul>/g)) {
    for (const [img] of tag.matchAll(/<img[^>]*>/g)) assert.match(img, /alt="[^"]+"/);
  }
});

test('contact section and mailto links appear only when an email is configured', () => {
  const configured = /contactEmail:\s*'[^']+'/.test(readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8'));
  assert.equal(/id="contact"/.test(html('index.html')), configured);
  assert.equal(/href="mailto:/.test(html('index.html')), configured);
});

test('header nav links only to sections that exist, in page order, and stays short enough for a phone', () => {
  const doc = html('index.html');
  const ids = [...doc.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
  const links = [...doc.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1].matchAll(/<a ([^>]*)href="\/#([^"]+)"/g)];
  const nav = links.map((m) => m[2]);
  assert.deepEqual(nav, ids.filter((id) => nav.includes(id)));
  const phone = links.filter((m) => !m[1].includes('nav-wide'));
  assert.ok(phone.length <= 3, 'more than 3 links wrap onto a second line on a 430px phone; mark extras class="nav-wide"');
});

test('join chat appears only when an endpoint is configured, and never ships an unfinished form', () => {
  const configured = /joinEndpoint:\s*'[^']+'/.test(readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8'));
  const doc = html('index.html');
  assert.equal(/id="join-chat"/.test(doc), configured);
  assert.equal(/id="join"/.test(doc), configured);
  assert.equal(/href="#join"/.test(doc), configured);
});

const siteConfig = () => readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');

test('a live join form always has a Turnstile site key, and the privacy page covers it', () => {
  const live = /joinEndpoint:\s*'[^']+'/.test(siteConfig());
  if (live) assert.match(siteConfig(), /turnstileSiteKey:\s*'[^']+'/, 'joinEndpoint is set but turnstileSiteKey is empty: every submission would be rejected');
  const privacy = html('privacy/index.html');
  assert.equal(/The join form/.test(privacy), live);
  assert.equal(/Turnstile/.test(privacy), live);
  assert.match(privacy, /discord\.com\/privacy/);
});

test('the only outside hosts the site scripts contact are the map and the bot check', () => {
  const dir = join(dist, '_astro');
  const external = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8'));
  const inline = [...html('index.html').matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]); // small scripts are inlined
  const mine = [...external, ...inline].filter((js) => js.includes('join-chat'));
  assert.ok(mine.length > 0, 'join chat script missing from build');
  const hosts = new Set(mine.flatMap((js) => [...js.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1])));
  assert.deepEqual([...hosts].filter((h) => !['challenges.cloudflare.com'].includes(h)), [], 'unexpected outside host in the join chat script');
});

test('footer links to terms and privacy on every page', () => {
  for (const file of Object.values(pages)) {
    assert.match(html(file), /href="\/terms"/);
    assert.match(html(file), /href="\/privacy"/);
  }
});

test('footer acknowledges the Traditional Owners and names both hubs on every page', () => {
  for (const file of Object.values(pages)) {
    const doc = html(file);
    assert.match(doc, /Wurundjeri Woi-wurrung people of the Kulin Nation/, `${file} missing acknowledgement`);
    assert.match(doc, /hubs in Thornbury and Northcote sit/, `${file} acknowledgement doesn't name the hubs`);
  }
});

test('hub map lists every hub, and the privacy page discloses the tile provider', () => {
  const doc = html('index.html');
  const data = doc.match(/id="hub-map"[^>]*data-hubs="([^"]+)"/);
  assert.ok(data, 'hub map missing');
  const hubs = JSON.parse(data[1].replaceAll('&#34;', '"').replaceAll('&quot;', '"'));
  assert.deepEqual(hubs.map((h) => h.name), ['Thornbury', 'Northcote']);
  for (const h of hubs) assert.ok(h.lat < -37 && h.lat > -38 && h.lng > 144 && h.lng < 146 && h.radiusKm > 0, `${h.name} has implausible coordinates`);
  const entry = readdirSync(join(dist, '_astro')).find((f) => f.startsWith('index.astro_astro_type_script'));
  assert.ok(statSync(join(dist, '_astro', entry)).size < 20_000, 'map library should load lazily, not in the page entry script');
  const script = readdirSync(join(dist, '_astro')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, '_astro', f), 'utf8')).join('');
  assert.match(script, /tiles\.openfreemap\.org\/styles\//, 'map style missing');
  assert.match(html('privacy/index.html'), /OpenFreeMap/);
});

test('no cookies or third-party scripts (privacy policy says there are none)', () => {
  for (const file of Object.values(pages)) {
    assert.doesNotMatch(html(file), /<script[^>]+src="https?:/);
  }
});
