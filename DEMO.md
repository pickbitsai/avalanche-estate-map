<!-- SPDX-License-Identifier: Apache-2.0
Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits. -->
# A 60-second walkthrough

Run `npm ci`, then `npm run demo -- --reset`. Open http://127.0.0.1:4180. The terminal and desk show a DEMO banner. All people, businesses and data are synthetic.

Juniper Trail Studio is a two-person software and content shop in Flagstaff, Arizona. Founders Priya Natarajan and Owen Castellanos work with agent:scout, agent:builder and agent:scribe. Eight products and their services have two months of recorded changes.

| Time | Show |
| --- | --- |
| 0–15 seconds | Open CI browser. Select Cedar Vault. Show technical owner Owen, business owner Priya, and the archive-maintenance handoff in Activity. |
| 15–30 seconds | Expand Related. Show product-to-engine dependencies, the listener and scheduled job. Select a product and compare its declaration-backed status with the service evidence. |
| 30–45 seconds | Open Drift. Cedar Vault's declared port 4306 is absent from the latest evidence. Pine Post's daily job is absent. Port 4399 is an unexpected listener. Preview Room was retired and is stale. Inspect the evidence timestamps. |
| 45–60 seconds | Open Classes: all seven classes have records. Return to a CI and edit ownership or add a manual relationship. Reopen it to see the attributed activity. |

The demo writes only to `.test-tmp/demo/`, or the explicit `--data-dir` path. It ignores instance config, source commands, scheduler and environment defaults; it uses recorded in-memory observations and always serves port 4180. No live services are scanned or modified. `--seed-only` skips the desk. Re-running preserves edits; `--reset` reseeds only a recognized demo directory. A fresh directory may contain only the untouched config created by `init`. Stop the desk before resetting.

Inspect `.test-tmp/demo/reports/` for nine dated drift reports, each stamped “Made with Avalanche Estate Map by PickBits”. Reports are regenerated only by an applied CLI sync. `node bin/avalanche-estate.mjs --data-dir .test-tmp/demo list` and `node bin/avalanche-estate.mjs --data-dir .test-tmp/demo drift` inspect the seed without starting a server. A live sync in this directory uses the disabled provider settings and cannot reproduce the recorded demo observations; use reset to restore the walkthrough.
