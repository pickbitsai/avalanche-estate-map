// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { fixture } from "./helpers.mjs";
import { openStore, withTransaction } from "../lib/store.mjs";

test("openStore migration is idempotent and events are database-enforced append-only", (t) => {
  const { settings } = fixture(t);
  const old = new DatabaseSync(settings.db);
  old.exec("CREATE TABLE cis (id INTEGER PRIMARY KEY)");
  old.close();

  for (let i = 0; i < 2; i++) {
    const db = openStore(settings.db, { classes: settings.classes });
    const columns = db.prepare("PRAGMA table_info(cis)").all().map((row) => row.name);
    for (const name of ["ci_key", "class", "status", "owned_by", "last_declared_at", "last_observed_at"]) {
      assert.ok(columns.includes(name), `migration must add ${name}`);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ci_classes").get().n, settings.classes.length);
    db.close();
  }

  const db = openStore(settings.db, { classes: settings.classes });
  assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
  db.prepare(`INSERT INTO events (at, entity, entity_id, kind, actor, detail)
    VALUES ('2026-01-01T00:00:00.000Z', 'ci', 'engine:test', 'test', 'test:actor', NULL)`).run();
  assert.throws(() => db.prepare("UPDATE events SET detail = 'changed' WHERE id = 1").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM events WHERE id = 1").run(), /append-only/);
  db.close();
});

test('rollback cannot mask the original error when SQLite has already ended a transaction', t => {
  const { settings } = fixture(t); const db = openStore(settings.db);
  const original = new Error('original failure');
  assert.throws(() => withTransaction(db, () => { db.exec('ROLLBACK'); throw original; }), error => error === original);
  db.close();
});
