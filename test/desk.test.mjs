// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { createDeskHandler, MAX_BODY } from '../lib/desk.mjs';
import { openStore } from '../lib/store.mjs';
import { syncCMDB } from '../lib/sync.mjs';
import { fixture, observations } from './helpers.mjs';

async function setup(t) {
  let db; t.after(() => db?.close());
  const { settings, manifest } = fixture(t);
  await syncCMDB({ settings, manifest, observations: observations(), apply: true, actor: 'test:setup' });
  db = openStore(settings.db);
  const token = 'unit-test-process-token';
  const handler = createDeskHandler({ settings, db, actor: 'human:desk-test', demo: true, token });
  const request = async ({ path = '/', method = 'GET', headers = {}, body = '', remote = '127.0.0.1' } = {}) => {
    const req = Readable.from(Array.isArray(body) ? body : [Buffer.from(body)]);
    Object.assign(req, { url: path, method, socket: { remoteAddress: remote }, headers: { host: '127.0.0.1:4180', ...headers } });
    const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    await handler(req, response); return response;
  };
  const post = (path, input, headers = {}) => request({ path, method: 'POST', headers: {
    origin: 'http://127.0.0.1:4180', 'x-estate-token': token, 'content-type': 'application/json', ...headers,
  }, body: JSON.stringify(input) });
  return { request, post, token };
}
test('desk ownership and links call shared functions, audit actor, and return traversal without binding', async t => {
  const { post, request } = await setup(t);
  const owned = await post('/api/own', { ci_key: 'engine:alpha', owner: 'human:priya', business: 'human:owen', note: 'Via desk' });
  assert.equal(owned.status, 200); assert.equal(JSON.parse(owned.body).owned_by, 'human:priya');
  assert.equal((await post('/api/link', { from_key: 'engine:alpha', to_key: 'engine:beta', type: 'depends_on' })).status, 200);
  const detail = JSON.parse((await request({ path: '/api/ci?key=engine%3Aalpha' })).body);
  assert.equal(detail.related.depth, 3);
  assert.ok(detail.relationships.outgoing.some(row => row.origin === 'manual'));
  assert.equal(detail.events.at(-1).actor, 'human:desk-test');
  assert.ok(detail.related.nodes.some(row => row.direction === 'incoming'));
  assert.ok(detail.related.nodes.some(row => row.direction === 'outgoing'));
});
test('desk requires exact Host, token AND same-origin Origin on every POST', async t => {
  const { request, post } = await setup(t);
  for (const host of ['example.com:4180', '127.0.0.1', 'localhost:4181', '', '127.0.0.1:4180.example.com']) assert.equal((await request({ headers: { host } })).status, 403);
  assert.equal((await request({ headers: { host: 'localhost:4180' } })).status, 200);
  assert.equal((await request({ remote: '192.0.2.1' })).status, 403);
  for (const path of ['/api/own', '/api/link', '/api/sync']) {
    for (const headers of [{ origin: undefined }, { origin: 'null' }, { origin: 'https://example.com' }, { origin: 'http://localhost:4180' }, { 'x-estate-token': '' }, { 'x-estate-token': 'wrong' }]) assert.equal((await post(path, {}, headers)).status, 403);
  }
  assert.equal((await post('/api/own', {}, { host: 'localhost:4180', origin: 'http://localhost:4180' })).status, 400);
  assert.equal((await post('/api/sync', {})).status, 404);
});
test('desk sends strict security headers and local static assets without inline executable code', async t => {
  const { request } = await setup(t);
  for (const path of ['/', '/desk.js', '/desk.css', '/api/data', '/api/health', '/missing']) {
    const response = await request({ path });
    assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(response.headers['X-Frame-Options'], 'DENY');
    assert.equal(response.headers['Referrer-Policy'], 'same-origin');
    assert.match(response.headers['Content-Security-Policy'], /default-src 'self'/);
    assert.doesNotMatch(response.headers['Content-Security-Policy'], /unsafe-inline/);
  }
  const page = (await request()).body;
  assert.match(page, /DEMO/); assert.match(page, /Made with Avalanche Estate Map by PickBits/);
  assert.doesNotMatch(page, /<script(?! src=)|\bon(?:click|submit)=/);
  const script = readFileSync(new URL('../static/desk.js', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /\bon(?:click|submit)=['"]/);
  assert.match(script, /Related \(/);
});
test('desk caps bytes at one MiB and handles invalid JSON or content type', async t => {
  const { request, token, post } = await setup(t);
  const headers = { origin: 'http://127.0.0.1:4180', 'x-estate-token': token, 'content-type': 'application/json' };
  for (const body of ['x'.repeat(MAX_BODY + 1), 'é'.repeat(MAX_BODY / 2 + 1), [Buffer.alloc(MAX_BODY), Buffer.from('x')]]) assert.equal((await request({ path: '/api/own', method: 'POST', headers, body })).status, 413);
  assert.equal((await request({ path: '/api/own', method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await post('/api/own', {}, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await request({ path: '/api/own', method: 'POST', headers: { ...headers, 'content-length': String(MAX_BODY + 1) } })).status, 413);
});
