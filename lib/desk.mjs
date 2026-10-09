// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { addManualRelationship, getCIDetails, listCIs, listClasses, openStore, ownCI } from './store.mjs';
import { readLatestReport } from './sync.mjs';
import { DEFAULT_TREE_DEPTH, traverseCITree } from './tree.mjs';
import { STAMP } from './config.mjs';

export const MAX_BODY = 1024 * 1024;
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};
const assets = new Map([
  ['/desk.js', ['text/javascript; charset=utf-8', readFileSync(new URL('../static/desk.js', import.meta.url), 'utf8')]],
  ['/desk.css', ['text/css; charset=utf-8', readFileSync(new URL('../static/desk.css', import.meta.url), 'utf8')]],
]);
const PAGE = readFileSync(new URL('../static/desk.html', import.meta.url), 'utf8');
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const problem = (status, message) => Object.assign(new Error(message), { status });
export async function readJson(req) {
  if (Number(req.headers['content-length']) > MAX_BODY) throw problem(413, 'request body exceeds 1 MB');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk); bytes += buffer.length;
    if (bytes > MAX_BODY) throw problem(413, 'request body exceeds 1 MB');
    chunks.push(buffer);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw problem(400, 'expected a JSON object'); }
}
export function createDeskHandler({ settings, db, actor, demo = false, token = randomBytes(32).toString('hex') }) {
  const hosts = new Set([`127.0.0.1:${settings.desk.port}`, `localhost:${settings.desk.port}`]);
  const send = (res, status, value) => {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  return async (req, res) => {
    try {
      if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !hosts.has(req.headers.host)) return send(res, 403, { error: 'invalid local Host' });
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return send(res, 403, { error: 'invalid request origin' });
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(PAGE.replaceAll('__TITLE__', esc(settings.desk.title)).replace('__TOKEN__', token)
          .replace('__DEMO__', demo ? '<div class="notice">DEMO — Juniper Trail Studio. All people, businesses and data are synthetic.</div>' : ''));
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [type, body] = assets.get(url.pathname);
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type }); return res.end(body);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, engine: 'avalanche-estate-map', port: settings.desk.port, stamp: STAMP });
      if (req.method === 'GET' && url.pathname === '/api/data') return send(res, 200, {
        cis: listCIs(db), classes: listClasses(db), relationshipTypes: settings.relationshipTypes,
        drift: readLatestReport(settings.reportsDir), syncAvailable: false, stamp: STAMP,
      });
      if (req.method === 'GET' && url.pathname === '/api/ci') {
        const key = url.searchParams.get('key');
        return send(res, 200, { ...getCIDetails(db, key), related: traverseCITree(db, key, { depth: DEFAULT_TREE_DEPTH }) });
      }
      if (req.method === 'POST') {
        const supplied = Buffer.from(String(req.headers['x-estate-token'] || ''));
        const expected = Buffer.from(token);
        if (req.headers.origin !== origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(res, 403, { error: 'same-origin Origin and current process token required' });
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'application/json required' });
        const input = await readJson(req);
        if (url.pathname === '/api/own') return send(res, 200, ownCI(db, input.ci_key, { owner: input.owner, business: input.business, note: input.note, actor }));
        if (url.pathname === '/api/link') return send(res, 200, addManualRelationship(db, input.from_key, input.to_key, input.type, { actor, allowedTypes: settings.relationshipTypes }));
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      const status = error.status || (/required|must be one of|no CI|relationship type/.test(error.message) ? 400 : 500);
      return send(res, status, { error: status === 500 ? 'desk operation failed' : error.message });
    }
  };
}
export async function startDesk({ settings, actor, demo = false }) {
  const db = openStore(settings.db, { classes: settings.classes });
  const server = createServer(createDeskHandler({ settings, db, actor, demo }));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(settings.desk.port, '127.0.0.1', resolve);
    });
  } catch (error) { db.close(); throw error; }
  console.log(`${demo ? '*** DEMO: JUNIPER TRAIL STUDIO ***\n' : ''}${settings.name} desk: http://127.0.0.1:${settings.desk.port}/\nData directory: ${settings.dataDir}\n${STAMP}`);
  let closed = false;
  const stop = () => {
    if (closed) return; closed = true;
    server.close(() => { db.close(); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); });
    server.closeAllConnections();
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return { server, stop };
}
