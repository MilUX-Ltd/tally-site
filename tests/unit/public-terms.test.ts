import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BLOCKED_HASHES, findBlocked } from '../../scripts/check-public-terms.mjs';

describe('public-terms guard', () => {
  it('holds hashes, not words', () => {
    for (const h of BLOCKED_HASHES as Set<string>) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('finds a blocked one-word term by its hash, whatever the case', () => {
    const word = 'zzqtestterm';
    (BLOCKED_HASHES as Set<string>).add(createHash('sha256').update(word).digest('hex'));
    expect(findBlocked('Mentions ZZQTESTTERM here')).toHaveLength(1);
  });
  it('finds a blocked two-word phrase', () => {
    (BLOCKED_HASHES as Set<string>).add(createHash('sha256').update('alpha bravo').digest('hex'));
    expect(findBlocked('the Alpha  Bravo phrase')).toHaveLength(1);
  });
  it('passes ordinary text', () => {
    expect(findBlocked('An open map of UK defence capability.')).toHaveLength(0);
  });
});
