// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// SQLite record spine for typed CIs, relationships, ownership, and append-only events.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const CI_STATUSES = ["reconciled", "declared_only", "observed_only", "stale"];
export const RELATIONSHIP_ORIGINS = ["declared", "manual"];

const TABLES = `
CREATE TABLE IF NOT EXISTS ci_classes (
  name        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cis (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ci_key             TEXT NOT NULL,
  class              TEXT NOT NULL REFERENCES ci_classes(name),
  name               TEXT NOT NULL,
  status             TEXT NOT NULL,
  attrs              TEXT NOT NULL DEFAULT '{}',
  owned_by           TEXT,
  business_owner     TEXT,
  ownership_note     TEXT,
  first_seen         TEXT NOT NULL,
  last_seen          TEXT NOT NULL,
  last_declared_at   TEXT,
  last_observed_at   TEXT
);

CREATE TABLE IF NOT EXISTS relationships (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_key   TEXT NOT NULL,
  to_key     TEXT NOT NULL,
  type       TEXT NOT NULL,
  origin     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind      TEXT NOT NULL,
  actor     TEXT NOT NULL,
  detail    TEXT
);
`;

const INDEXES_AND_GUARDS = `
CREATE UNIQUE INDEX IF NOT EXISTS cis_key ON cis(ci_key);
CREATE INDEX IF NOT EXISTS cis_browse ON cis(class, status, name);
CREATE UNIQUE INDEX IF NOT EXISTS relationships_identity
  ON relationships(from_key, to_key, type, origin);
CREATE INDEX IF NOT EXISTS relationships_from ON relationships(from_key, type, to_key);
CREATE INDEX IF NOT EXISTS relationships_to ON relationships(to_key, type, from_key);
CREATE INDEX IF NOT EXISTS events_entity ON events(entity, entity_id, at, id);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
`;

const required = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

const optional = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

function migrateSchema(db) {
  const ensureColumns = (table, columns) => {
    const present = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    for (const [name, declaration] of Object.entries(columns)) {
      if (!present.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${declaration}`);
    }
  };
  ensureColumns("ci_classes", {
    name: "TEXT",
    label: "TEXT NOT NULL DEFAULT ''",
    description: "TEXT NOT NULL DEFAULT ''",
  });
  ensureColumns("cis", {
    ci_key: "TEXT",
    class: "TEXT",
    name: "TEXT",
    status: "TEXT NOT NULL DEFAULT 'declared_only'",
    attrs: "TEXT NOT NULL DEFAULT '{}'",
    owned_by: "TEXT",
    business_owner: "TEXT",
    ownership_note: "TEXT",
    first_seen: "TEXT",
    last_seen: "TEXT",
    last_declared_at: "TEXT",
    last_observed_at: "TEXT",
  });
  ensureColumns("relationships", {
    from_key: "TEXT",
    to_key: "TEXT",
    type: "TEXT",
    origin: "TEXT NOT NULL DEFAULT 'manual'",
    created_at: "TEXT",
  });
  ensureColumns("events", {
    at: "TEXT",
    entity: "TEXT",
    entity_id: "TEXT",
    kind: "TEXT",
    actor: "TEXT",
    detail: "TEXT",
  });
}

function seedClasses(db, classes) {
  const statement = db.prepare(`INSERT INTO ci_classes (name, label, description) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET label = excluded.label, description = excluded.description`);
  for (const item of classes || []) {
    statement.run(required(item.name, "class name"), required(item.label, "class label"),
      String(item.description ?? "").trim());
  }
}

export function openStore(path, { readOnly = false, classes = [] } = {}) {
  if (!readOnly) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (!readOnly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(TABLES);
    migrateSchema(db);
    db.exec(INDEXES_AND_GUARDS);
    seedClasses(db, classes);
  }
  return db;
}

export function withTransaction(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Preserve the original transaction error. */ }
    throw error;
  }
}

export function recordEvent(db, { at, entity, entityId, kind, actor, detail = null }) {
  const body = detail == null ? null : typeof detail === "string" ? detail : JSON.stringify(detail);
  db.prepare(`INSERT INTO events (at, entity, entity_id, kind, actor, detail)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    required(at, "event timestamp"), required(entity, "event entity"),
    required(entityId, "event entity id"), required(kind, "event kind"),
    required(actor, "event actor"), body,
  );
}

export function parseAttrs(value) {
  try { return JSON.parse(value || "{}"); } catch { return {}; }
}

export function hydrateCI(row) {
  return row ? { ...row, attrs: parseAttrs(row.attrs) } : null;
}

export function getCI(db, ciKey) {
  const key = required(ciKey, "CI key");
  const row = db.prepare("SELECT * FROM cis WHERE ci_key = ?").get(key);
  if (!row) throw new Error(`no CI "${key}"`);
  return hydrateCI(row);
}

export function listCIs(db, { class: className = null, status = null } = {}) {
  const where = [];
  const args = [];
  if (className) { where.push("class = ?"); args.push(className); }
  if (status) {
    if (!CI_STATUSES.includes(status)) throw new Error(`status must be one of: ${CI_STATUSES.join(", ")}`);
    where.push("status = ?"); args.push(status);
  }
  return db.prepare(`SELECT * FROM cis${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
    ORDER BY class, name COLLATE NOCASE, ci_key`).all(...args).map(hydrateCI);
}

export function listClasses(db) {
  return db.prepare(`SELECT c.*, COUNT(i.id) AS ci_count,
      SUM(CASE WHEN i.status = 'reconciled' THEN 1 ELSE 0 END) AS reconciled_count,
      SUM(CASE WHEN i.status = 'declared_only' THEN 1 ELSE 0 END) AS declared_only_count,
      SUM(CASE WHEN i.status = 'observed_only' THEN 1 ELSE 0 END) AS observed_only_count,
      SUM(CASE WHEN i.status = 'stale' THEN 1 ELSE 0 END) AS stale_count
    FROM ci_classes c LEFT JOIN cis i ON i.class = c.name
    GROUP BY c.name, c.label, c.description ORDER BY c.label COLLATE NOCASE`).all()
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, key.endsWith("_count") || key === "ci_count" ? Number(value || 0) : value])));
}

export function listRelationships(db) {
  return db.prepare("SELECT * FROM relationships ORDER BY type, from_key, to_key, origin").all();
}

export function getCIDetails(db, ciKey) {
  const ci = getCI(db, ciKey);
  const outgoing = db.prepare(`SELECT r.*, c.name AS other_name, c.class AS other_class,
      c.status AS other_status FROM relationships r LEFT JOIN cis c ON c.ci_key = r.to_key
    WHERE r.from_key = ? ORDER BY r.type, r.to_key, r.origin`).all(ci.ci_key);
  const incoming = db.prepare(`SELECT r.*, c.name AS other_name, c.class AS other_class,
      c.status AS other_status FROM relationships r LEFT JOIN cis c ON c.ci_key = r.from_key
    WHERE r.to_key = ? ORDER BY r.type, r.from_key, r.origin`).all(ci.ci_key);
  const events = db.prepare(`SELECT * FROM events WHERE entity = 'ci' AND entity_id = ?
    ORDER BY at, id`).all(ci.ci_key);
  return { ...ci, relationships: { outgoing, incoming }, events };
}

function validateRelationship(db, fromKey, toKey, type, allowedTypes) {
  const from = getCI(db, fromKey);
  const to = getCI(db, toKey);
  const cleanType = required(type, "relationship type");
  if (!allowedTypes?.includes(cleanType)) {
    throw new Error(`relationship type must be one of: ${(allowedTypes || []).join(", ")}`);
  }
  return { from, to, type: cleanType };
}

export function ownCI(db, ciKey, input = {}) {
  const ci = getCI(db, ciKey);
  const { actor, now = new Date() } = input;
  const cleanActor = required(actor, "actor");
  const next = {
    owned_by: Object.hasOwn(input, "owner") ? optional(input.owner) : ci.owned_by,
    business_owner: Object.hasOwn(input, "business") ? optional(input.business) : ci.business_owner,
    ownership_note: Object.hasOwn(input, "note") ? optional(input.note) : ci.ownership_note,
  };
  const before = {
    owned_by: ci.owned_by, business_owner: ci.business_owner, ownership_note: ci.ownership_note,
  };
  if (Object.keys(next).every((key) => next[key] === before[key])) return ci;
  return withTransaction(db, () => {
    db.prepare(`UPDATE cis SET owned_by = ?, business_owner = ?, ownership_note = ? WHERE ci_key = ?`)
      .run(next.owned_by, next.business_owner, next.ownership_note, ci.ci_key);
    recordEvent(db, {
      at: now.toISOString(), entity: "ci", entityId: ci.ci_key, kind: "ci-owned", actor: cleanActor,
      detail: { before, after: next },
    });
    return getCI(db, ci.ci_key);
  });
}

export function addManualRelationship(db, fromKey, toKey, type, {
  actor,
  allowedTypes,
  now = new Date(),
} = {}) {
  const cleanActor = required(actor, "actor");
  const valid = validateRelationship(db, fromKey, toKey, type, allowedTypes);
  const existing = db.prepare(`SELECT * FROM relationships
    WHERE from_key = ? AND to_key = ? AND type = ? AND origin = 'manual'`)
    .get(valid.from.ci_key, valid.to.ci_key, valid.type);
  if (existing) return existing;
  return withTransaction(db, () => {
    const at = now.toISOString();
    const result = db.prepare(`INSERT INTO relationships
      (from_key, to_key, type, origin, created_at) VALUES (?, ?, ?, 'manual', ?)`)
      .run(valid.from.ci_key, valid.to.ci_key, valid.type, at);
    recordEvent(db, {
      at, entity: "relationship", entityId: result.lastInsertRowid, kind: "rel-added", actor: cleanActor,
      detail: { from_key: valid.from.ci_key, to_key: valid.to.ci_key, type: valid.type, origin: "manual" },
    });
    return db.prepare("SELECT * FROM relationships WHERE id = ?").get(result.lastInsertRowid);
  });
}
