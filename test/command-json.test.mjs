// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastJSONValue, listenerPorts } from '../lib/command-json.mjs';
import { collectObserved, projectDeclared } from '../lib/sync.mjs';
import { fixture } from './helpers.mjs';

test('port stdout accepts human lines around pretty JSON, escaped braces and a trailing summary', () => {
  const stdout = 'Checking listeners...\n' + JSON.stringify({ note: 'a "quoted" brace } and [ bracket', listening: [4300, 4320, 4300] }, null, 2) + '\nSummary: 2 listeners\n';
  assert.deepEqual(listenerPorts(stdout), [4300, 4320]);
});
test('port stdout uses the last complete JSON value across streams and accepts port arrays', () => {
  assert.deepEqual(listenerPorts('starting\n{"listening":[4300]}\n{"listening":[4301]}\nfinished'), [4301]);
  assert.deepEqual(listenerPorts('[4300, 4301]\nSummary: done'), [4300, 4301]);
  assert.deepEqual(listenerPorts('[{"listening":[4300]},{"listening":[4302]}]'), [4302]);
  assert.deepEqual(listenerPorts('unclosed [log\n{"listening":[4300]}\nSummary'), [4300]);
  assert.deepEqual(listenerPorts('{"listening":[4300]}\n{"incomplete":'), [4300]);
  assert.deepEqual(lastJSONValue('begin\nnull\nend'), null);
});
test('invalid or incomplete stdout never becomes a successful empty listener set', () => {
  for (const stdout of ['', 'No results', '{"listening":[4300]', '{"listening":[4300,"bad"]}', '{"listening":null}', '{"ok":false}', 'null']) assert.throws(() => listenerPorts(stdout), /no stdout|no complete JSON|integer TCP ports/);
  assert.deepEqual(listenerPorts('{"listening":[]}'), []);
});
test('port source parses noisy output, passes bounded timeout and explains parsing or process failure', async t => {
  const { settings, manifest, dir } = fixture(t);
  settings.sources.portCheck = { command: { argv: ['node', 'ports.mjs'], cwd: dir, timeoutMs: 60000 } };
  const declared = projectDeclared(manifest, settings);
  const collected = await collectObserved({ settings, declared, run: async (argv, options) => {
    assert.deepEqual(argv, ['node', 'ports.mjs']); assert.equal(options.cwd, dir); assert.equal(options.timeoutMs, 60000);
    return { code: 1, stdout: 'Checking...\n{"listening":[4300]}\nSummary: allocation drift' };
  } });
  assert.equal(collected.ports.complete, true); assert.deepEqual(collected.ports.listeners, [4300]);
  for (const result of [{ code: 0, stdout: 'incomplete {' }, { code: null, signal: 'SIGTERM', stdout: '{"listening":[4300]}' }]) {
    const failed = await collectObserved({ settings, declared, run: async () => result });
    assert.equal(failed.ports.complete, false); assert.deepEqual(failed.ports.listeners, []);
    assert.match(failed.ports.note, /^port check unavailable: .+/);
  }
});
