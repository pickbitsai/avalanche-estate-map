<!-- SPDX-License-Identifier: Apache-2.0
Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits. -->
# Security policy

Report vulnerabilities through GitHub private vulnerability reporting on this repository. Include the affected version, Node and operating-system versions, and a minimal synthetic reproduction. Do not include instance configuration, database records or credentials. Version 0.1.0 and the latest default-branch code are supported.

The desk binds only to 127.0.0.1. It has no user authentication and must not be exposed to a network, reverse proxy or public tunnel. Anyone with access to the machine account or another local process can read it and obtain its mutation token. Actor labels are audit attribution, not verified identities or access control.

Requests require the exact loopback Host and allocated port. POST requests additionally require the per-process token and an exact same-origin Origin header, JSON content type, and at most 1 MiB of body bytes. No forwarding headers are trusted. All responses set a restrictive CSP, nosniff, same-origin referrer policy and DENY framing. Scripts and styles are local static assets. There is no telemetry, analytics or runtime CDN loading.

Configuration modules execute trusted owner-controlled JavaScript. Configured port-check argv runs without a shell, with a two-minute default timeout (configurable up to five minutes) and bounded captured output. Only configure commands and files you trust. Registry start commands are metadata and are never executed. Scheduler access only queries schtasks CSV, with a 30-second timeout; this application never creates or changes scheduled tasks. Windows task visibility depends on the process account's permissions. Localized task status is kept as text.

The database, reports, source copies and real config belong in the private data directory. Apply OS permissions and private backups yourself; storage is not encrypted. SQLite uses a busy timeout and append-only event triggers. These prevent accidental edits through the application, not modification by a database administrator. Reports contain local paths and ownership details: do not publish them. A daily report is replaced on a second applied sync that UTC day; database events remain append-only. Report writing happens after the database transaction, so a filesystem failure can leave a committed sync without a matching report.

Tests and the consumer check prohibit network access and port binding. The public leak scanner uses only generic path, credential, email and phone rules; private-name scanning belongs outside the repository. Run preflight before publication.
