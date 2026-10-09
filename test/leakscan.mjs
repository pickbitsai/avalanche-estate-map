// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export function scanText(text, path = 'text') {
  const findings = [];
  // Only generic public rules belong here. Private-name scanning stays outside this repository.
  const forbidden = ['pickbits' + '.ai'];
  text.split(/\r?\n/).forEach((line, index) => {
    const report = rule => findings.push(`${path}:${index + 1} ${rule}`);
    if (/\b[A-Z]:[\/\\](?!\/)/i.test(line)) report('absolute drive path');
    if (new RegExp('pickbits' + '-services', 'i').test(line)) report('private workspace name');
    if (/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{10,}|xox[a-z]-[A-Za-z0-9-]{10,}|AKIA(?!IOSFODNN7EXAMPLE)[0-9A-Z]{16})/.test(line) || /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(line)) report('credential literal');
    if (forbidden.some(word => line.toLowerCase().includes(word))) report('private identity');
    const emails = line.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    for (const email of emails) if (!/^example\.(com|org|net)$/i.test(email.split('@').at(-1))) report('non-synthetic email');
    const phones = line.match(/\+1\d{10}\b|(?:\+?1[ .-]?)?(?:\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|\b[2-9]\d{9}\b|\b\d{3}-\d{4}\b/g) ?? [];
    for (const phone of phones) {
      const digits = phone.replace(/\D/g, ''), national = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
      if (!/^(?:[2-9]\d{2})?55501\d{2}$/.test(national)) report('non-synthetic phone');
    }
  });
  return findings;
}
export async function leakscan() {
  const findings = []; let scanned = 0;
  const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean))];
  for (const file of files) {
    const full = resolve(root, file);
    const data = await readFile(full); if (data.includes(0)) continue;
    scanned++; findings.push(...scanText(data.toString('utf8'), relative(root, full).replaceAll('\\', '/')));
  }
  return { scanned, findings };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { scanned, findings } = await leakscan(); console.log(`leakscan: ${scanned} text files; ${findings.length} findings`);
  if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; } else console.log('PASS: no private paths, identities, credentials, emails or phones.');
}
