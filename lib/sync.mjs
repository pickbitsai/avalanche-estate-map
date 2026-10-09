// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// Declared-vs-observed projection and reconciliation. Authored registries remain truth: this
// module reads them, projects typed CIs, and never writes them back or deletes a CI.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { STAMP } from "./config.mjs";
import { readScheduledTasks, taskIdentity } from "./scheduler.mjs";
import { ciKey, identifiedCI } from "./identification.mjs";
import {
  CI_STATUSES,
  hydrateCI,
  listCIs,
  openStore,
  recordEvent,
  withTransaction,
} from "./store.mjs";

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    const item = value[key];
    return item === undefined ? [] : [[key, cleanObject(item)]];
  }));
}

export function stableJson(value) {
  return JSON.stringify(cleanObject(value));
}

function putCI(map, ci) {
  if (!map.has(ci.ci_key)) map.set(ci.ci_key, ci);
  return map.get(ci.ci_key);
}

function putRelationship(map, relationship) {
  const key = [relationship.from_key, relationship.to_key, relationship.type].join("\u0000");
  if (!map.has(key)) map.set(key, { ...relationship, origin: "declared" });
}

function localPort(value) {
  if (validPort(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
      && validPort(Number(url.port)) ? Number(url.port) : null;
  } catch { return null; }
}
const validPort = port => Number.isInteger(port) && port > 0 && port <= 65535;

function endpointFor(port, owner, server, settings) {
  return identifiedCI({
    class: "server_endpoint",
    name: server?.what ? `:${port} ${server.what}` : `:${port} ${owner.name || owner.id}`,
    attrs: {
      port,
      host: settings.desk.host,
      manifest_id: owner.id,
      owner_class: owner.kind,
      owner_dir: owner.dir || null,
      what: server?.what || null,
      start: server?.start || null,
    },
  }, settings);
}

const cleanText = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const cleanStringList = (value) => Array.isArray(value)
  ? value.flatMap((item) => cleanText(item) ? [cleanText(item)] : []) : [];

export function projectProducts(registry, settings) {
  const cis = new Map();
  const skipped = [];
  if (registry == null) return { cis, skipped };
  if (!registry || typeof registry !== "object" || Array.isArray(registry)
      || !Array.isArray(registry.products)) {
    skipped.push("products source without products list");
    return { cis, skipped };
  }
  for (const [index, product] of registry.products.entries()) {
    if (!product || typeof product !== "object" || Array.isArray(product)) {
      skipped.push(`product ${index + 1} is not an object`);
      continue;
    }
    const slug = cleanText(product.slug);
    const name = cleanText(product.name);
    if (!slug || !name) {
      skipped.push(`product ${index + 1} without slug or name`);
      continue;
    }
    const ci = identifiedCI({
      class: "product",
      name,
      attrs: {
        slug,
        name,
        genre: cleanText(product.genre),
        playUrl: cleanText(product.playUrl),
        platforms: cleanStringList(product.platforms),
        tags: cleanStringList(product.tags),
        featured: product.featured === true,
        connected: product.connected === true,
        telemetry: cleanStringList(product.telemetry),
        openSource: product.openSource === true,
      },
    }, settings);
    if (cis.has(ci.ci_key)) {
      skipped.push(`duplicate product slug "${slug}"`);
      continue;
    }
    cis.set(ci.ci_key, ci);
  }
  return { cis, skipped };
}

export function projectDeclared(manifest, settings, productRegistry = null) {
  const cis = new Map();
  const relationships = new Map();
  const skipped = [];

  for (const engine of manifest?.engines || []) {
    if (!String(engine?.id || "").trim()) { skipped.push("engine without id"); continue; }
    const engineCI = identifiedCI({
      class: "engine",
      name: engine.name || engine.id,
      attrs: {
        manifest_id: engine.id,
        owner: engine.owner || null,
        business_owner: engine.businessOwner || null,
        note: engine.note || null,
        url: engine.url || null,
        dir: engine.dir || engine.id,
        path: join(settings.estateRoot, engine.dir || engine.id),
        manifest_class: engine.class || null,
        role: engine.role || null,
        has_own_dashboard: Boolean(engine.hasOwnDashboard),
      },
    }, settings);
    putCI(cis, engineCI);

    for (const server of engine.servers || []) {
      if (!validPort(server?.port)) continue;
      const endpoint = endpointFor(server.port, { ...engine, kind: "engine" }, server, settings);
      putCI(cis, endpoint);
      putRelationship(relationships, {
        from_key: engineCI.ci_key, to_key: endpoint.ci_key, type: "runs",
      });
    }

    for (const node of engine.nodes || []) {
      for (const taskName of node.tasks || []) {
        if (!String(taskName || "").trim()) continue;
        const task = identifiedCI({
          class: "scheduled_task",
          name: taskIdentity(taskName),
          attrs: {
            task_name: taskIdentity(taskName),
            manifest_id: engine.id,
            engine_dir: engine.dir || engine.id,
            node_name: node.name || null,
            node_description: node.desc || null,
          },
        }, settings);
        putCI(cis, task);
        putRelationship(relationships, {
          from_key: task.ci_key, to_key: engineCI.ci_key, type: "scheduled_by",
        });
      }
    }
  }

  for (const satellite of manifest?.satellites || []) {
    if (!String(satellite?.id || "").trim()) {
      if (String(satellite?.path || "").trim()) {
        putCI(cis, identifiedCI({
          class: "data_store",
          name: satellite.name || satellite.path,
          attrs: {
            path: satellite.path,
            note: satellite.note || null,
            manifest_section: "satellites",
          },
        }, settings));
      } else {
        skipped.push("satellite without id or path");
      }
      continue;
    }
    const satelliteCI = identifiedCI({
      class: "satellite",
      name: satellite.name || satellite.id,
      attrs: {
        manifest_id: satellite.id,
        owner: satellite.owner || null,
        business_owner: satellite.businessOwner || null,
        dir: satellite.dir || null,
        path: satellite.dir ? join(settings.estateRoot, satellite.dir) : null,
        url: satellite.url || null,
        note: satellite.note || null,
      },
    }, settings);
    putCI(cis, satelliteCI);

    const servers = [...(satellite.servers || [])];
    const directPort = localPort(satellite.port) ?? localPort(satellite.url);
    if (directPort && !servers.some((item) => item?.port === directPort)) {
      servers.push({ port: directPort, what: satellite.note || satellite.name || satellite.id });
    }
    for (const server of servers) {
      if (!validPort(server?.port)) continue;
      const endpoint = endpointFor(server.port, { ...satellite, kind: "satellite" }, server, settings);
      putCI(cis, endpoint);
      putRelationship(relationships, {
        from_key: satelliteCI.ci_key, to_key: endpoint.ci_key, type: "runs",
      });
    }
  }

  for (const repo of manifest?.repos || []) {
    if (!repo?.path) { skipped.push("repo without path"); continue; }
    putCI(cis, identifiedCI({ class: "repo", name: repo.name || repo.path, attrs: { path: repo.path, owner: repo.owner || null } }, settings));
  }

  const products = projectProducts(productRegistry, settings);
  for (const ci of products.cis.values()) putCI(cis, ci);
  skipped.push(...products.skipped);

  return { cis, relationships, skipped };
}

export function spawnArgv(argv, { cwd } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(argv[0], argv.slice(1), { shell: false, windowsHide: true, cwd, timeout: 30000 });
    child.stdout?.on("data", (chunk) => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) child.kill(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk; if (stderr.length > 1024 * 1024) child.kill(); });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ code: null, stdout, stderr, error });
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });
  });
}

export async function collectObserved({ settings, declared, run = spawnArgv, loadTasks } = {}) {
  const ports = { complete: false, listeners: [], note: "portCheck disabled: no command configured" };
  const tasks = { complete: false, tasks: new Map(), note: "scheduler disabled: provider none" };
  const command = settings.sources.portCheck?.command;
  if (command) try {
    const result = await run(command.argv, { cwd: command.cwd });
    if (result.error) throw result.error;
    const parsed = JSON.parse(String(result.stdout || ""));
    if (!Array.isArray(parsed.listening) || !parsed.listening.every(port => Number.isInteger(port) && port > 0 && port <= 65535)) throw new Error("expected listening[] containing integer TCP ports");
    if (result.code === null) throw new Error("port checker terminated before completion");
    ports.complete = true;
    ports.listeners = [...new Set(parsed.listening)].sort((a, b) => a - b);
    ports.note = `${ports.listeners.length} TCP listener(s) observed${result.code ? `; checker exited ${result.code}` : ""}`;
  } catch (error) { ports.note = `port checker unavailable: ${error.message}`; }
  if (settings.sources.scheduler.provider !== "none") try {
    const live = loadTasks ? await loadTasks() : await readScheduledTasks({ run });
    tasks.tasks = new Map([...(live instanceof Map ? live : new Map(Object.entries(live || {})))].map(([key, value]) => [taskIdentity(key), value]));
    tasks.complete = true;
    const expected = [...declared.cis.values()].filter(ci => ci.class === "scheduled_task");
    tasks.note = `${expected.filter(ci => tasks.tasks.has(ci.attrs.task_name)).length}/${expected.length} declared task(s) observed; ${tasks.tasks.size} total`;
  } catch (error) { tasks.note = `scheduler unavailable: ${error.message}`; }
  return { ports, tasks };
}

export function projectObserved(declared, observations, settings) {
  const cis = new Map();
  const listeners = observations?.ports?.listeners || [];
  for (const port of listeners) {
    if (!Number.isInteger(Number(port))) continue;
    const key = ciKey("server_endpoint", { port: Number(port) }, settings.identificationRules);
    const declaration = declared.cis.get(key);
    const observed = declaration ? {
      ...declaration,
      attrs: { ...declaration.attrs, observation: { source: "ports", listening: true } },
    } : identifiedCI({
      class: "server_endpoint",
      name: `:${Number(port)} observed listener`,
      attrs: {
        port: Number(port),
        host: settings.desk.host,
        observation: { source: "ports", listening: true },
      },
    }, settings);
    putCI(cis, observed);
  }

  const liveTasks = observations?.tasks?.tasks instanceof Map
    ? observations.tasks.tasks : new Map(Object.entries(observations?.tasks?.tasks || {}));
  for (const [name, state] of liveTasks) {
    const taskName = taskIdentity(name);
    const key = ciKey("scheduled_task", { task_name: taskName }, settings.identificationRules);
    const declaration = declared.cis.get(key) || identifiedCI({
      class: "scheduled_task", name: taskName, attrs: { task_name: taskName },
    }, settings);
    putCI(cis, { ...declaration, attrs: { ...declaration.attrs,
      observation: { source: "schtasks", exists: true, state: cleanObject(state) },
    } });
  }
  return cis;
}

function existingRows(path) {
  if (!existsSync(path)) return [];
  const db = openStore(path, { readOnly: true });
  try { return listCIs(db); } finally { db.close(); }
}

function desiredStatus({ declared, observed, observedBy, existing, now, staleDays }) {
  if (declared && (observed || observedBy === "none")) return "reconciled";
  if (declared) return "declared_only";
  if (observed) return "observed_only";
  const last = Date.parse(existing?.last_seen || "");
  const age = Number.isNaN(last) ? Infinity : now.getTime() - last;
  return age > Number(staleDays) * 86_400_000 ? "stale" : existing.status;
}

export function buildSyncPlan({
  existing = [], declared, observed, now = new Date(), staleDays, classes = [],
  unavailableDeclaredClasses = [], unobservedClasses = [],
}) {
  const existingMap = new Map(existing.map((row) => [row.ci_key, row]));
  const observedByClass = new Map(classes.map((item) => [item.name, item.observedBy]));
  const keys = new Set([...existingMap.keys(), ...declared.cis.keys(), ...observed.keys()]);
  const at = now.toISOString();
  const rows = [];
  for (const key of [...keys].sort()) {
    const before = existingMap.get(key) || null;
    const declaredCI = declared.cis.get(key) || null;
    const observedCI = observed.get(key) || null;
    const active = declaredCI || observedCI;
    let status = desiredStatus({
      declared: Boolean(declaredCI), observed: Boolean(observedCI),
      observedBy: observedByClass.get((active || before).class), existing: before, now, staleDays,
    });
    // Missing evidence never counts as an observed absence or a declaration removal.
    if (before && !observedCI && ((declaredCI && unobservedClasses.includes(before.class))
      || (!active && (unavailableDeclaredClasses.includes(before.class) || unobservedClasses.includes(before.class))))) status = before.status;
    const declarationUnavailable = before && !declaredCI && unavailableDeclaredClasses.includes(before.class);
    if (declarationUnavailable && observedCI && before.last_declared_at) status = before.status;
    const source = active || before;
    const attrs = declarationUnavailable && observedCI
      ? { ...before.attrs, observation: observedCI.attrs.observation }
      : active ? (observedCI?.attrs || declaredCI.attrs) : before.attrs;
    if (before && declaredCI && !observedCI && unobservedClasses.includes(before.class) && before.attrs.observation) attrs.observation = before.attrs.observation;
    rows.push({
      ...source,
      name: declarationUnavailable ? before.name : source.name,
      attrs,
      status,
      owned_by: before ? before.owned_by : declaredCI?.attrs.owner ?? null,
      business_owner: before ? before.business_owner : declaredCI?.attrs.business_owner ?? null,
      ownership_note: before?.ownership_note ?? null,
      first_seen: before?.first_seen || at,
      last_seen: active ? at : before.last_seen,
      last_declared_at: declaredCI ? at : before?.last_declared_at ?? null,
      last_observed_at: observedCI ? at : before?.last_observed_at ?? null,
      _before: before,
      _active: Boolean(active),
    });
  }
  return { rows, relationships: [...declared.relationships.values()] };
}

function countStatuses(rows) {
  const counts = { total: rows.length };
  for (const status of CI_STATUSES) counts[status] = rows.filter((row) => row.status === status).length;
  return counts;
}

function reportEntry(row) {
  return {
    ci_key: row.ci_key,
    class: row.class,
    name: row.name,
    evidence: {
      attrs: row.attrs,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      last_declared_at: row.last_declared_at,
      last_observed_at: row.last_observed_at,
    },
  };
}

export function makeDriftReport(rows, generatedAt) {
  const sorted = [...rows].sort((a, b) => a.ci_key.localeCompare(b.ci_key));
  return {
    generatedAt,
    stamp: STAMP,
    declared_only: sorted.filter((row) => row.status === "declared_only").map(reportEntry),
    observed_only: sorted.filter((row) => row.status === "observed_only").map(reportEntry),
    stale: sorted.filter((row) => row.status === "stale").map(reportEntry),
    counts: countStatuses(sorted),
  };
}

function applyPlan(db, plan, { actor, now, sources }) {
  const at = now.toISOString();
  return withTransaction(db, () => {
    for (const row of plan.rows) {
      const before = row._before;
      if (!before) {
        db.prepare(`INSERT INTO cis
          (ci_key, class, name, status, attrs, owned_by, business_owner, ownership_note,
           first_seen, last_seen, last_declared_at, last_observed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(row.ci_key, row.class, row.name, row.status, stableJson(row.attrs), row.owned_by, row.business_owner, row.ownership_note, row.first_seen,
            row.last_seen, row.last_declared_at, row.last_observed_at);
        recordEvent(db, {
          at, entity: "ci", entityId: row.ci_key, kind: "ci-added", actor,
          detail: { class: row.class, name: row.name, status: row.status },
        });
        continue;
      }
      if (row._active || row.status !== before.status) {
        db.prepare(`UPDATE cis SET class = ?, name = ?, status = ?, attrs = ?,
          last_seen = ?, last_declared_at = ?, last_observed_at = ? WHERE ci_key = ?`)
          .run(row.class, row.name, row.status, stableJson(row.attrs), row.last_seen,
            row.last_declared_at, row.last_observed_at, row.ci_key);
      }
      if (row._active && (row.name !== before.name || stableJson(row.attrs) !== stableJson(before.attrs))) recordEvent(db, {
        at, entity: "ci", entityId: row.ci_key, kind: "ci-updated", actor,
        detail: { before: { name: before.name, attrs: before.attrs }, after: { name: row.name, attrs: row.attrs } },
      });
      if (row.status !== before.status) recordEvent(db, {
        at, entity: "ci", entityId: row.ci_key, kind: "ci-status", actor,
        detail: { from: before.status, to: row.status },
      });
    }

    const desired = new Map(plan.relationships.map((rel) =>
      [[rel.from_key, rel.to_key, rel.type].join("\u0000"), rel]));
    const present = db.prepare("SELECT * FROM relationships WHERE origin = 'declared'").all();
    for (const row of present) {
      const key = [row.from_key, row.to_key, row.type].join("\u0000");
      if (desired.has(key)) { desired.delete(key); continue; }
      if (plan.preserveRelationships) continue;
      db.prepare("DELETE FROM relationships WHERE id = ?").run(row.id);
      recordEvent(db, {
        at, entity: "relationship", entityId: row.id, kind: "rel-removed", actor,
        detail: { from_key: row.from_key, to_key: row.to_key, type: row.type, origin: "declared" },
      });
    }
    for (const rel of desired.values()) {
      const result = db.prepare(`INSERT INTO relationships
        (from_key, to_key, type, origin, created_at) VALUES (?, ?, ?, 'declared', ?)`)
        .run(rel.from_key, rel.to_key, rel.type, at);
      recordEvent(db, {
        at, entity: "relationship", entityId: result.lastInsertRowid, kind: "rel-added", actor,
        detail: { ...rel, origin: "declared" },
      });
    }

    const counts = countStatuses(plan.rows);
    recordEvent(db, {
      at, entity: "sync", entityId: at, kind: "sync-run", actor,
      detail: { counts, sources },
    });
    return counts;
  });
}

export function writeDriftReport(path, report) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function validateRegistry(document, name) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(document)) throw new Error('expected a registry object');
  const arrays = name === 'products' ? ['products'] : ['engines', 'satellites', 'repos'];
  if (!arrays.some(key => Array.isArray(document[key]))) throw new Error(`expected ${arrays.join(' or ')} array`);
  for (const key of arrays) if (document[key] !== undefined && !Array.isArray(document[key])) throw new Error(`${key} must be an array`);
  if (name === 'products') return document;
  for (const key of arrays) for (const item of document[key] || []) {
    if (!object(item)) throw new Error(`${key} entries must be objects`);
    for (const field of ['id','dir','path','name','owner','businessOwner','note','url','class','role']) {
      if (item[field] != null && typeof item[field] !== 'string') throw new Error(`${key}.${field} must be a string`);
    }
    for (const field of ['servers','nodes']) if (item[field] != null && !Array.isArray(item[field])) throw new Error(`${key}.${field} must be an array`);
    for (const server of item.servers || []) if (!object(server) || !validPort(server.port)) throw new Error(`${key}.servers require valid TCP ports`);
    for (const node of item.nodes || []) if (!object(node) || !Array.isArray(node.tasks) || !node.tasks.every(task => typeof task === 'string' && task.trim())) throw new Error(`${key}.nodes require tasks as non-empty strings`);
  }
  return document;
}

export async function syncCMDB({
  settings,
  apply = false,
  actor,
  now = new Date(),
  manifest = null,
  products = undefined,
  observations = null,
  run = spawnArgv,
  loadTasks = null,
} = {}) {
  const sourceNotes = {};
  const readSource = (name, supplied) => {
    const path = settings.sources[name]?.path;
    if (supplied == null && !path) { sourceNotes[name] = "disabled: no path configured"; return null; }
    try {
      const document = validateRegistry(supplied ?? JSON.parse(readFileSync(path, "utf8")), name);
      sourceNotes[name] = supplied != null ? 'provided in memory' : `read ${path}`;
      return document;
    } catch (error) { sourceNotes[name] = `unavailable: ${error.message}`; return null; }
  };
  const primary = readSource("manifest", manifest);
  const estate = readSource("estate");
  const productDocument = products === null ? null : readSource("products", products);
  const document = Object.fromEntries(["engines", "satellites", "repos"].map(key => [key, [...(primary?.[key] || []), ...(estate?.[key] || [])]]));
  const declared = projectDeclared(document, settings, productDocument);
  const observedState = observations || await collectObserved({ settings, declared, run, loadTasks });
  const observed = projectObserved(declared, observedState, settings);
  const existing = existingRows(settings.db);
  const plan = buildSyncPlan({
    existing, declared, observed, now, staleDays: settings.staleDays, classes: settings.classes,
    unavailableDeclaredClasses: [
      ...(!primary && !estate || (settings.sources.manifest?.path && !primary) || (settings.sources.estate?.path && !estate) ? ["engine","satellite","repo","data_store","server_endpoint","scheduled_task"] : []),
      ...(!productDocument && products !== null ? ["product"] : []),
    ],
    unobservedClasses: [...(!observedState.ports?.complete ? ["server_endpoint"] : []), ...(!observedState.tasks?.complete ? ["scheduled_task"] : [])],
  });
  plan.preserveRelationships = (!primary && !estate) || Boolean(settings.sources.manifest?.path && !primary) || Boolean(settings.sources.estate?.path && !estate);
  const productCount = [...declared.cis.values()].filter((ci) => ci.class === "product").length;
  const sources = {
    declared: `${declared.cis.size} CI(s), ${declared.relationships.size} relationship(s)`,
    ...sourceNotes,
    products: sourceNotes.products || "disabled",
    ports: observedState.ports?.note || "not observed",
    tasks: observedState.tasks?.note || "not observed",
  };
  const report = makeDriftReport(plan.rows, now.toISOString());
  report.sources = sources;
  if (apply) {
    const db = openStore(settings.db, { classes: settings.classes });
    try { applyPlan(db, plan, { actor, now, sources }); } finally { db.close(); }
    writeDriftReport(reportPath(settings, now), report);
  }
  return {
    stamp: STAMP,
    applied: Boolean(apply),
    report,
    counts: report.counts,
    sources,
    skipped: declared.skipped,
    projected: { cis: declared.cis.size, relationships: declared.relationships.size, products: productCount },
  };
}

export function reportPath(settings, now = new Date()) {
  return join(settings.reportsDir, `drift-${now.toISOString().slice(0, 10)}.json`);
}
export function readLatestReport(path) {
  if (!existsSync(path)) return null;
  const latest = readdirSync(path).filter(name => /^drift-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().at(-1);
  return latest ? JSON.parse(readFileSync(join(path, latest), "utf8")) : null;
}

export function snapshotStore(path) {
  if (!existsSync(path)) return [];
  const db = openStore(path, { readOnly: true });
  try { return db.prepare("SELECT * FROM cis ORDER BY ci_key").all().map(hydrateCI); }
  finally { db.close(); }
}
