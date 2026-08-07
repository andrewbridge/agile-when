import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastRealSlotEnd, decideBuild } from './rates.mjs';

const at = (iso) => new Date(iso).getTime();
const slot = (from, to, extra = {}) => ({ from, to, pence: 10, ...extra });

test('lastRealSlotEnd returns the furthest real slot end', () => {
  const rates = [
    slot('2026-08-07T10:00:00Z', '2026-08-07T10:30:00Z'),
    slot('2026-08-07T11:00:00Z', '2026-08-07T11:30:00Z'),
  ];
  assert.equal(lastRealSlotEnd(rates), at('2026-08-07T11:30:00Z'));
});

test('lastRealSlotEnd ignores forecast slots', () => {
  const rates = [
    slot('2026-08-07T10:00:00Z', '2026-08-07T10:30:00Z'),
    slot('2026-08-09T10:00:00Z', '2026-08-09T10:30:00Z', { predicted: true }),
  ];
  assert.equal(lastRealSlotEnd(rates), at('2026-08-07T10:30:00Z'));
});

test('lastRealSlotEnd does not assume sorted input', () => {
  const rates = [
    slot('2026-08-07T11:00:00Z', '2026-08-07T11:30:00Z'),
    slot('2026-08-07T10:00:00Z', '2026-08-07T10:30:00Z'),
  ];
  assert.equal(lastRealSlotEnd(rates), at('2026-08-07T11:30:00Z'));
});

test('lastRealSlotEnd returns 0 for empty, missing or unusable input', () => {
  assert.equal(lastRealSlotEnd([]), 0);
  assert.equal(lastRealSlotEnd(undefined), 0);
  assert.equal(lastRealSlotEnd(null), 0);
  assert.equal(lastRealSlotEnd([slot('nonsense', 'nonsense')]), 0);
  assert.equal(lastRealSlotEnd([slot('2026-08-07T10:00:00Z', '2026-08-07T10:30:00Z', { predicted: true })]), 0);
});

const base = {
  force: false,
  publishedOk: true,
  publishedEndMs: at('2026-08-07T22:00:00Z'),
  fetchedEndMs: at('2026-08-07T22:00:00Z'),
  nowMs: at('2026-08-07T14:00:00Z'),
};

test('no rates fetched at all is fatal, even under force', () => {
  const decision = decideBuild({ ...base, fetchedEndMs: 0 });
  assert.equal(decision.build, false);
  assert.equal(decision.fatal, true);

  const forced = decideBuild({ ...base, fetchedEndMs: 0, force: true });
  assert.equal(forced.build, false);
  assert.equal(forced.fatal, true);
});

test('force builds even when coverage has not moved', () => {
  assert.equal(decideBuild({ ...base, force: true }).build, true);
});

test('builds when there is no published data to compare against', () => {
  assert.equal(decideBuild({ ...base, publishedOk: false, publishedEndMs: 0 }).build, true);
});

test('builds when the fetched data extends coverage', () => {
  const decision = decideBuild({ ...base, fetchedEndMs: at('2026-08-08T22:00:00Z') });
  assert.equal(decision.build, true);
  assert.match(decision.reason, /Coverage extended/);
});

test('builds when the live data has fully elapsed', () => {
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-06T22:00:00Z'),
    fetchedEndMs: at('2026-08-06T22:00:00Z'),
    nowMs: at('2026-08-07T14:00:00Z'),
  });
  assert.equal(decision.build, true);
  assert.match(decision.reason, /exhausted/);
});

test('skips without failing when there is simply nothing new', () => {
  const decision = decideBuild(base);
  assert.equal(decision.build, false);
  assert.notEqual(decision.fatal, true);
});

// The two cases this gate exists for.

test('a post-midnight run with unchanged coverage skips rather than failing', () => {
  // 00:30 UK on the 8th: tomorrow's rates are not due until the afternoon, so
  // coverage is unchanged. The old tomorrow-evening assertion failed here.
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-08T22:00:00Z'),
    fetchedEndMs: at('2026-08-08T22:00:00Z'),
    nowMs: at('2026-08-07T23:30:00Z'),
  });
  assert.equal(decision.build, false);
  assert.notEqual(decision.fatal, true);
});

test('the first cron to see tomorrow\'s rates builds', () => {
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-07T22:00:00Z'),
    fetchedEndMs: at('2026-08-08T22:00:00Z'),
    nowMs: at('2026-08-07T16:05:00Z'),
  });
  assert.equal(decision.build, true);
});
