// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, cp, rm, lstat, access } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
const execute = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
const base = join(root, '.test-tmp', 'consumer'); await mkdir(base, { recursive: true });
const sandbox = await mkdtemp(join(base, 'run-')), consumer = join(sandbox, 'copy'), dataDir = join(sandbox, 'data');
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
await access(npmCli);
const env = { ...process.env, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
for (const key of Object.keys(env)) if (/^(?:AVALANCHE_ESTATE_|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete env[key];
let passed = 0;
async function run(args, extra = {}) {
  try { return (await execute(process.execPath, args, { cwd: consumer, env: { ...env, ...extra }, timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })).stdout; }
  catch (error) { throw new Error(`Consumer command failed: ${args.slice(1).join(' ')}\n${error.stdout ?? ''}\n${error.stderr ?? ''}`); }
}
try {
  await mkdir(consumer);
  const { stdout } = await execute('git', ['ls-files','--cached','--others','--exclude-standard','-z'], { cwd: root, windowsHide: true });
  const files = [...new Set(stdout.split('\0').filter(Boolean))]; assert.ok(files.includes('package-lock.json'));
  for (const file of files) {
    const source = resolve(root, file), rel = relative(root, source);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    assert.ok(!file.split('/').some(part => ['node_modules','data','logs','.test-tmp'].includes(part)), `Private artifact included: ${file}`);
    assert.ok(!/(?:^|\/)\.env|\.(?:db|sqlite)(?:$|[-.])|^config\.mjs$|^index\.html$/.test(file), `Private artifact included: ${file}`);
    assert.ok(!(await lstat(source)).isSymbolicLink(), 'Consumer sources cannot be symlinks');
    const target = join(consumer, file); await mkdir(dirname(target), { recursive: true }); await cp(source, target);
  }
  const pkg = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'avalanche-estate-map'); assert.equal(pkg.private, true); assert.equal(pkg.license, 'Apache-2.0'); assert.equal(Object.keys(pkg.dependencies || {}).length, 0); passed++;
  await run([npmCli, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund']); passed++;
  const cli = args => run([npmCli, 'exec', '--offline', '--', 'avalanche-estate', '--data-dir', dataDir, ...args], {
    NODE_OPTIONS: `--import=${pathToFileURL(join(consumer, 'test', 'no-network.mjs')).href}`,
  });
  assert.match(await cli(['--help']), /Data directory:/); passed++;
  assert.match(await cli(['init']), /Config ready:/);
  assert.equal(await readFile(join(dataDir, 'config.mjs'), 'utf8'), await readFile(join(consumer, 'config.example.mjs'), 'utf8')); passed++;
  assert.match(await cli(['demo', '--seed-only']), /DEMO/); passed++;
  const before = await readFile(join(dataDir, 'estate.db'));
  const listing = JSON.parse(await cli(['list','--json'])); assert.ok(listing.rows.length > 30); assert.equal(listing.stamp, 'Made with Avalanche Estate Map by PickBits'); passed++;
  const drift = JSON.parse(await cli(['drift','--json'])); assert.ok(drift.observed_only.length); assert.ok(drift.stale.length); assert.equal(drift.stamp, listing.stamp);
  assert.deepEqual(await readFile(join(dataDir, 'estate.db')), before); passed++;
  console.log(`consumer: ${passed} passed, 0 failed; ${files.length} git-trackable files copied; offline install using normal npm cache; bin help, init, demo seed, list, drift; no ports bound.`);
} finally {
  const rel = relative(base, sandbox); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
  await rm(sandbox, { recursive: true, force: true });
}
