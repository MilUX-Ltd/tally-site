// Fails if any tracked file contains a term that must never appear in this
// public repository. The terms are held as SHA-256 hashes of their lower-case
// form, so the list itself discloses nothing. Each run checks every one-, two-
// and three-word run of words in every tracked text file.
// To add a term: hash its lower-case form and append the hash below.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const BLOCKED_HASHES = new Set([
  "9b89025ce7a6d932b28f6e15132a70d402f723874a425e9b4c7cc3b179fa66ce",
  "10efe505d4967f4a018c4205e15019cc8f7b08c48fb1b47a40541b296767bd55",
  "a48f08493be0a6bf482d176056bd5212a3ca543c605553c8a596aa69a19ef214",
  "01aff0b9db366eb032b5376df6561e64abb8ad4dd628c1e01c0ffa0407c8088d",
  "c0335b42a668bc5714f44f1bfc840acdbab2d4c62bae222d0bf39fef7f54ece8",
  "04b88ecb5f1ff67f0a0ff8135b2373243c31f9c1531c967e80b54a98b43d2e87",
  "74fa0196e5bd7a0a37435ded20ef1ad285c10a2c09070d619edc3408eb97d7f9",
  "c2f6badfda77cf1abeb02781d906a50668a17a0b79d435b05f8dcb2444852ac9",
  "153032bfae92f71e480edd7d358727a700fadf630dc899fb84bfa9b085781443",
  "afe0bafbe651ddcffef38adbc7958609fd798ea179b6c9b242fa8ad4fc6027fa",
  "80d4b7e298b50e1ca8ef8ea89f7d730acbc82fc18769413f5988523850fd3b67",
  "42b61e0b723ffbc9474c00d2e01d34ad0a2d7b8ca6204df0957c674ccb172996"
]);

const hash = (s) => createHash('sha256').update(s).digest('hex');

export function findBlocked(text) {
  const words = text.toLowerCase().match(/[a-z0-9-]+/g) ?? [];
  const hits = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const phrase = words.slice(i, i + n).join(' ');
      if (BLOCKED_HASHES.has(hash(phrase))) hits.push({ index: i, words: n });
    }
  }
  return hits;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const failures = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    const hits = findBlocked(text);
    if (hits.length) failures.push(`${file}: ${hits.length} blocked term(s)`);
  }
  if (failures.length) {
    console.error('Public-terms check FAILED. Remove these before publishing:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log(`Public-terms check passed (${files.length} files).`);
}
