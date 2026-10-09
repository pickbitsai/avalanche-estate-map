// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { fixture } from './helpers.mjs';

const cases = [
  ['--help', ['--help'], 0, /Global flags:/],
  ['unknown command', ['unknown-command'], 1, /unknown command:/],
  ['unknown option', ['--unknown-option'], 1, /Unknown option/],
  ['missing owner', ['own', 'engine:alpha'], 1, /--owner is required/],
  ['invalid depth', ['tree', 'engine:alpha', '--depth', 'invalid'], 1, /depth/],
  ['invalid config', ['sync', '--apply'], 1, /Invalid config: desk.port/,
    { AVALANCHE_ESTATE_DESK_PORT: 'invalid' }],
  ['missing database', ['list'], 1, /database missing/],
  ['dry-run sync', ['sync'], 0, /DRY RUN/],
];

for (const [label, args, status, output, overrides = {}] of cases) {
  test(`CLI ${label} leaves a nonexistent data directory absent`, t => {
    const { dir } = fixture(t);
    const dataDir = join(dir, 'data');
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !/^(?:AVALANCHE_ESTATE_|NODE_OPTIONS$|NODE_PATH$)/i.test(key)));
    assert.equal(existsSync(dataDir), false);
    const result = spawnSync(process.execPath, [
      '--import', new URL('./no-network.mjs', import.meta.url).href,
      join(ROOT, 'bin', 'avalanche-estate.mjs'), '--data-dir', dataDir, ...args,
    ], { cwd: ROOT, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, status, result.stderr);
    assert.match(status === 0 ? result.stdout : result.stderr, output);
    assert.equal(existsSync(dataDir), false, 'the CLI must not create the data directory');
    assert.deepEqual(readdirSync(dir), [], 'the CLI must not write other artifacts');
  });
}
