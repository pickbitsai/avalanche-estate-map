// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedDemo } from '../lib/demo.mjs';
import { STAMP, ROOT } from '../lib/config.mjs';
import { listCIs, openStore } from '../lib/store.mjs';
import { readLatestReport } from '../lib/sync.mjs';
import { fixture } from './helpers.mjs';

test('demo isolates data, covers every class, two months, five actors and drift story; reuse/reset is explicit', async t => {
  const { dir } = fixture(t); const now = new Date('2026-10-09T12:00:00Z');
  const settings = await seedDemo({ dataDir: dir, now });
  assert.ok(settings.db.startsWith(dir)); assert.equal(settings.sources.scheduler.provider, 'none');
  assert.equal(settings.sources.portCheck.command, null); assert.equal(settings.desk.port, 4180);
  assert.ok(!existsSync(join(ROOT, 'estate.db')));
  let db = openStore(settings.db, { readOnly: true });
  const rows = listCIs(db); const count = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  for (const klass of settings.classes) assert.ok(rows.some(ci => ci.class === klass.name));
  assert.equal(rows.filter(ci => ci.class === 'product').length, 8);
  assert.deepEqual(db.prepare('SELECT DISTINCT actor FROM events ORDER BY actor').all().map(row => row.actor), ['agent:builder','agent:scout','agent:scribe','human:owen','human:priya']);
  const span = db.prepare('SELECT MIN(at) AS first, MAX(at) AS last FROM events').get();
  assert.ok(Date.parse(span.last) - Date.parse(span.first) >= 60 * 86400000); db.close();
  const report = readLatestReport(settings.reportsDir);
  assert.equal(report.stamp, STAMP); assert.ok(report.declared_only.length); assert.ok(report.observed_only.length); assert.ok(report.stale.length);
  assert.equal(readdirSync(settings.reportsDir).length, 9);
  const marker = JSON.parse(readFileSync(join(dir, 'estate-demo.json'), 'utf8'));
  assert.deepEqual(marker.founders, ['Priya Natarajan','Owen Castellanos']);
  await seedDemo({ dataDir: dir, now });
  db = openStore(settings.db, { readOnly: true }); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, count); db.close();
  await seedDemo({ dataDir: dir, reset: true, now });
  db = openStore(settings.db, { readOnly: true }); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, count); db.close();
});
test('demo refuses existing private data or customized config even with reset', async t => {
  const { dir } = fixture(t); writeFileSync(join(dir, 'config.mjs'), 'export default { private: true };');
  await assert.rejects(seedDemo({ dataDir: dir, reset: true }), /customized config/);
  writeFileSync(join(dir, 'private.txt'), 'Keep this record');
  await assert.rejects(seedDemo({ dataDir: dir, reset: true }), /private data will not be replaced/);
  assert.equal(readFileSync(join(dir, 'private.txt'), 'utf8'), 'Keep this record');
});
