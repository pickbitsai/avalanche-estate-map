// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { existsSync, mkdirSync, realpathSync, copyFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import example from '../config.example.mjs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const STAMP = 'Made with Avalanche Estate Map by PickBits';
export const PREFIX = 'AVALANCHE_ESTATE_';
export function within(parent, child) {
  const rel = relative(parent, child);
  return !rel || (!rel.startsWith('..') && !isAbsolute(rel));
}
function canonical(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(canonical(parent), relative(parent, path));
}
export function resolveDataDir({ dataDir, env = process.env, platform = process.platform,
  home = os.homedir(), root = ROOT } = {}) {
  const fallback = platform === 'win32'
    ? join(parse(home).root, 'new', 'avalanche-data', 'estate-map')
    : join(home, '.local', 'share', 'avalanche', 'estate-map');
  const result = canonical(resolve(dataDir || env[`${PREFIX}DATA_DIR`] || fallback));
  const repo = canonical(resolve(root));
  if (within(repo, result) && !within(join(repo, '.test-tmp'), result)) {
    throw new Error('data directory must be outside the repository (only .test-tmp is allowed for tests/demo)');
  }
  return result;
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function validateConfig(config) {
  const fail = message => { throw new Error(`Invalid config: ${message}`); };
  if (!object(config)) fail('expected an object');
  for (const key of ['name', 'estateRoot', 'db']) if (!nonempty(config[key])) fail(`${key} must be a non-empty string`);
  if (!Number.isFinite(config.staleDays) || config.staleDays < 0) fail('staleDays must be a non-negative number');
  if (!object(config.actors) || (config.actors.default !== null && !nonempty(config.actors.default))) fail('actors.default must be null or a non-empty string');
  if (!object(config.desk) || config.desk.host !== '127.0.0.1') fail('desk.host must be 127.0.0.1');
  if (!Number.isInteger(config.desk.port) || config.desk.port < 1 || config.desk.port > 65535) fail('desk.port must be an integer from 1 to 65535');
  if (!nonempty(config.desk.title)) fail('desk.title must be a non-empty string');
  if (!Array.isArray(config.classes) || !config.classes.length) fail('classes must be a non-empty array');
  const names = new Set();
  for (const item of config.classes) {
    if (!object(item) || !nonempty(item.name) || !nonempty(item.label) || typeof item.description !== 'string') fail('classes require name, label and description');
    if (names.has(item.name)) fail(`duplicate class ${item.name}`);
    names.add(item.name);
    if (item.observedBy !== undefined && !['none', 'ports', 'tasks'].includes(item.observedBy)) fail(`classes.${item.name}.observedBy must be none, ports or tasks`);
    if (!Array.isArray(config.identificationRules?.[item.name]) || !config.identificationRules[item.name].length || !config.identificationRules[item.name].every(nonempty)) fail(`identificationRules.${item.name} must list identifying attributes`);
  }
  for (const name of ['engine','satellite','server_endpoint','scheduled_task','data_store','repo','product']) if (!names.has(name)) fail(`classes must include ${name}`);
  if (!Array.isArray(config.relationshipTypes) || !config.relationshipTypes.length || !config.relationshipTypes.every(nonempty)) fail('relationshipTypes must be a non-empty string array');
  for (const type of ['runs', 'scheduled_by']) if (!config.relationshipTypes.includes(type)) fail(`relationshipTypes must include ${type}`);
  if (!object(config.sources)) fail('sources must be an object');
  for (const name of ['manifest', 'estate', 'products']) {
    const source = config.sources[name];
    if (source != null && (!object(source) || (source.path != null && !nonempty(source.path)))) fail(`sources.${name}.path must be a non-empty string or null`);
  }
  for (const name of ['manifest', 'estate']) if (config.sources[name]?.root != null && !nonempty(config.sources[name].root)) fail(`sources.${name}.root must be a non-empty string or null`);
  const portCheck = config.sources.portCheck;
  if (portCheck != null && !object(portCheck)) fail('sources.portCheck must be an object or null');
  const command = portCheck?.command;
  if (command != null && (!object(command) || !Array.isArray(command.argv) || !command.argv.length || !command.argv.every(nonempty) || (command.cwd != null && !nonempty(command.cwd)))) fail('sources.portCheck.command requires argv (non-empty strings) and optional cwd');
  if (command?.timeoutMs != null && (!Number.isInteger(command.timeoutMs) || command.timeoutMs < 1 || command.timeoutMs > 300000)) fail('sources.portCheck.command.timeoutMs must be an integer from 1 to 300000');
  if (!object(config.sources.scheduler) || !['none','windows-task-scheduler'].includes(config.sources.scheduler.provider)) fail('sources.scheduler.provider must be none or windows-task-scheduler');
  return config;
}
export function settingsFor(config, dataDir, { env = process.env } = {}) {
  const copy = structuredClone(config);
  if (env[`${PREFIX}DESK_PORT`] !== undefined) copy.desk.port = Number(env[`${PREFIX}DESK_PORT`]);
  validateConfig(copy);
  const db = canonical(resolve(dataDir, copy.db));
  if (isAbsolute(copy.db) || !within(dataDir, db) || db === dataDir) throw new Error('Invalid config: db must be a relative file within the data directory');
  for (const name of ['manifest','estate','products']) if (copy.sources[name]?.path) copy.sources[name].path = resolve(dataDir, copy.sources[name].path);
  for (const name of ['manifest','estate']) if (copy.sources[name]?.path) copy.sources[name].root = resolve(dirname(copy.sources[name].path), copy.sources[name].root || '.');
  if (copy.sources.portCheck?.command) copy.sources.portCheck.command.cwd = resolve(dataDir, copy.sources.portCheck.command.cwd || '.');
  return { ...copy, db, dataDir, estateRoot: resolve(dataDir, copy.estateRoot), reportsDir: join(dataDir, 'reports') };
}
export async function loadConfig({ dataDir, env = process.env, notice = console.error } = {}) {
  dataDir = resolveDataDir({ dataDir, env });
  const configPath = resolve(env[`${PREFIX}CONFIG`] || join(dataDir, 'config.mjs'));
  let config = example;
  if (existsSync(configPath)) config = (await import(`${pathToFileURL(configPath).href}?load=${Date.now()}`)).default;
  else notice(`No config at ${configPath}; using config.example.mjs defaults (optional sources disabled).`);
  return { ...settingsFor(config, dataDir, { env }), configPath };
}
export function initConfig(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const target = join(dataDir, 'config.mjs');
  if (!existsSync(target)) copyFileSync(join(ROOT, 'config.example.mjs'), target);
  return target;
}
export function resolveActor({ actor, env = process.env, config = {}, username = os.userInfo().username } = {}) {
  return actor?.trim() || env[`${PREFIX}USER`]?.trim() || config.actors?.default?.trim() || `human:${username}`;
}
