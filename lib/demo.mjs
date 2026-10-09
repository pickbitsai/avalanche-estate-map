// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import example from '../config.example.mjs';
import { resolveDataDir, settingsFor, STAMP } from './config.mjs';
import { syncCMDB } from './sync.mjs';
import { addManualRelationship, listCIs, openStore, ownCI } from './store.mjs';

const json = url => JSON.parse(readFileSync(url, 'utf8'));
const markerName = 'estate-demo.json';
const header = '// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.\n';
export async function seedDemo({ dataDir, reset = false, now = new Date() }) {
  dataDir = resolveDataDir({ dataDir, env: {} });
  mkdirSync(dataDir, { recursive: true });
  const markerPath = join(dataDir, markerName);
  const marker = existsSync(markerPath) ? json(markerPath) : null;
  if (marker && marker.kind !== 'avalanche-estate-map-demo') throw new Error('unrecognized demo marker');
  if (!marker && readdirSync(dataDir).some(name => name !== 'config.mjs')) throw new Error('demo requires an empty data directory or its own demo marker; private data will not be replaced');
  if (!marker && existsSync(join(dataDir, 'config.mjs'))) {
    const content = readFileSync(join(dataDir, 'config.mjs'), 'utf8');
    if (content !== readFileSync(new URL('../config.example.mjs', import.meta.url), 'utf8')) throw new Error('demo will not overwrite a customized config');
  }
  const config = structuredClone(example);
  config.actors.default = 'human:priya';
  config.sources.manifest.path = 'sources/estate.json';
  config.sources.products.path = 'sources/products.json';
  // Deliberately ignore all instance environment/config and live providers in demo mode.
  const settings = settingsFor(config, dataDir, { env: {} });
  if (marker && !reset) return settings;
  if (reset && marker) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(settings.db + suffix, { force: true });
    if (existsSync(settings.reportsDir)) for (const name of readdirSync(settings.reportsDir)) {
      if (/^drift-\d{4}-\d{2}-\d{2}\.json$/.test(name)) rmSync(join(settings.reportsDir, name));
    }
  }
  const manifest = json(new URL('../examples/estate.example.json', import.meta.url));
  const products = json(new URL('../examples/products.example.json', import.meta.url));
  mkdirSync(join(dataDir, 'sources'), { recursive: true });
  writeFileSync(join(dataDir, 'config.mjs'), `${header}export default ${JSON.stringify(config, null, 2)};\n`);
  writeFileSync(settings.sources.manifest.path, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(settings.sources.products.path, `${JSON.stringify(products, null, 2)}\n`);
  writeFileSync(markerPath, `${JSON.stringify({ kind: 'avalanche-estate-map-demo', stamp: STAMP,
    company: 'Juniper Trail Studio', location: 'Flagstaff, Arizona',
    founders: ['Priya Natarajan', 'Owen Castellanos'],
    actors: ['human:priya', 'human:owen', 'agent:scout', 'agent:builder', 'agent:scribe'] }, null, 2)}\n`);
  const at = days => new Date(now.getTime() - days * 86400000);
  for (const [index, days] of [62, 54, 46, 38, 30, 22, 14, 6, 0].entries()) {
    const current = structuredClone(manifest);
    if (days >= 46) current.satellites.push({ id: 'preview-room', name: 'Preview Room', owner: 'human:owen', dir: 'sites/preview-room', note: 'Retired after the editorial launch' });
    const ports = current.engines.map(engine => engine.servers[0].port).filter(port => days !== 0 || port !== 4306);
    ports.push(4320);
    if (days === 0) ports.push(4399);
    const tasks = new Map(current.engines.filter(engine => days !== 0 || engine.id !== 'pine-post').map(engine => {
      const name = engine.nodes[0].tasks[0]; return [name, { name, status: 'Ready', nextRun: 'Daily' }];
    }));
    await syncCMDB({ settings, manifest: current, products, apply: true,
      actor: ['agent:scout','agent:builder','agent:scribe'][index % 3], now: at(days),
      observations: { ports: { complete: true, listeners: ports, note: 'DEMO: recorded listener evidence' }, tasks: { complete: true, tasks, note: 'DEMO: recorded scheduler evidence' } },
    });
    const db = openStore(settings.db, { classes: settings.classes });
    try {
      if (index === 0) {
        for (const [n, ci] of listCIs(db).entries()) ownCI(db, ci.ci_key, {
          owner: n % 2 ? 'human:owen' : 'human:priya', business: 'human:priya',
          note: n % 2 ? 'Owen Castellanos maintains the service and its runbook.' : 'Priya Natarajan owns the release and operating checklist.',
          actor: n % 2 ? 'human:owen' : 'human:priya', now: at(days),
        });
        for (const product of products.products) addManualRelationship(db, `product:${product.slug}`, `engine:${product.slug}`, 'depends_on', { actor: 'agent:builder', allowedTypes: settings.relationshipTypes, now: at(days) });
        addManualRelationship(db, 'engine:pine-post', 'engine:cedar-vault', 'feeds', { actor: 'agent:scribe', allowedTypes: settings.relationshipTypes, now: at(days) });
      }
      if (days === 14) ownCI(db, 'engine:cedar-vault', { owner: 'human:owen', business: 'human:priya', note: 'Owen takes archive maintenance; Priya keeps publication responsibility.', actor: 'human:priya', now: at(days) });
    } finally { db.close(); }
  }
  return settings;
}
