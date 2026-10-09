// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// Extract complete JSON frames while ignoring surrounding human-readable output.
export function lastJSONValue(stdout) {
  const text = String(stdout).replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('command produced no stdout');
  let latest, found = false, lastEnd = -1;
  let start = -1, stack = [], quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) {
      if (char === '{' || char === '[') { start = i; stack = [char]; quoted = false; escaped = false; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      if (stack.at(-1) !== (char === '}' ? '{' : '[')) { start = -1; stack = []; continue; }
      stack.pop();
      if (!stack.length) {
        try { latest = JSON.parse(text.slice(start, i + 1)); found = true; lastEnd = i + 1; } catch { /* Human text can contain brackets. */ }
        start = -1;
      }
    }
  }
  // Also accept JSON lines, including primitives and a valid line after an unmatched log bracket.
  let offset = 0;
  for (const line of text.split('\n')) {
    const end = offset + line.length;
    if (end > lastEnd && line.trim()) try {
      latest = JSON.parse(line); found = true; lastEnd = end;
    } catch { /* A trailing summary is not part of the payload. */ }
    offset = end + 1;
  }
  if (!found) throw new Error('stdout contained no complete JSON value');
  return latest;
}

export function listenerPorts(stdout) {
  let value = lastJSONValue(stdout);
  // Accept a bare port array or a sequence of snapshot objects, using its last snapshot.
  if (Array.isArray(value) && value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) value = value.at(-1);
  const ports = Array.isArray(value) ? value : value?.listening;
  if (!Array.isArray(ports) || !ports.every(port => Number.isInteger(port) && port > 0 && port <= 65535)) throw new Error('last JSON value must contain listening[] or be an array of integer TCP ports');
  return [...new Set(ports)].sort((a, b) => a - b);
}
