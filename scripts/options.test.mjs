import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveDataMode, DATA_MODES } from './options.mjs';

test('each mode can be selected explicitly by flag', () => {
  for (const mode of DATA_MODES) {
    assert.equal(resolveDataMode([`--data=${mode}`], {}), mode);
  }
});

test('DATA_MODE env selects a mode when no flag is given', () => {
  assert.equal(resolveDataMode([], { DATA_MODE: 'reuse' }), 'reuse');
});

test('the flag wins over the env var', () => {
  assert.equal(resolveDataMode(['--data=regenerate'], { DATA_MODE: 'reuse' }), 'regenerate');
});

test('defaults to conditional', () => {
  assert.equal(resolveDataMode([], {}), 'conditional');
});

test('pre-modes flags still mean regenerate', () => {
  assert.equal(resolveDataMode(['--force'], {}), 'regenerate');
  assert.equal(resolveDataMode(['--no-cache'], {}), 'regenerate');
  assert.equal(resolveDataMode([], { FORCE: '1' }), 'regenerate');
  assert.equal(resolveDataMode([], { NO_CACHE: 'true' }), 'regenerate');
});

test('an explicit mode wins over the legacy flags', () => {
  assert.equal(resolveDataMode(['--data=conditional', '--force'], {}), 'conditional');
});

test('an unknown mode throws rather than silently defaulting', () => {
  assert.throws(() => resolveDataMode(['--data=bogus'], {}), /Unknown data mode/);
  assert.throws(() => resolveDataMode(['--data='], {}), /Unknown data mode/);
  assert.throws(() => resolveDataMode([], { DATA_MODE: 'skip' }), /Unknown data mode/);
});
