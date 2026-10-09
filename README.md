<!-- SPDX-License-Identifier: Apache-2.0
Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits. -->
How do I know what is actually running in my company's stack, who owns each piece, and when what is declared drifts from what is live? Avalanche Estate Map reads your declared inventory, compares it with optional local listener and scheduled-task evidence, and keeps ownership, relationships and dated drift reports in files you control.

## What it does

Avalanche Estate Map 0.1.0 is a ServiceNow-shaped local configuration inventory for a founder working with AI agents. It projects seven typed configuration-item (CI) classes: engines, satellites, server endpoints, scheduled tasks, data stores, repositories and products. Stable keys preserve identity across scans. Technical and business owners are separate, manual relationships survive reconciliation, and SQLite events record the actor for every applied sync, ownership change and relationship edit.

The CLI and local desk call the same library functions. The desk includes a CI browser, ownership editor, relationships, cycle-safe related-item traversal, activity history, drift and class counts. Sync is CLI-only and defaults to a dry run. JSON CLI exports, reports and the desk footer carry “Made with Avalanche Estate Map by PickBits”. There are zero dependencies, no telemetry and no external runtime assets.

## What it does not do

- It does not deploy, restart or repair services, execute registry start commands, or change scheduled tasks.
- It does not discover cloud accounts, containers, remote hosts or software packages. Endpoint identities use a single host's port namespace.
- A listening port does not prove the expected process owns it or that a service is healthy. A task's presence does not prove its last execution succeeded. Task status is recorded without interpreting localized text.
- It is not an authentication system. Actor labels are supplied attribution, not verified identities.
- It does not schedule scans itself, encrypt the database, or provide a hosted service.

## A five-minute start

Install Node 22.13 or newer (Node 22's built-in SQLite may print an experimental warning), open a terminal in this repository, then run:

```sh
npm ci
npm run demo
```

Open **http://127.0.0.1:4180**. Stop with Ctrl+C. `npm run demo -- --reset` restores the walkthrough. All demo people, businesses and data are synthetic: Juniper Trail Studio, founders Priya Natarajan and Owen Castellanos, three AI actors and eight products with two months of activity. See [DEMO.md](DEMO.md).

For your own instance:

```sh
node bin/avalanche-estate.mjs init
node bin/avalanche-estate.mjs --help
```

Edit the printed data directory's `config.mjs`, copy and adapt the example registries there, then:

```sh
node bin/avalanche-estate.mjs sync
node bin/avalanche-estate.mjs sync --apply --actor agent:scout
npm run desk
```

The package's CLI bin is `avalanche-estate`; use it after linking/installing the package, or use the explicit Node entry above. A busy allocated desk port is an error; no other port is tried.

## Commands

| Command | Behavior |
| --- | --- |
| `init` | Create `<dataDir>/config.mjs` from the example if absent. Never overwrite it. |
| `sync [--apply] [--json]` | Project declarations and collect configured evidence; write only with `--apply`. |
| `list [--class C] [--status S] [--json]` | Read CIs, optionally filtered. |
| `show <ci_key> [--json]` | Attributes, ownership, relationships and events. |
| `tree <ci_key> [--depth N] [--json]` | Bidirectional breadth-first traversal, default depth 3, cycle-safe. |
| `classes [--json]` | Counts by class and reconciliation status. |
| `own <ci_key> --owner X [--business Y] [--note TEXT]` | Set ownership; empty values clear fields. |
| `link <from_key> <to_key> --type T` | Add an allowed manual relationship idempotently. |
| `drift [--json]` | Read the latest dated report; if absent, compute a dry run. |
| `desk` | Start the local desk using config. |
| `demo [--reset] [--seed-only]` | Isolated demo, optionally without serving HTTP. |

Every command accepts `--data-dir PATH` and `--actor ID`. Actor precedence is `--actor`, `AVALANCHE_ESTATE_USER`, `config.actors.default`, then `human:` plus `os.userInfo().username`. The demo defaults to `human:priya` and ignores instance environment overrides.

JSON list/classes exports wrap their arrays as `{ stamp, rows }`; show/tree add `stamp` to their object. Sync returns `{ stamp, applied, counts, sources, skipped, projected, report }`. Library CI/store return shapes remain unchanged.

## Configuration and data isolation

Data-directory precedence is `--data-dir`, then `AVALANCHE_ESTATE_DATA_DIR`, then the platform default. On Windows the default is `new/avalanche-data/estate-map` under the home drive's root; on other platforms it is `~/.local/share/avalanche/estate-map`, using `os.homedir()`. The resolved path is printed by `--help` and at desk startup. It is created on first use.

The real config is `<dataDir>/config.mjs`, overridden by `AVALANCHE_ESTATE_CONFIG`. Missing config falls back to [config.example.mjs](config.example.mjs) with a one-line notice and disabled sources. Relative source paths, command cwd and estateRoot resolve against the data directory, including when the config itself is at an override path. Registry roots instead resolve against their registry file's directory. Config is trusted executable JavaScript; validation reports invalid keys clearly.

Repository directories are rejected as data directories. `.test-tmp/` is the explicit test/demo exception and is ignored by Git. Databases, reports, config, source copies, logs and caches never belong in tracked files. The application creates no log or cache files. The root `index.html` is externally generated, ignored and never used by the desk.

| Config key | Meaning / default |
| --- | --- |
| `name` | CLI title, `Avalanche Estate Map`. |
| `estateRoot` | Fallback metadata base for in-memory declarations without a configured registry path, `.` relative to dataDir. File sources use their own `root`. |
| `db` | Relative database filename, `estate.db`; absolute paths and escapes from dataDir are rejected. |
| `staleDays` | Non-negative age threshold, 30 days; stale strictly after the boundary. |
| `actors.default` | Default actor string or `null` for OS identity. |
| `classes[]` | `name`, UI `label`, `description`, optional `observedBy` (`ports`, `tasks`, `none`). Preserve the seven built-in class names. |
| `identificationRules` | Class name → ordered identifying attributes: engine/satellite `manifest_id`, endpoint `port`, task `task_name`, data_store/repo `path`, product `slug`. Changing rules creates new identities. |
| `relationshipTypes` | Allowed types: `runs`, `scheduled_by`, `belongs_to`, `depends_on`, `feeds`. The first two are required for projection. |
| `sources.manifest.path` | Optional estate registry JSON; `null` disables it. |
| `sources.manifest.root` | Base for engine/satellite `dir` metadata. Default `null` means the registry's directory. Relative values resolve against that directory; absolute roots are accepted. |
| `sources.estate.path` | Optional second registry with the same schema; `null` disables it. Manifest takes precedence on duplicate identities. |
| `sources.estate.root` | Independent root for the additional registry, with the same rules as manifest.root. |
| `sources.products.path` | Optional registry JSON with `products[]` or `games[]`; `null` disables it. |
| `sources.portCheck.command` | `null` disables live listener collection, or `{ argv, cwd }` as described below. |
| `sources.scheduler.provider` | `none` (default) or `windows-task-scheduler`. |
| `desk.host` | Must be `127.0.0.1`. |
| `desk.port` | Allocated port 4180; explicit `AVALANCHE_ESTATE_DESK_PORT` override, never range scanning. |
| `desk.title` | Browser and desk title, `Avalanche Estate Map`. |

### Estate registry schema

Both `sources.manifest` and `sources.estate` accept `{ path, root }` and use [examples/estate.example.json](examples/estate.example.json). Each registry's engine and satellite `dir` resolves against its root, defaulting to the registry's own directory. Absolute `dir` paths remain absolute. Roots are metadata bases, never recursively scanned. The example declares eight Juniper Trail Studio engines with ports in 4300–4399. The file is a JSON object with `engines`, `satellites` and optional `repos` arrays; empty arrays explicitly declare an empty registry. `company` is optional descriptive metadata.

An engine has `id` (required stable string), `owner` (technical actor), `dir`, `name`, optional `note` and `url`, and `servers[]` of `{ port, what, start }`. Optional `businessOwner` sets initial business ownership. `nodes[]` can describe manual work without any scheduled tasks. Engines, satellites and their nodes may declare `tasks`, `jobs` or `schedules`, each as one entry or an array. An entry is a non-empty task-name string or an object with a name in `task_name`, `taskName`, `task`, `name` or `id` (first present key wins). These are task identities, not cron expressions; extra scheduling metadata is not interpreted or executed. Task names preserve scheduler folders; a single leading backslash is normalized away. `class`, `role` and `hasOwnDashboard` are optional metadata. Owner defaults initialize new CIs; later manual ownership survives changes to the source. See the mixed-shape [test fixture](test/fixtures/mixed-tasks.json).

A satellite has `id`, `owner`, optional `businessOwner`, `dir`, `name`, `note`, optional `port` and/or `url`, plus optional `servers[]`. A satellite needs no top-level port. Only an explicit port, a server entry or a loopback URL with a port produces an endpoint. A satellite without id but with `path` is a data store. Optional `repos[]` entries have `path`, `name` and `owner`. Paths and start commands are descriptive; no source contents are written back and no start command is executed.

Engines and satellites have `runs` edges to endpoints. Tasks have `scheduled_by` edges to their declaring engine or satellite. Product-to-engine and other business relationships are manual. Duplicate identities use the first declaration. Malformed entries are skipped individually with warnings naming the owning engine/satellite, node and entry (or its index); healthy siblings still project. Missing optional fields produce no warning. Declared relationship removal is deferred on scans with skipped entries. Use one manifest as the authoritative registry when possible.

### Products schema

[examples/products.example.json](examples/products.example.json) uses `{ "products": [...] }`; `{ "games": [...] }` is also accepted with identical item mapping. The first valid array is used in this order: `products`, then `games`. A `products[]` array takes precedence even when empty; the two arrays are never merged.

Each item requires non-empty `slug` and `name` strings. The slug identifies the product CI. Optional fields retained in CI attributes are `genre`, `playUrl`, `platforms` (string array), `tags` (string array), `featured`, `connected`, `telemetry` (descriptive string array only), and `openSource`. Missing booleans default to false and arrays to empty. These fields never initiate runtime telemetry or connections. Other fields, including catalog `id`, `distribution`, `cover` and ownership fields, are ignored; technical and business ownership are managed on the CI and survive subsequent syncs. Duplicate slugs are skipped. A product is declaration-backed (`observedBy: none`), so presence in either registry format means reconciled, not that its URL was health-checked.

### Live sources and reconciliation

`sources.portCheck.command` is optional: `{ argv: ["node", "check-ports.mjs"], cwd: ".", timeoutMs: 120000 }`. The command runs without a shell, from the configured cwd, with bounded output. Optional `timeoutMs` defaults to 120000 (two minutes) and accepts integers from 1 to 300000. Human lines may surround the JSON, including a trailing summary. The reader takes the last complete JSON value from stdout, also accepting independently parseable JSON lines. Supported payloads are `{ "listening": [4300, 4301] }`, a bare integer port array, or an array of snapshot objects whose last object has `listening[]`. Integers must be valid TCP ports; arrays are deduplicated and sorted. A complete listening array is accepted even with a nonzero allocation-check exit code, which is reported. Process termination, missing/invalid JSON or invalid ports produce `port check unavailable: <reason>` and no new listener observations. No bundled collector scans your machine.

`windows-task-scheduler` reads `schtasks.exe /Query /FO CSV /NH` directly. The CSV reader handles quotes, embedded commas and line breaks, root tasks and folder names. It records task name, next-run text and status text. It does not parse localized dates or infer job success. On non-Windows systems, command failures and malformed CSV are reported as unavailable. `none` performs no scheduler access.

Missing paths disable sources with explicit messages. Missing/unreadable files are reported as unavailable and do not crash sync. Missing evidence preserves prior statuses and relationships conservatively; it is not proof of absence. Always read the report's `sources` and timestamps before treating a prior reconciled status as current evidence. If either configured estate registry is unavailable, declared relationship removal is deferred.

The unchanged database status vocabulary is `reconciled`, `declared_only`, `observed_only`, `stale`. Unobserved declaration classes stay declared-only by default. Declared-only means no matching observation, including disabled or unavailable collectors. Records are never deleted when declarations disappear; after `staleDays` they can become stale when the relevant sources are available. A completed scan does not erase manually assigned ownership or relationships.

Applied scans write `<dataDir>/reports/drift-<YYYY-MM-DD>.json` using the UTC date. The report contains `stamp`, `generatedAt`, `counts`, `declared_only`, `observed_only`, `stale`, and source messages; drift entries contain identity plus attribute/timestamp evidence. A second applied scan on the same day replaces that day's report; the database's attributed events remain append-only. Dry runs create neither a database nor a report.

## How it fits the suite

Avalanche Estate Map sits alongside Avalanche Service Desk, Avalanche Roadmap, Avalanche Customer Cases, Avalanche Assets & Spend and Avalanche Service Catalog. It works alone and has no required sibling files or cross-module endpoints. The read-only `lib/panel.mjs` adapter retains `id`, `title`, `nav`, `collect`, `stat`, `render`; the stable id remains `cmdb`. Missing or unreadable databases return `null` from collect, and the panel never scans or mutates.

## Security model

The desk binds only to **127.0.0.1**. There is **no authentication**: do not expose it through a network listener, proxy or tunnel. Exact Host checks, a per-process POST token, matching same-origin Origin, a 1 MiB body cap, strict CSP with static scripts, nosniff, same-origin referrer policy and DENY framing protect the local browser boundary. They do not protect against other processes on the machine. Keep the private data directory protected by OS permissions. See [SECURITY.md](SECURITY.md).

## Checks and licensing

```sh
npm test
npm run leakscan
node test/consumer-install.mjs
npm run preflight
```

Preflight runs the tests, generic leak scanner and a clean-consumer install using the normal npm cache offline. The consumer copies only git-trackable files, exercises the actual bin, initializes config, seeds the demo, and runs list/drift without opening a port. Tests use `.test-tmp/` and prohibit network operations and port binding. The public scanner never embeds private names; a separate private-name scan is an external publishing responsibility.

Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). The package stays `private: true` to prevent accidental registry publication.

Questions and bugs: open a GitHub issue.
