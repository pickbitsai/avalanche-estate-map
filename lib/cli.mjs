// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { parseArgs } from "node:util";
import {
  CI_STATUSES,
  addManualRelationship,
  getCIDetails,
  listCIs,
  listClasses,
  openStore,
  ownCI,
} from "./store.mjs";
import { readLatestReport, syncCMDB } from "./sync.mjs";
import { DEFAULT_TREE_DEPTH, formatCITree, traverseCITree, treeDepth } from "./tree.mjs";

import { loadConfig, resolveDataDir, resolveActor, initConfig, ROOT, STAMP } from "./config.mjs";
import { seedDemo } from "./demo.mjs";
import { startDesk } from "./desk.mjs";

export async function main(args = process.argv.slice(2)) {
const { values, positionals } = parseArgs({
  args, allowPositionals: true,
  options: {
    "data-dir": { type: "string" }, actor: { type: "string" },
    help: { type: "boolean", short: "h" }, reset: { type: "boolean" },
    "seed-only": { type: "boolean" },
    apply: { type: "boolean", default: false },
    class: { type: "string" },
    status: { type: "string" },
    owner: { type: "string" },
    business: { type: "string" },
    note: { type: "string" },
    type: { type: "string" },
    depth: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const command = values.help ? "help" : positionals[0] || "help";
const isDemo = command === "demo";
const dataDir = resolveDataDir({ dataDir: values["data-dir"] || (isDemo ? join(ROOT, ".test-tmp", "demo") : undefined) });
if (isDemo) {
  const settings = await seedDemo({ dataDir, reset: values.reset });
  console.log(`*** DEMO: JUNIPER TRAIL STUDIO - all people, businesses and data are synthetic ***\nData directory: ${dataDir}\n${STAMP}`);
  if (!values["seed-only"]) await startDesk({ settings, actor: resolveActor({ actor: values.actor, config: settings, env: {} }), demo: true });
  return;
}
if (command === "init") {
  console.log(`Config ready: ${initConfig(dataDir)}\nData directory: ${dataDir}\n${STAMP}`);
  return;
}
const settings = await loadConfig({ dataDir });
const DB_PATH = settings.db;
const ACTOR = resolveActor({ actor: values.actor, config: settings });
const pad = (value, width) => String(value ?? "").padEnd(width).slice(0, width);

function useStore(work) {
  if (!existsSync(DB_PATH)) throw new Error("database missing; run sync --apply or demo --seed-only first");
  const db = openStore(DB_PATH, { readOnly: !["own", "link"].includes(command), classes: settings.classes });
  try { return work(db); } finally { db.close(); }
}

function printCounts(result) {
  const counts = result.counts;
  console.log(`${result.applied ? "APPLIED" : "DRY RUN"} · ${counts.total} CI(s) · `
    + `${counts.reconciled} reconciled · ${counts.declared_only} declared_only · `
    + `${counts.observed_only} observed_only · ${counts.stale} stale`);
  console.log(`declared: ${result.sources.declared}`);
  console.log(`manifest: ${result.sources.manifest}\nestate: ${result.sources.estate}`);
  console.log(`products: ${result.sources.products}`);
  console.log(`ports: ${result.sources.ports}`);
  console.log(`tasks: ${result.sources.tasks}`);
  if (!result.applied) console.log("No database or report changes were written. Re-run with --apply.");
  if (result.skipped.length) console.log(`skipped: ${result.skipped.join(", ")}`);
}

async function syncCommand() {
  const result = await syncCMDB({ settings, apply: values.apply, actor: ACTOR });
  if (values.json) return console.log(JSON.stringify(result, null, 2));
  printCounts(result);
}

function listCommand() {
  const rows = useStore((db) => listCIs(db, { class: values.class, status: values.status }));
  if (values.json) return console.log(JSON.stringify({ stamp: STAMP, rows }, null, 2));
  if (!rows.length) return console.log("no matching CIs");
  console.log(`${pad("STATUS", 15)} ${pad("CLASS", 18)} ${pad("CI KEY", 48)} NAME`);
  for (const row of rows) {
    console.log(`${pad(row.status, 15)} ${pad(row.class, 18)} ${pad(row.ci_key, 48)} ${row.name}`);
  }
  console.log(`\n${rows.length} shown`);
}

function showCommand() {
  const row = useStore((db) => getCIDetails(db, positionals[1]));
  if (values.json) return console.log(JSON.stringify({ stamp: STAMP, ...row }, null, 2));
  console.log(`${row.ci_key} · ${row.class} · ${row.status}`);
  console.log(row.name);
  console.log(`\ntechnical owner: ${row.owned_by || "unowned"}`);
  console.log(`business owner: ${row.business_owner || "unowned"}`);
  console.log(`ownership note: ${row.ownership_note || "none"}`);
  console.log(`\nfirst seen: ${row.first_seen}`);
  console.log(`last seen: ${row.last_seen}`);
  console.log(`last declared: ${row.last_declared_at || "never"}`);
  console.log(`last observed: ${row.last_observed_at || "never"}`);
  console.log(`\nattributes:\n${JSON.stringify(row.attrs, null, 2)}`);
  console.log("\nrelationships:");
  if (!row.relationships.outgoing.length && !row.relationships.incoming.length) console.log("  none");
  for (const rel of row.relationships.outgoing) {
    console.log(`  -> ${rel.type} -> ${rel.to_key} [${rel.origin}]`);
  }
  for (const rel of row.relationships.incoming) {
    console.log(`  <- ${rel.type} <- ${rel.from_key} [${rel.origin}]`);
  }
}

function treeCommand() {
  const depth = treeDepth(values.depth ?? DEFAULT_TREE_DEPTH);
  const tree = useStore((db) => traverseCITree(db, positionals[1], { depth }));
  if (values.json) return console.log(JSON.stringify({ stamp: STAMP, ...tree }, null, 2));
  console.log(formatCITree(tree));
}

function classesCommand() {
  const rows = useStore(listClasses);
  if (values.json) return console.log(JSON.stringify({ stamp: STAMP, rows }, null, 2));
  console.log(`${pad("CLASS", 20)} ${pad("CIS", 5)} ${pad("RECON", 6)} ${pad("DECL", 5)} ${pad("OBS", 5)} ${pad("STALE", 5)} LABEL`);
  for (const row of rows) {
    console.log(`${pad(row.name, 20)} ${pad(row.ci_count, 5)} ${pad(row.reconciled_count, 6)} `
      + `${pad(row.declared_only_count, 5)} ${pad(row.observed_only_count, 5)} ${pad(row.stale_count, 5)} ${row.label}`);
  }
}

function ownCommand() {
  if (values.owner == null) throw new Error("--owner is required");
  const ownership = { owner: values.owner, actor: ACTOR };
  if (values.business != null) ownership.business = values.business;
  if (values.note != null) ownership.note = values.note;
  const row = useStore((db) => ownCI(db, positionals[1], ownership));
  console.log(`${row.ci_key} owned by ${row.owned_by || "unowned"}`
    + `${row.business_owner ? ` · business ${row.business_owner}` : ""}`);
}

function linkCommand() {
  const row = useStore((db) => addManualRelationship(db, positionals[1], positionals[2], values.type, {
    actor: ACTOR, allowedTypes: settings.relationshipTypes,
  }));
  console.log(`${row.from_key} --${row.type}--> ${row.to_key} [manual]`);
}

function printReport(report, { latest = false } = {}) {
  if (values.json) return console.log(JSON.stringify(report, null, 2));
  console.log(`${latest ? "LATEST REPORT" : "DRY RUN"} · ${report.generatedAt}`);
  console.log(`${report.counts.observed_only} observed_only · ${report.counts.stale} stale`);
  console.log("\ndeclared_only:");
  for (const row of report.declared_only || []) console.log(`  ${row.ci_key} ? ${row.name}`);
  console.log("\nobserved_only:");
  if (!report.observed_only.length) console.log("  none");
  for (const row of report.observed_only) console.log(`  ${row.ci_key} · ${row.name}`);
  console.log("\nstale:");
  if (!report.stale.length) console.log("  none");
  for (const row of report.stale) console.log(`  ${row.ci_key} · ${row.name}`);
}

async function driftCommand() {
  const report = readLatestReport(settings.reportsDir);
  if (report) return printReport(report, { latest: true });
  const result = await syncCMDB({ settings, apply: false, actor: ACTOR });
  printReport(result.report);
}

function help() {
  console.log(`${settings.name} · typed local configuration management database

  avalanche-estate sync [--apply]                         dry-run by default
  avalanche-estate list [--class C] [--status ${CI_STATUSES.join("|")}] [--json]
  avalanche-estate show <ci_key> [--json]
  avalanche-estate tree <ci_key> [--depth N] [--json]      breadth-first, default depth ${DEFAULT_TREE_DEPTH}
  avalanche-estate classes [--json]
  avalanche-estate own <ci_key> --owner X [--business Y] [--note TEXT]
  avalanche-estate link <from_key> <to_key> --type ${settings.relationshipTypes.join("|")}
  avalanche-estate drift [--json]

  avalanche-estate init                      create config in the data directory
  avalanche-estate desk                      start the local desk
  avalanche-estate demo [--reset] [--seed-only]  isolated Juniper Trail Studio demo

  Global flags: --data-dir PATH, --actor ID, --help
  Actor: --actor > AVALANCHE_ESTATE_USER > actors.default > human:<OS username>
  Config: AVALANCHE_ESTATE_CONFIG or <dataDir>/config.mjs
  Data directory: ${dataDir}
  Override: AVALANCHE_ESTATE_DATA_DIR
  Desk: 127.0.0.1:${settings.desk.port}; AVALANCHE_ESTATE_DESK_PORT override
  db: ${DB_PATH}`);
}

try {
  switch (command) {
    case "desk": await startDesk({ settings, actor: ACTOR }); break;
    case "sync": await syncCommand(); break;
    case "list": listCommand(); break;
    case "show": showCommand(); break;
    case "tree": treeCommand(); break;
    case "classes": classesCommand(); break;
    case "own": ownCommand(); break;
    case "link": linkCommand(); break;
    case "drift": await driftCommand(); break;
    case "help": help(); break;
    default: throw new Error(`unknown command: ${command}`);
  }
  if (!values.json) console.log(STAMP);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

}
