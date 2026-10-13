// Run after `astro build`: checks the generated site is complete and has no broken local links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('no Discord links', () => {
  for (const file of Object.values(pages)) assert.doesNotMatch(html(file), /discord/i);
});

test('contact section and mailto links appear only when an email is configured', () => {
  const configured = /contactEmail:\s*'[^']+'/.test(readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8'));
  assert.equal(/id="contact"/.test(html('index.html')), configured);
  assert.equal(/href="mailto:/.test(html('index.html')), configured);
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

test('no cookies or third-party scripts (privacy policy says there are none)', () => {
  for (const file of Object.values(pages)) {
    assert.doesNotMatch(html(file), /<script[^>]+src="https?:/);
  }
});
