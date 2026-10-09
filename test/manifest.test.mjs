// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDeclared, syncCMDB } from '../lib/sync.mjs';
import { fixture, observations } from './helpers.mjs';

const fixturePath = fileURLToPath(new URL('./fixtures/mixed-tasks.json', import.meta.url));
test('mixed task names and objects on engines and satellites project independently with named warnings', async t => {
  const { settings } = fixture(t);
  settings.sources.manifest.path = fixturePath;
  const manifest = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const projected = projectDeclared(manifest, settings);
  const tasks = [...projected.cis.values()].filter(ci => ci.class === 'scheduled_task');
  assert.deepEqual(tasks.map(ci => ci.attrs.task_name).sort(), ['Juniper-Archive', 'Juniper-Audit', 'Juniper-Cleanup', 'Juniper-Daily', 'Juniper-Guide', 'Juniper-Index', 'Juniper-Summary', 'Studio\\Night']);
  for (const task of tasks) assert.ok([...projected.relationships.values()].some(rel => rel.from_key === task.ci_key && rel.type === 'scheduled_by'));
  assert.ok(projected.cis.has('engine:juniper-search'));
  assert.ok(projected.cis.has('server_endpoint:4320'));
  assert.ok(projected.cis.has('server_endpoint:4321'));
  assert.equal(projected.cis.get('engine:juniper-content').attrs.note, null);
  assert.equal(projected.cis.get('engine:juniper-content').attrs.url, null);
  assert.ok(projected.skipped.some(note => /invalid-tasks.*Broken job/.test(note)));
  assert.ok(projected.skipped.some(note => /broken-engine.*dir/.test(note)));
  assert.ok(projected.skipped.some(note => /studio-guide.*broken-listener/.test(note)));
  assert.ok(!projected.skipped.some(note => /manual-review/.test(note)));
  const result = await syncCMDB({ settings, observations: observations({ tasks: Object.fromEntries(tasks.map(task => [task.attrs.task_name, { status: 'Ready' }])) }) });
  assert.match(result.sources.manifest, /^read /);
  assert.equal(result.counts.reconciled, 8);
  assert.equal(result.skipped.length, 4);
});

test('registry dir paths use the registry directory by default and explicit roots for each source', async t => {
  const { settings, dir } = fixture(t);
  const manifest = { engines: [{ id: 'alpha', dir: 'services/alpha' }], satellites: [{ id: 'guide', dir: 'sites/guide' }] };
  const projected = projectDeclared(manifest, settings);
  assert.equal(projected.cis.get('engine:alpha').attrs.path, resolve(dirname(settings.sources.manifest.path), 'services/alpha'));
  settings.sources.manifest.root = '../registry-root';
  assert.equal(projectDeclared(manifest, settings).cis.get('satellite:guide').attrs.path, resolve(dirname(settings.sources.manifest.path), '../registry-root/sites/guide'));
  settings.sources.manifest.root = join(dir, 'primary');
  settings.sources.estate = { path: join(dir, 'estate.json'), root: 'secondary' };
  writeFileSync(settings.sources.estate.path, JSON.stringify({ engines: [{ id: 'beta', dir: 'services/beta' }] }));
  const result = await syncCMDB({ settings, manifest, observations: observations() });
  const entries = result.report.declared_only;
  assert.equal(entries.find(ci => ci.ci_key === 'engine:alpha').evidence.attrs.path, join(dir, 'primary', 'services', 'alpha'));
  assert.equal(entries.find(ci => ci.ci_key === 'engine:beta').evidence.attrs.path, join(dir, 'secondary', 'services', 'beta'));
  manifest.engines[0].dir = join(dir, 'absolute-service');
  assert.equal(projectDeclared(manifest, settings).cis.get('engine:alpha').attrs.path, manifest.engines[0].dir);
});
