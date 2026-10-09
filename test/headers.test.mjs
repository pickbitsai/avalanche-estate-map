// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/config.mjs';
test('every first-party source starts with SPDX and the product copyright (after executable shebang)', () => {
  const files = execFileSync('git', ['ls-files','--cached','--others','--exclude-standard','-z'], { cwd: ROOT, encoding: 'utf8', windowsHide: true }).split('\0').filter(file => /\.(?:mjs|js|css|html)$/.test(file));
  assert.ok(files.length > 20);
  for (const file of files) {
    if (file === 'scripts/release-guard.mjs') continue; // vendored scanner keeps its upstream header
    const text = readFileSync(join(ROOT, file), 'utf8').replace(/^#![^\n]*\n/, '');
    assert.match(text.split('\n')[0], /SPDX-License-Identifier: Apache-2.0/, file);
    assert.match(text.split('\n')[1], /Copyright 2026 Mark Pickering and PICKBITS LLC\. Part of Avalanche Estate Map by PickBits\./, file);
  }
});
