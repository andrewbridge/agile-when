import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastRealSlotEnd, decideBuild, coverageHoursAhead } from './rates.mjs';

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

test('coverageHoursAhead measures forward coverage, negative once elapsed', () => {
  assert.equal(coverageHoursAhead(at('2026-08-08T12:00:00Z'), at('2026-08-08T00:00:00Z')), 12);
  assert.equal(coverageHoursAhead(at('2026-08-08T00:00:00Z'), at('2026-08-08T02:00:00Z')), -2);
});

// The last-attempt alarm. Escalating a skip must depend on whether we actually
// have the upcoming day's rates — not on whether this particular run found
// something new, which on a healthy day it never does.

test('last attempt with a full day of coverage skips quietly', () => {
  // The real 2026-08-08 19:36 run: the 16:46 build had already published rates
  // through 2026-08-09T22:00Z. This failed the workflow every day.
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-09T22:00:00Z'),
    fetchedEndMs: at('2026-08-09T22:00:00Z'),
    nowMs: at('2026-08-08T19:36:00Z'),
    lastAttempt: true,
  });
  assert.equal(decision.build, false);
  assert.notEqual(decision.alarm, true);
});

test('last attempt with only tonight\'s rates raises the alarm', () => {
  // 19:05 with coverage ending at 23:00 UK tonight — the publication window
  // really did pass without tomorrow's rates.
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-08T22:00:00Z'),
    fetchedEndMs: at('2026-08-08T22:00:00Z'),
    nowMs: at('2026-08-08T18:05:00Z'),
    lastAttempt: true,
  });
  assert.equal(decision.build, false);
  assert.equal(decision.alarm, true);
  assert.match(decision.reason, /Publication window passed/);
});

test('short coverage on an earlier cron skips without alarming', () => {
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-08T22:00:00Z'),
    fetchedEndMs: at('2026-08-08T22:00:00Z'),
    nowMs: at('2026-08-08T18:05:00Z'),
    lastAttempt: false,
  });
  assert.equal(decision.build, false);
  assert.notEqual(decision.alarm, true);
});

test('a partial publication at the last attempt builds without alarming', () => {
  const decision = decideBuild({
    ...base,
    publishedEndMs: at('2026-08-08T22:00:00Z'),
    fetchedEndMs: at('2026-08-09T02:00:00Z'),
    nowMs: at('2026-08-08T18:05:00Z'),
    lastAttempt: true,
  });
  assert.equal(decision.build, true);
  assert.notEqual(decision.alarm, true);
});
