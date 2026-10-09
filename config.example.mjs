// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
export default {
  name: 'Avalanche Estate Map', // Product title used by the CLI.
  estateRoot: '.', // Fallback root for in-memory declarations without a configured registry path.
  db: 'estate.db', // SQLite file relative to and contained within the data directory.
  staleDays: 30, // Days without a declaration or observation before a CI becomes stale.
  actors: { default: null }, // Default actor; null uses the current operating-system username.
  classes: [ // Each class has name (identity), label (UI), description and optional observedBy.
    { name: 'engine', label: 'Engine', description: 'A declared service engine.' },
    { name: 'satellite', label: 'Satellite', description: 'A supporting application or site.' },
    { name: 'server_endpoint', label: 'Server endpoint', description: 'A TCP listener identified by port.', observedBy: 'ports' },
    { name: 'scheduled_task', label: 'Scheduled task', description: 'A scheduled job declared by an engine.', observedBy: 'tasks' },
    { name: 'data_store', label: 'Data store', description: 'A durable local data path.' },
    { name: 'repo', label: 'Repository', description: 'A declared source repository.' },
    { name: 'product', label: 'Product', description: 'A product or service in the products registry.', observedBy: 'none' },
  ],
  identificationRules: { // Ordered attributes form a stable CI key; changing them creates new identities.
    engine: ['manifest_id'], // Engine identity from registry id.
    satellite: ['manifest_id'], // Satellite identity from registry id.
    server_endpoint: ['port'], // Endpoint identity on this one host.
    scheduled_task: ['task_name'], // Full scheduler task name including any folder.
    data_store: ['path'], // Data-store identity from the declared path.
    repo: ['path'], // Repository identity from the declared path.
    product: ['slug'], // Product identity from the products registry slug.
  },
  relationshipTypes: ['runs', 'scheduled_by', 'belongs_to', 'depends_on', 'feeds'], // Allowed relationship names.
  sources: { // Sources are read-only and paths resolve relative to the data directory.
    manifest: { path: null, root: null }, // Optional registry path; root defaults to its directory, or resolves relative to it.
    estate: { path: null, root: null }, // Optional additional registry with the same schema and independent root.
    products: { path: null }, // Optional JSON with products[] or games[]; products[] takes precedence; item mapping is identical.
    portCheck: { command: null }, // Optional { argv: ['node', 'check-ports.mjs'], cwd: '.', timeoutMs: 120000 }; accepts JSON amid human lines.
    scheduler: { provider: 'none' }, // Either none or windows-task-scheduler (read-only schtasks CSV).
  },
  desk: { // Local desk settings; no automatic port selection.
    host: '127.0.0.1', // Required loopback binding; cannot be changed.
    port: 4180, // Allocated port; explicit AVALANCHE_ESTATE_DESK_PORT override supported.
    title: 'Avalanche Estate Map', // Browser and desk title.
  },
};
