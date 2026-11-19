import { describe, expect, it } from 'vitest';
import { fromFixture } from '../../scripts/build-history.mjs';

describe('history months without an update', () => {
  it('marks a month carried forward from the month before', () => {
    const h = fromFixture();
    expect(h.months.map((m: { month: string; carried: boolean }) => [m.month, m.carried])).toEqual([
      ['2026-06', false],
      ['2026-07', false],
      ['2026-08', false],
      ['2026-09', true],
      ['2026-10', false],
      ['2026-11', false],
    ]);
  });
});
