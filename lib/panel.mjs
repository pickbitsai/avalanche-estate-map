// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// Read-only dashboard panel; a missing or unreadable database is safely absent.

import { existsSync } from "node:fs";
import { listCIs, openStore } from "./store.mjs";

export const id = "cmdb";
export const title = "Avalanche Estate Map";
export const nav = "Estate Map";

export function collect({ settings = {} } = {}) {
  try {
    if (!settings.db || !existsSync(settings.db)) return null;
    const db = openStore(settings.db, { readOnly: true });
    try {
      const cis = listCIs(db);
      const byClass = Object.fromEntries([...new Set(cis.map((ci) => ci.class))].sort()
        .map((klass) => [klass, cis.filter((ci) => ci.class === klass).length]));
      const drift = cis.filter((ci) => ci.status === "observed_only" || ci.status === "stale");
      return { cis, byClass, drift, topDrift: drift.slice(0, 8) };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export function stat(data) {
  try {
    if (!data) return null;
    return { label: "Estate drift", value: data.drift.length };
  } catch {
    return null;
  }
}

export function render(data, { esc } = {}) {
  try {
    if (!data || typeof esc !== "function") return "";
    const classRows = Object.entries(data.byClass).map(([klass, count]) =>
      `<tr><td><b>${esc(klass)}</b></td><td>${esc(count)}</td></tr>`).join("");
    const driftRows = data.topDrift.map((ci) =>
      `<tr><td class="mono">${esc(ci.ci_key)}</td><td>${esc(ci.name)}</td>`
      + `<td><span class="chip ${ci.status === "observed_only" ? "warn" : "bad"}">${esc(ci.status)}</span></td></tr>`).join("");
    return `<details class="ops-section" id="cmdb"${data.drift.length ? " open" : ""}>`
      + `<summary>${esc(title)} <span class="section-count">${esc(data.drift.length)} drift · ${esc(data.cis.length)} CIs</span></summary>`
      + `<div style="padding:14px 16px;border-top:1px solid rgba(255,255,255,.07)">`
      + `<p class="doc">Read-only typed projection of the platform and product registries. Reconcile with the Avalanche Estate Map CLI; this panel never scans or mutates.</p></div>`
      + `<div class="table-shell"><table><tr><th>Class</th><th>CIs</th></tr>${classRows}</table></div>`
      + (driftRows ? `<div class="table-shell"><table><tr><th>Top drift</th><th>Name</th><th>Status</th></tr>${driftRows}</table></div>` : "")
      + `</details>`;
  } catch {
    return "";
  }
}
