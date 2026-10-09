// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addManualRelationship,
  getCI,
  listCIs,
  listRelationships,
  openStore,
  ownCI,
} from "../lib/store.mjs";
import { projectDeclared, reportPath, syncCMDB } from "../lib/sync.mjs";
import { fixture, observations } from "./helpers.mjs";

const ACTOR = "test:sync";
const at = (value) => new Date(value);

test("declared fixture projection creates engines, satellite, endpoints, task, and typed relationships", (t) => {
  const { settings, manifest } = fixture(t);
  const projected = projectDeclared(manifest, settings);
  assert.deepEqual([...projected.cis.keys()].sort(), [
    "data_store:registry/records.json",
    "engine:alpha",
    "engine:beta",
    "satellite:helper",
    "scheduled_task:Juniper-Alpha-Daily",
    "server_endpoint:4301",
    "server_endpoint:4302",
  ]);
  const relationships = [...projected.relationships.values()];
  assert.ok(relationships.some((row) => row.from_key === "engine:alpha"
    && row.to_key === "server_endpoint:4301" && row.type === "runs"));
  assert.ok(relationships.some((row) => row.from_key === "scheduled_task:Juniper-Alpha-Daily"
    && row.to_key === "engine:alpha" && row.type === "scheduled_by"));
  assert.ok(relationships.some((row) => row.from_key === "satellite:helper"
    && row.to_key === "server_endpoint:4302" && row.type === "runs"));
  assert.equal(projected.cis.get("engine:alpha").attrs.dir, "alpha-engine");
  assert.equal(projected.cis.get("data_store:registry/records.json").class, "data_store");
});

test("observed listeners reconcile declarations and create observed-only CIs", async (t) => {
  const { settings, manifest } = fixture(t);
  const result = await syncCMDB({
    settings, manifest, apply: true, actor: ACTOR, now: at("2026-01-01T00:00:00.000Z"),
    observations: observations({
      ports: [4301, 4399],
      tasks: { "Juniper-Alpha-Daily": { name: "Juniper-Alpha-Daily", ok: true } },
    }),
  });
  assert.equal(result.counts.reconciled, 2);
  assert.equal(result.counts.observed_only, 1);
  const db = openStore(settings.db, { classes: settings.classes });
  assert.equal(getCI(db, "server_endpoint:4301").status, "reconciled");
  assert.equal(getCI(db, "scheduled_task:Juniper-Alpha-Daily").status, "reconciled");
  assert.equal(getCI(db, "engine:alpha").status, "declared_only");
  const unknown = getCI(db, "server_endpoint:4399");
  assert.equal(unknown.status, "observed_only");
  assert.equal(unknown.attrs.observation.listening, true);
  db.close();
});

test("stale transition is strictly after staleDays and sync never deletes a CI", async (t) => {
  const { settings, manifest } = fixture(t, { staleDays: 2 });
  await syncCMDB({
    settings, manifest, apply: true, actor: ACTOR, now: at("2026-01-01T00:00:00.000Z"),
    observations: observations({ ports: [4301] }),
  });
  const empty = { engines: [], satellites: [] };
  await syncCMDB({
    settings, manifest: empty, apply: true, actor: ACTOR, now: at("2026-01-03T00:00:00.000Z"),
    observations: observations(),
  });
  let db = openStore(settings.db, { classes: settings.classes });
  assert.equal(getCI(db, "server_endpoint:4301").status, "reconciled", "exact boundary is not stale");
  assert.equal(listCIs(db).length, 7);
  db.close();

  await syncCMDB({
    settings, manifest: empty, apply: true, actor: ACTOR, now: at("2026-01-03T00:00:00.001Z"),
    observations: observations(),
  });
  db = openStore(settings.db, { classes: settings.classes });
  assert.equal(listCIs(db).length, 7, "sync preserves every previously seen CI");
  assert.ok(listCIs(db).every((row) => row.status === "stale"));
  db.close();
});

test("unchanged sync is idempotent while ownership and manual relationships survive", async (t) => {
  const { settings, manifest } = fixture(t);
  const observed = observations({
    ports: [4301], tasks: { "Juniper-Alpha-Daily": { name: "Juniper-Alpha-Daily", ok: true } },
  });
  await syncCMDB({
    settings, manifest, observations: observed, apply: true, actor: ACTOR,
    now: at("2026-01-01T00:00:00.000Z"),
  });
  let db = openStore(settings.db, { classes: settings.classes });
  ownCI(db, "engine:alpha", {
    owner: "Platform", business: "Operations", note: "Fixture ownership", actor: "test:owner",
    now: at("2026-01-01T01:00:00.000Z"),
  });
  addManualRelationship(db, "engine:alpha", "engine:beta", "depends_on", {
    actor: "test:link", allowedTypes: settings.relationshipTypes,
    now: at("2026-01-01T01:00:00.000Z"),
  });
  const declaredIds = listRelationships(db).filter((row) => row.origin === "declared").map((row) => row.id);
  const eventMark = db.prepare("SELECT MAX(id) AS id FROM events").get().id;
  db.close();

  await syncCMDB({
    settings, manifest, observations: observed, apply: true, actor: ACTOR,
    now: at("2026-01-02T00:00:00.000Z"),
  });
  db = openStore(settings.db, { classes: settings.classes });
  const alpha = getCI(db, "engine:alpha");
  assert.deepEqual([alpha.owned_by, alpha.business_owner, alpha.ownership_note],
    ["Platform", "Operations", "Fixture ownership"]);
  assert.ok(listRelationships(db).some((row) => row.origin === "manual"
    && row.from_key === "engine:alpha" && row.to_key === "engine:beta"));
  assert.deepEqual(listRelationships(db).filter((row) => row.origin === "declared").map((row) => row.id), declaredIds,
    "unchanged declared relationships keep their identity");
  const newEvents = db.prepare("SELECT kind FROM events WHERE id > ? ORDER BY id").all(eventMark)
    .map((row) => row.kind);
  assert.deepEqual(newEvents, ["sync-run"], "second unchanged sync adds only its run event");
  db.close();
});

test("applied sync writes the stable drift-report contract; dry-run writes nothing", async (t) => {
  const { settings, manifest } = fixture(t);
  const dry = await syncCMDB({
    settings, manifest, apply: false, actor: ACTOR, now: at("2026-01-01T00:00:00.000Z"),
    observations: observations({ ports: [4399] }),
  });
  assert.equal(dry.applied, false);
  assert.throws(() => readFileSync(reportPath(settings, at("2026-01-01")), "utf8"));
  const applied = await syncCMDB({
    settings, manifest, apply: true, actor: ACTOR, now: at("2026-01-01T00:00:00.000Z"),
    observations: observations({ ports: [4399] }),
  });
  const report = JSON.parse(readFileSync(reportPath(settings, at("2026-01-01")), "utf8"));
  assert.deepEqual(Object.keys(report), ["generatedAt", "stamp", "declared_only", "observed_only", "stale", "counts", "sources"]);
  assert.equal(report.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(report.observed_only[0].ci_key, "server_endpoint:4399");
  assert.equal(report.observed_only[0].evidence.attrs.observation.source, "ports");
  assert.deepEqual(report.counts, applied.counts);
  assert.deepEqual(report.stale, []);
});
