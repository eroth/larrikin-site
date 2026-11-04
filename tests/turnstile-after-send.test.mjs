import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleTurnstile } from '../src/scripts/turnstile-after-send.mjs';

const fakeTurnstile = () => {
  const calls = [];
  return { calls, remove: (id) => calls.push(['remove', id]), reset: (id) => calls.push(['reset', id]) };
};

test('a delivered request removes the widget instead of starting a new challenge', () => {
  const ts = fakeTurnstile();
  assert.equal(settleTurnstile(ts, 'w1', true), undefined);
  assert.deepEqual(ts.calls, [['remove', 'w1']]);
});

test('a failed request resets the widget so a retry gets a fresh token', () => {
  const ts = fakeTurnstile();
  assert.equal(settleTurnstile(ts, 'w1', false), 'w1');
  assert.deepEqual(ts.calls, [['reset', 'w1']]);
});

test('does nothing when the widget never rendered or Turnstile never loaded', () => {
  const ts = fakeTurnstile();
  assert.equal(settleTurnstile(ts, undefined, true), undefined);
  assert.equal(settleTurnstile(undefined, 'w1', true), 'w1');
  assert.deepEqual(ts.calls, []);
});
