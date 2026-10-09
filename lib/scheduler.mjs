// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// schtasks /query /fo CSV /nh uses three positional columns, independent of header language.
export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === '') quoted = !quoted;
      else throw new Error('malformed scheduler CSV quote');
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(field); field = '';
      if (char !== ',') {
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        if (char === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += char;
  }
  if (quoted) throw new Error('unterminated scheduler CSV field');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
export const taskIdentity = name => String(name).replace(/^\\/, '');
export function parseScheduledTasks(text) {
  const tasks = new Map();
  for (const row of parseCSV(text)) {
    if (row.length !== 3 || !row[0].trim()) throw new Error('expected three schtasks CSV columns');
    const name = taskIdentity(row[0]);
    tasks.set(name, { name, nextRun: row[1], status: row[2] });
  }
  return tasks;
}
export async function readScheduledTasks({ run, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('windows-task-scheduler requires Windows');
  const result = await run(['schtasks.exe', '/Query', '/FO', 'CSV', '/NH']);
  if (result.error || result.code !== 0) throw new Error(result.error?.message || result.stderr || `schtasks exited ${result.code}`);
  return parseScheduledTasks(result.stdout);
}
