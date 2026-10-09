// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import config from "../config.example.mjs";
import { ciKey, identifiedCI } from "../lib/identification.mjs";

test("CI keys are deterministic for every configured default class", () => {
  const cases = [
    ["engine", { manifest_id: "canyon-notes" }, "engine:canyon-notes"],
    ["satellite", { manifest_id: "studio-guide" }, "satellite:studio-guide"],
    ["server_endpoint", { port: 4180 }, "server_endpoint:4180"],
    ["scheduled_task", { task_name: "Juniper Daily" }, "scheduled_task:Juniper Daily"],
    ["data_store", { path: "stores/notes.db" }, "data_store:stores/notes.db"],
    ["repo", { path: "repos/canyon-notes" }, "repo:repos/canyon-notes"],
    ["product", { slug: "canyon-notes" }, "product:canyon-notes"],
  ];
  for (const [klass, attrs, expected] of cases) {
    assert.equal(ciKey(klass, attrs, config.identificationRules), expected);
    assert.equal(ciKey(klass, structuredClone(attrs), config.identificationRules), expected);
  }
});

test("identification follows configured attribute order and validates missing identity", () => {
  const rules = { service: ["scope", "name"] };
  assert.equal(ciKey("service", { name: "api", scope: "internal" }, rules), "service:internal|api");
  assert.throws(() => ciKey("engine", {}, config.identificationRules), /manifest_id/);
  assert.deepEqual(identifiedCI({
    class: "engine", name: "Canyon Notes", attrs: { manifest_id: "canyon-notes" },
  }, config), {
    ci_key: "engine:canyon-notes", class: "engine", name: "Canyon Notes", attrs: { manifest_id: "canyon-notes" },
  });
});
