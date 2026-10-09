// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { collect, id, nav, render, stat, title } from "../lib/panel.mjs";
import { syncCMDB } from "../lib/sync.mjs";
import { fixture, observations } from "./helpers.mjs";

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
})[char]);

test("panel is null-safe, read-only, and reports drift as its hero", async (t) => {
  const { settings, manifest, dir } = fixture(t);
  assert.deepEqual({ id, title, nav }, { id: "cmdb", title: "Avalanche Estate Map", nav: "Estate Map" });
  assert.equal(collect({ settings: { db: join(dir, "missing.db") } }), null);
  assert.equal(stat(null), null);
  assert.equal(render(null, { esc }), "");

  await syncCMDB({
    settings, manifest, observations: observations({ ports: [4399] }), apply: true,
    actor: "test:panel", now: new Date("2026-01-01T00:00:00.000Z"),
  });
  const data = collect({ settings });
  assert.equal(data.drift.length, 1);
  assert.deepEqual(stat(data), { label: "Estate drift", value: 1 });
  const html = render(data, { esc });
  assert.match(html, /server_endpoint:4399/);
  assert.match(html, /observed_only/);
});
