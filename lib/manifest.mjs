// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { dirname, resolve } from 'node:path';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const port = value => Number.isInteger(value) && value > 0 && value <= 65535;
const taskKeys = ['task_name', 'taskName', 'task', 'name', 'id'];
const label = (value, index) => text(value?.name) || text(value?.id) || text(value) || `entry ${index + 1}`;

export function registryRoot(settings, source = 'manifest') {
  const config = settings.sources?.[source];
  const base = config?.path ? dirname(resolve(settings.dataDir || '.', config.path)) : settings.estateRoot || settings.dataDir || '.';
  return resolve(base, config?.root || '.');
}

// Normalize individual declarations without throwing away their healthy siblings.
export function normalizeManifest(document) {
  const skipped = [];
  const warn = (where, reason) => skipped.push(`warning: skipped ${where}: ${reason}`);
  const list = (value, where) => {
    if (value == null) return [];
    if (Array.isArray(value)) return value;
    warn(where, 'expected an array'); return [];
  };
  function taskNames(container, where) {
    const names = [];
    for (const key of ['tasks', 'jobs', 'schedules']) {
      if (container[key] == null) continue;
      const items = Array.isArray(container[key]) ? container[key] : [container[key]];
      for (const [index, item] of items.entries()) {
        const identityKey = object(item) ? taskKeys.find(key => Object.hasOwn(item, key)) : null;
        const name = text(identityKey ? item[identityKey] : item);
        if (!name || !name.replace(/^\\/, '').trim()) {
          warn(`${where}.${key} ${JSON.stringify(label(item, index))}`, 'expected a task name or an object with task_name, taskName, task, name or id');
          continue;
        }
        names.push(name);
      }
    }
    return [...new Set(names)];
  }
  const result = { engines: [], satellites: [], repos: [] };
  for (const section of Object.keys(result)) {
    for (const [index, entry] of list(document?.[section], section).entries()) {
      const where = `${section} ${JSON.stringify(label(entry, index))}`;
      if (!object(entry)) { warn(where, 'expected an object'); continue; }
      const invalid = ['id', 'dir', 'path', 'name', 'owner', 'businessOwner', 'note', 'url', 'class', 'role']
        .find(key => entry[key] != null && typeof entry[key] !== 'string');
      if (invalid) { warn(where, `${invalid} must be a string`); continue; }
      if (section === 'engines' && !text(entry.id)) { warn(where, 'missing id'); continue; }
      if (section === 'satellites' && !text(entry.id) && !text(entry.path)) { warn(where, 'missing id or path'); continue; }
      if (section === 'repos' && !text(entry.path)) { warn(where, 'missing path'); continue; }
      const item = { ...entry, servers: [], nodes: [] };
      if (entry.port != null && !port(entry.port)) { warn(`${where}.port`, 'expected a valid TCP port'); delete item.port; }
      for (const [i, server] of list(entry.servers, `${where}.servers`).entries()) {
        if (!object(server) || !port(server.port)) { warn(`${where}.servers ${JSON.stringify(label(server, i))}`, 'expected a valid TCP port'); continue; }
        item.servers.push(server);
      }
      for (const [i, node] of list(entry.nodes, `${where}.nodes`).entries()) {
        const nodeLabel = `${where}.nodes ${JSON.stringify(label(node, i))}`;
        if (!object(node)) { warn(nodeLabel, 'expected an object'); continue; }
        item.nodes.push({ ...node, tasks: taskNames(node, nodeLabel) });
      }
      const tasks = taskNames(entry, where);
      if (tasks.length) item.nodes.push({ name: null, desc: null, tasks });
      result[section].push(item);
    }
  }
  return { document: result, skipped };
}
