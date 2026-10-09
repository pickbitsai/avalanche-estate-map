// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addManualRelationship, openStore } from "../lib/store.mjs";
import { syncCMDB } from "../lib/sync.mjs";
import { traverseCITree } from "../lib/tree.mjs";
import { fixture, observations } from "./helpers.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "bin", "avalanche-estate.mjs");

async function graphFixture(t) {
  const result = fixture(t);
  await syncCMDB({
    settings: result.settings,
    manifest: result.manifest,
    observations: observations(),
    apply: true,
    actor: "test:tree-setup",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  const db = openStore(result.settings.db, { classes: result.settings.classes });
  for (const [from, to, type] of [
    ["engine:alpha", "engine:beta", "depends_on"],
    ["engine:beta", "satellite:helper", "feeds"],
    ["satellite:helper", "engine:alpha", "depends_on"],
  ]) {
    addManualRelationship(db, from, to, type, {
      actor: "test:tree-link", allowedTypes: result.settings.relationshipTypes,
      now: new Date("2026-01-01T01:00:00.000Z"),
    });
  }
  db.close();
  return result;
}

test("tree traversal is breadth-first, bidirectional, depth-capped, deterministic, and cycle-safe", async (t) => {
  const { settings } = await graphFixture(t);
  const db = openStore(settings.db, { readOnly: true });
  const one = traverseCITree(db, "engine:alpha", { depth: 1 });
  assert.deepEqual(one.nodes.map((node) => [node.depth, node.ci_key]), [
    [0, "engine:alpha"],
    [1, "engine:beta"],
    [1, "satellite:helper"],
    [1, "scheduled_task:Juniper-Alpha-Daily"],
    [1, "server_endpoint:4301"],
  ]);
  assert.deepEqual(one.nodes.slice(1).map((node) => [node.ci_key, node.direction, node.relationship.type]), [
    ["engine:beta", "outgoing", "depends_on"],
    ["satellite:helper", "incoming", "depends_on"],
    ["scheduled_task:Juniper-Alpha-Daily", "incoming", "scheduled_by"],
    ["server_endpoint:4301", "outgoing", "runs"],
  ]);

  const two = traverseCITree(db, "engine:alpha", { depth: 2 });
  assert.deepEqual(two.nodes.map((node) => [node.depth, node.ci_key]), [
    [0, "engine:alpha"],
    [1, "engine:beta"],
    [1, "satellite:helper"],
    [1, "scheduled_task:Juniper-Alpha-Daily"],
    [1, "server_endpoint:4301"],
    [2, "server_endpoint:4302"],
  ]);
  assert.equal(new Set(two.nodes.map((node) => node.ci_key)).size, two.nodes.length,
    "the cycle never revisits a CI");
  db.close();
});

test("tree CLI prints the shared traversal in a stable indented form", async (t) => {
  const { settings } = await graphFixture(t);
  const result = spawnSync(process.execPath, [CLI, "--data-dir", settings.dataDir, "tree", "engine:alpha", "--depth", "1"], {
    cwd: ROOT,
    env: { ...process.env, AVALANCHE_ESTATE_CONFIG: "", AVALANCHE_ESTATE_DESK_PORT: "4180" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), [
    "engine:alpha [engine · declared_only]",
    "  -> depends_on — engine:beta [engine · declared_only]",
    "  <- depends_on — satellite:helper [satellite · declared_only]",
    "  <- scheduled_by — scheduled_task:Juniper-Alpha-Daily [scheduled_task · declared_only]",
    "  -> runs — server_endpoint:4301 [server_endpoint · declared_only]",
  ].join("\n") + "\nMade with Avalanche Estate Map by PickBits");
});
