// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import baseConfig from "../config.example.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEST_TMP = join(HERE, "..", ".test-tmp");
export const FIXTURE_MANIFEST = JSON.parse(readFileSync(join(HERE, "fixtures", "engines.json"), "utf8"));
export const FIXTURE_PRODUCTS = JSON.parse(readFileSync(join(HERE, "fixtures", "products.json"), "utf8"));

export function fixture(t, { staleDays = 2, products = false } = {}) {
  mkdirSync(TEST_TMP, { recursive: true });
  const dir = mkdtempSync(join(TEST_TMP, "estate-test-"));
  const productSource = join(dir, "products.json");
  if (products) writeFileSync(productSource, `${JSON.stringify(FIXTURE_PRODUCTS, null, 2)}\n`, "utf8");
  const settings = {
    ...baseConfig,
    estateRoot: dir,
    sources: { ...baseConfig.sources, manifest: { path: join(HERE, "fixtures", "engines.json") }, products: { path: products ? productSource : null } },
    dataDir: dir, db: join(dir, "estate.db"),
    reportsDir: join(dir, "reports"),
    staleDays,

  };
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    settings,
    manifest: structuredClone(FIXTURE_MANIFEST),
    products: structuredClone(FIXTURE_PRODUCTS),
  };
}

export function observations({ ports = [], tasks = {} } = {}) {
  return {
    ports: { complete: true, listeners: ports, note: `${ports.length} fixture listener(s)` },
    tasks: { complete: true, tasks: new Map(Object.entries(tasks)), note: `${Object.keys(tasks).length} fixture task(s)` },
  };
}
