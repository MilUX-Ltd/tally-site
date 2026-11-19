// Acceptance tests: funding calls and opportunities. Members-only items are
// never published; the build refuses anything outside the contract.
// Committed failing before the build. Not edited after that commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slimClusters, slimOpportunities } from '../../scripts/fetch-data.mjs';
import type { ClustersData } from '../../src/lib/clusters';
import { filterOpportunities, parseFilter, filterQuery, type OpportunitiesData } from '../../src/lib/opportunities';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const clusters = slimClusters(read('../fixtures/clusters.json')) as ClustersData;
const raw = read('../fixtures/opportunities.json');
const item = { kind: 'funding', cluster: 'LRDSC', deadline: '2099-03-12', time: null, title: 'T', summary: 'S', link: 'https://example.org/t' };
const doc = (o: object) => ({ as_of: '2099-01-01', opportunities: [o] });

describe('funding calls and opportunities', () => {
  it('refuses opportunities that carry anything outside the contract', () => {
    expect((slimOpportunities(doc(item), clusters, '2099-01-01') as OpportunitiesData).opportunities).toEqual([item]);
    for (const extra of [{ audience: 'members' }, { audience: 'public' }, { source: 'email' }, { received: '2099-01-01' }, { id: 'i1' }, { text: 'x' }, { post: 'https://example.org/p' }, { also: ['WalesDSC'] }]) {
      expect(() => slimOpportunities(doc({ ...item, ...extra }), clusters, '2099-01-01')).toThrow(/contract/i);
    }
    expect(() => slimOpportunities(doc({ ...item, kind: 'event' }), clusters, '2099-01-01')).toThrow();
    expect(() => slimOpportunities(doc({ ...item, cluster: 'NOPE' }), clusters, '2099-01-01')).toThrow();
    expect(() => slimOpportunities(doc({ ...item, title: '' }), clusters, '2099-01-01')).toThrow();
    expect(() => slimOpportunities(doc({ ...item, deadline: '12 March' }), clusters, '2099-01-01')).toThrow();
    expect(() => slimOpportunities({ as_of: '2099-01-01' }, clusters, '2099-01-01')).toThrow();
    // An item without a safe public link is not published.
    expect((slimOpportunities(doc({ ...item, link: 'javascript:alert(1)' }), clusters, '2099-01-01') as OpportunitiesData).opportunities).toEqual([]);
    expect((slimOpportunities(doc({ ...item, link: null }), clusters, '2099-01-01') as OpportunitiesData).opportunities).toEqual([]);
  });

  it('drops past opportunities and sorts by deadline at build', () => {
    const out = slimOpportunities(raw, clusters, '2026-11-19') as OpportunitiesData;
    expect(out.opportunities.map((o) => o.title)).toEqual([
      'Fixture AI deployment fund',
      'Fixture request for information',
      'Fixture security reviews',
      'Fixture rolling supplier list',
    ]);
    expect(JSON.stringify(out)).not.toContain('Fixture closed grant');
    const later = slimOpportunities(raw, clusters, '2099-04-01') as OpportunitiesData;
    expect(later.opportunities.map((o) => o.deadline)).toEqual(['2099-04-01', '2099-05-30', null]);
  });

  it('reads the filter from the URL and ignores unknown values', () => {
    const ids = clusters.clusters.map((c) => c.id);
    expect(parseFilter('cluster=SCRDSC&kind=funding', ids)).toEqual({ cluster: 'SCRDSC', kind: 'funding' });
    expect(parseFilter('cluster=NOPE&kind=grant', ids)).toEqual({ cluster: null, kind: null });
    expect(parseFilter('cluster=<script>', ids)).toEqual({ cluster: null, kind: null });
    expect(filterQuery({ cluster: null, kind: null })).toBe('');
    expect(filterQuery({ cluster: 'LRDSC', kind: 'opportunity' })).toBe('cluster=LRDSC&kind=opportunity');
    const list = (slimOpportunities(raw, clusters, '2026-11-19') as OpportunitiesData).opportunities;
    expect(filterOpportunities(list, { cluster: 'SCRDSC', kind: null }).map((o) => o.title)).toEqual(['Fixture request for information', 'Fixture security reviews']);
    expect(filterOpportunities(list, { cluster: 'SCRDSC', kind: 'funding' }).map((o) => o.title)).toEqual(['Fixture security reviews']);
    expect(filterOpportunities(list, { cluster: null, kind: 'opportunity' }).map((o) => o.title)).toEqual(['Fixture request for information', 'Fixture rolling supplier list']);
  });
});
