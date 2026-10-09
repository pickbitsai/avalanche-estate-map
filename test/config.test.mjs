// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, parse, resolve } from 'node:path';
import os from 'node:os';
import example from '../config.example.mjs';
import { ROOT, initConfig, loadConfig, resolveActor, resolveDataDir, settingsFor, validateConfig } from '../lib/config.mjs';
import { fixture } from './helpers.mjs';

test('data directory precedence is flag > environment > platform default and rejects repository data', t => {
  const { dir } = fixture(t);
  const env = { AVALANCHE_ESTATE_DATA_DIR: join(dir, 'environment') };
  assert.equal(resolveDataDir({ dataDir: join(dir, 'flag'), env }), join(dir, 'flag'));
  assert.equal(resolveDataDir({ env }), env.AVALANCHE_ESTATE_DATA_DIR);
  const home = os.homedir();
  assert.equal(resolveDataDir({ env: {}, platform: 'win32', home }), join(parse(home).root, 'new', 'avalanche-data', 'estate-map'));
  assert.equal(resolveDataDir({ env: {}, platform: 'linux', home }), join(home, '.local', 'share', 'avalanche', 'estate-map'));
  for (const path of [ROOT, join(ROOT, 'data'), join(ROOT, 'logs'), join(ROOT, '.test-tmp', '..', 'private')]) assert.throws(() => resolveDataDir({ dataDir: path }), /outside the repository/);
  assert.equal(resolveDataDir({ dataDir: dir }), dir);
});
test('config fallback, init, override, relative sources and port override are isolated', async t => {
  const { dir: parentDir } = fixture(t); const notices = [];
  const dir = join(parentDir, 'data');
  assert.equal(existsSync(dir), false);
  const fallback = await loadConfig({ dataDir: dir, env: {}, notice: line => notices.push(line) });
  assert.equal(fallback.db, join(dir, 'estate.db')); assert.equal(notices.length, 1);
  assert.match(notices[0], /optional sources disabled/);
  assert.equal(existsSync(dir), false);
  const configPath = initConfig(dir);
  assert.equal(readFileSync(configPath, 'utf8'), readFileSync(join(ROOT, 'config.example.mjs'), 'utf8'));
  const custom = structuredClone(example); custom.sources.estate.path = 'sources/estate.json';
  custom.sources.portCheck.command = { argv: ['node', 'ports.mjs'], cwd: 'tools' };
  const alternate = join(dir, 'alternate.mjs'); writeFileSync(alternate, `export default ${JSON.stringify(custom)}`);
  const settings = await loadConfig({ dataDir: dir, env: { AVALANCHE_ESTATE_CONFIG: alternate, AVALANCHE_ESTATE_DESK_PORT: '4180' } });
  assert.equal(settings.sources.estate.path, join(dir, 'sources', 'estate.json'));
  assert.equal(settings.sources.portCheck.command.cwd, join(dir, 'tools'));
  assert.equal(settings.configPath, alternate); assert.equal(settings.desk.port, 4180);
  assert.ok(existsSync(dir));
  assert.throws(() => settingsFor(example, dir, { env: { AVALANCHE_ESTATE_DESK_PORT: 'wrong' } }), /desk.port/);
});
const invalid = [
  ['name', c => c.name = '', /name/], ['staleDays', c => c.staleDays = -1, /staleDays/],
  ['actor', c => c.actors.default = 42, /actors.default/], ['host', c => c.desk.host = '0.0.0.0', /desk.host/],
  ['port', c => c.desk.port = 0, /desk.port/], ['fractional port', c => c.desk.port = 4180.5, /desk.port/],
  ['title', c => c.desk.title = '', /desk.title/], ['classes', c => c.classes = [], /classes/],
  ['class identity', c => c.classes.push(c.classes[0]), /duplicate class/],
  ['class description', c => delete c.classes[0].description, /description/],
  ['observer', c => c.classes[0].observedBy = 'unknown', /observedBy/],
  ['identity', c => c.identificationRules.engine = [], /identificationRules.engine/],
  ['relationships', c => c.relationshipTypes = [], /relationshipTypes/],
  ['source', c => c.sources = null, /sources/],
  ['manifest path', c => c.sources.manifest.path = 42, /sources.manifest.path/],
  ['estate path', c => c.sources.estate.path = [], /sources.estate.path/],
  ['products path', c => c.sources.products.path = {}, /sources.products.path/],
  ['command argv', c => c.sources.portCheck.command = { argv: [] }, /portCheck.command/],
  ['command cwd', c => c.sources.portCheck.command = { argv: ['node'], cwd: 4 }, /portCheck.command/],
  ['scheduler', c => c.sources.scheduler.provider = 'unknown', /scheduler.provider/],
];
for (const [label, mutate, error] of invalid) test(`config rejects invalid ${label} clearly`, () => {
  const config = structuredClone(example); mutate(config); assert.throws(() => validateConfig(config), error);
});
test('database paths cannot escape the data directory', t => {
  const { dir } = fixture(t);
  for (const path of ['../outside.db', resolve(dir, 'absolute.db'), '.']) assert.throws(() => settingsFor({ ...example, db: path }, dir, { env: {} }), /db must be a relative file/);
});
test('actor precedence is explicit flag, environment, config, operating-system username', () => {
  const config = { actors: { default: 'agent:scribe' } }, env = { AVALANCHE_ESTATE_USER: 'agent:scout' };
  assert.equal(resolveActor({ actor: 'human:priya', env, config, username: 'local-user' }), 'human:priya');
  assert.equal(resolveActor({ env, config, username: 'local-user' }), 'agent:scout');
  assert.equal(resolveActor({ env: {}, config, username: 'local-user' }), 'agent:scribe');
  assert.equal(resolveActor({ env: {}, config: {}, username: 'local-user' }), 'human:local-user');
});
