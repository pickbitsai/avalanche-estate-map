// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { getCI, listCIs, openStore, ownCI } from "../lib/store.mjs";
import { syncCMDB } from "../lib/sync.mjs";
import { fixture, observations } from "./helpers.mjs";

const ACTOR = "test:products";
const at = (value) => new Date(value);

test("product registry sync creates declaration-backed CIs with stable identity and attributes", async (t) => {
  const { settings, manifest } = fixture(t, { products: true });
  const firstAt = "2026-01-01T00:00:00.000Z";
  const first = await syncCMDB({
    settings, manifest, observations: observations(), apply: true, actor: ACTOR, now: at(firstAt),
  });

  let db = openStore(settings.db, { classes: settings.classes });
  const rows = listCIs(db, { class: "product" });
  assert.deepEqual(rows.map((row) => row.ci_key), [
    "product:arroyo-board", "product:canyon-notes", "product:mesa-planner",
  ]);
  assert.ok(rows.every((row) => row.status === "reconciled"));
  assert.ok(rows.every((row) => row.last_declared_at === firstAt && row.last_observed_at === null));
  assert.deepEqual(getCI(db, "product:canyon-notes").attrs, {
    connected: true,
    featured: true,
    genre: "productivity",
    name: "Canyon Notes",
    openSource: false,
    platforms: ["web", "desktop", "android"],
    playUrl: "https://notes.example.com",
    slug: "canyon-notes",
    tags: ["Notes", "Editorial", "Writing"],
    telemetry: [],
  });
  assert.equal(getCI(db, "product:mesa-planner").attrs.featured, false,
    "an omitted optional boolean is normalized defensively");
  assert.ok(!rows.some((row) => row.ci_key === "product:not-yet-declared"));
  assert.ok(!first.report.observed_only.some((row) => row.class === "product"));
  assert.ok(!first.report.stale.some((row) => row.class === "product"));

  ownCI(db, "product:canyon-notes", {
    owner: "Studio", business: "Publishing", note: "Fixture owner", actor: "test:owner",
    now: at("2026-01-01T01:00:00.000Z"),
  });
  const ids = new Map(rows.map((row) => [row.ci_key, row.id]));
  const eventMark = db.prepare("SELECT MAX(id) AS id FROM events").get().id;
  db.close();

  await syncCMDB({
    settings, manifest, observations: observations(), apply: true, actor: ACTOR,
    now: at("2026-01-02T00:00:00.000Z"),
  });
  db = openStore(settings.db, { classes: settings.classes });
  assert.deepEqual(new Map(listCIs(db, { class: "product" }).map((row) => [row.ci_key, row.id])), ids);
  const notes = getCI(db, "product:canyon-notes");
  assert.deepEqual([notes.owned_by, notes.business_owner, notes.ownership_note],
    ["Studio", "Publishing", "Fixture owner"]);
  assert.deepEqual(db.prepare("SELECT kind FROM events WHERE id > ? ORDER BY id").all(eventMark)
    .map((row) => row.kind), ["sync-run"]);
  db.close();
});

test("a declaration-only class stays reconciled while present and becomes stale after removal", async (t) => {
  const { settings, manifest, products } = fixture(t, { products: true, staleDays: 2 });
  assert.equal(settings.classes.find((item) => item.name === "product").observedBy, "none");
  await syncCMDB({
    settings, manifest, observations: observations(), apply: true, actor: ACTOR,
    now: at("2026-01-01T00:00:00.000Z"),
  });

  products.products = products.products.filter((product) => product.slug !== "canyon-notes");
  writeFileSync(settings.sources.products.path, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await syncCMDB({
    settings, manifest, observations: observations(), apply: true, actor: ACTOR,
    now: at("2026-01-03T00:00:00.000Z"),
  });
  let db = openStore(settings.db, { classes: settings.classes });
  assert.equal(getCI(db, "product:canyon-notes").status, "reconciled",
    "the exact stale boundary retains the prior status");
  db.close();

  const result = await syncCMDB({
    settings, manifest, observations: observations(), apply: true, actor: ACTOR,
    now: at("2026-01-03T00:00:00.001Z"),
  });
  db = openStore(settings.db, { classes: settings.classes });
  const rows = listCIs(db, { class: "product" });
  assert.equal(rows.length, 3, "removal from the registry never deletes the CI");
  assert.equal(getCI(db, "product:canyon-notes").status, "stale");
  assert.equal(getCI(db, "product:canyon-notes").last_declared_at, "2026-01-01T00:00:00.000Z");
  assert.ok(result.report.stale.some((row) => row.ci_key === "product:canyon-notes"));
  assert.ok(rows.filter((row) => row.ci_key !== "product:canyon-notes")
    .every((row) => row.status === "reconciled"));
  db.close();
});
