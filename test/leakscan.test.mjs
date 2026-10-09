// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from './leakscan.mjs';
const cases = [
  ['drive forward', 'Q:' + '/private/records', 'absolute drive path'],
  ['drive backward', 'Q:' + '\\private\\records', 'absolute drive path'],
  ['private workspace', 'pickbits' + '-services', 'private workspace name'],
  ['private domain', 'pickbits' + '.ai', 'private identity'],
  ['api key', 'sk-' + 'a'.repeat(32), 'credential literal'],
  ['alternate api key', 'sk-' + 'ant-' + 'a'.repeat(32), 'credential literal'],
  ...['p','o','u','s','r'].map(char => [`source token ${char}`, 'gh' + char + '_' + 'a'.repeat(32), 'credential literal']),
  ['chat token', 'xox' + 'b-' + 'a'.repeat(32), 'credential literal'],
  ['cloud key', 'AK' + 'IA' + 'Z'.repeat(16), 'credential literal'],
  ['private key', '-----BEGIN ' + 'PRIVATE KEY-----', 'credential literal'],
  ['rsa key', '-----BEGIN RSA ' + 'PRIVATE KEY-----', 'credential literal'],
  ['email', 'person' + '@' + 'invalid.test', 'non-synthetic email'],
  ['short phone', '777' + '-1234', 'non-synthetic phone'],
  ['phone', '+1' + '202' + '777' + '1234', 'non-synthetic phone'],
];
for (const [label, value, rule] of cases) test(`leakscan catches ${label}`, () => {
  assert.ok(scanText(value).some(finding => finding.endsWith(rule)));
});
test('leakscan accepts synthetic identities and the documented example cloud key', () => {
  assert.deepEqual(scanText('Juniper Trail Studio; Priya Natarajan; Owen Castellanos; agent:scout; priya@example.com; owen@example.org; studio@example.net; (928) 555-0100; 928-555-0199; 555-0150; AKIAIOSFODNN7EXAMPLE'), []);
});
