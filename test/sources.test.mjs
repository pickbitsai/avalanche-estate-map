// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectObserved, projectDeclared, syncCMDB } from '../lib/sync.mjs';
import { parseCSV, parseScheduledTasks, readScheduledTasks } from '../lib/scheduler.mjs';
import { getCI, listRelationships, openStore } from '../lib/store.mjs';
import { fixture, observations } from './helpers.mjs';

test('all absent optional sources disable cleanly without invoking commands', async t => {
  const { settings } = fixture(t); settings.sources = { scheduler: { provider: 'none' } };
  const result = await syncCMDB({ settings, run: () => { throw new Error('must not run'); } });
  assert.equal(result.counts.total, 0);
  for (const name of ['manifest','estate','products','ports','tasks']) assert.match(result.sources[name], /disabled/);
});
for (const name of ['manifest','estate','products']) test(`missing ${name} path is reported and never crashes`, async t => {
  const { settings, dir } = fixture(t);
  settings.sources = { scheduler: { provider: 'none' }, [name]: { path: join(dir, 'missing.json') } };
  const result = await syncCMDB({ settings }); assert.equal(result.counts.total, 0); assert.match(result.sources[name], /unavailable/);
});
test('port-check argv and cwd are used without a shell; scheduler errors are explicit', async t => {
  const { settings, manifest, dir } = fixture(t);
  settings.sources.portCheck = { command: { argv: ['node', 'ports.mjs'], cwd: dir } };
  settings.sources.scheduler = { provider: 'windows-task-scheduler' };
  const declared = projectDeclared(manifest, settings);
  const result = await collectObserved({ settings, declared, run: async (argv, options) => {
    assert.deepEqual(argv, ['node','ports.mjs']); assert.equal(options.cwd, dir);
    return { code: 1, stdout: '{"listening":[4301,4399,4301]}' };
  }, loadTasks: async () => { throw new Error('not available'); } });
  assert.deepEqual(result.ports.listeners, [4301,4399]); assert.equal(result.ports.complete, true);
  assert.match(result.tasks.note, /unavailable/); assert.equal(result.tasks.complete, false);
  const failed = await collectObserved({ settings, declared, run: async () => ({ code: null, stdout: '' }), loadTasks: async () => new Map() });
  assert.equal(failed.ports.complete, false); assert.match(failed.ports.note, /unavailable/);
});
test('missing evidence preserves statuses, ownership and declared relationships', async t => {
  const { settings, manifest, dir } = fixture(t);
  await syncCMDB({ settings, manifest, observations: observations({ ports: [4301] }), apply: true, actor: 'agent:scout', now: new Date('2026-01-01') });
  settings.sources.manifest.path = join(dir, 'missing.json');
  const result = await syncCMDB({ settings, apply: true, actor: 'agent:scout', now: new Date('2026-05-01') });
  assert.equal(result.counts.stale, 0);
  const db = openStore(settings.db, { readOnly: true });
  try { assert.equal(getCI(db, 'server_endpoint:4301').status, 'reconciled'); assert.equal(listRelationships(db).length, 3); } finally { db.close(); }
  await syncCMDB({ settings, observations: observations({ ports: [4301] }), apply: true, actor: 'agent:scout', now: new Date('2026-05-02') });
  const live = openStore(settings.db, { readOnly: true });
  try {
    const endpoint = getCI(live, 'server_endpoint:4301');
    assert.equal(endpoint.status, 'reconciled'); assert.equal(endpoint.attrs.manifest_id, 'alpha');
    assert.equal(endpoint.last_declared_at, '2026-01-01T00:00:00.000Z');
    assert.equal(endpoint.last_observed_at, '2026-05-02T00:00:00.000Z');
  } finally { live.close(); }
});
test('estate registry merges with manifest; manifest takes precedence on shared identities', async t => {
  const { settings, dir } = fixture(t);
  settings.sources.estate = { path: join(dir, 'extra.json') };
  writeFileSync(settings.sources.estate.path, JSON.stringify({ engines: [{ id: 'gamma', name: 'Gamma', servers: [] }] }));
  const result = await syncCMDB({ settings, observations: observations() });
  assert.equal(result.projected.cis, 8); assert.match(result.sources.estate, /read /);
});
test('scheduler CSV handles quoted commas, escaped quotes, folders, CRLF and localized status', async () => {
  const csv = '"\\Juniper Daily","Tomorrow, 10:00","Ready"\r\n"\\Studio\\Draft ""Review""","","Prêt"\r\n';
  const tasks = parseScheduledTasks(csv);
  assert.equal(tasks.get('Juniper Daily').nextRun, 'Tomorrow, 10:00');
  assert.equal(tasks.get('Studio\\Draft "Review"').status, 'Prêt');
  assert.deepEqual(parseCSV('"multiline\nname","","Ready"')[0], ['multiline\nname','','Ready']);
  assert.throws(() => parseScheduledTasks('"unfinished'), /unterminated/);
  assert.throws(() => parseScheduledTasks('ERROR: access denied'), /three/);
  const live = await readScheduledTasks({ platform: 'win32', run: async argv => { assert.deepEqual(argv, ['schtasks.exe','/Query','/FO','CSV','/NH']); return { code: 0, stdout: csv }; } });
  assert.equal(live.size, 2);
  await assert.rejects(readScheduledTasks({ platform: 'linux' }), /requires Windows/);
  await assert.rejects(readScheduledTasks({ platform: 'win32', run: async () => ({ code: 1, stderr: 'denied' }) }), /denied/);
});
test('undeclared scheduled jobs become observed-only CIs', async t => {
  const { settings } = fixture(t);
  const result = await syncCMDB({ settings, observations: observations({ tasks: { 'Juniper-Extra': { status: 'Ready' } } }) });
  assert.ok(result.report.observed_only.some(ci => ci.ci_key === 'scheduled_task:Juniper-Extra'));
});

test('malformed registry collections are unavailable rather than crashing or removing evidence', async t => {
  const { settings } = fixture(t);
  for (const manifest of [{ engines: {} }, { engines: [{ id: 'alpha', servers: {} }] }, { engines: [{ id: 'alpha', nodes: [null] }] }]) {
    const result = await syncCMDB({ settings, manifest, observations: observations() });
    assert.match(result.sources.manifest, /unavailable/); assert.equal(result.counts.total, 0);
  }
});
