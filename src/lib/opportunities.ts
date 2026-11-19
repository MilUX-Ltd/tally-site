// Funding calls and opportunities shared by the regional clusters, built from
// the data repo (scripts/fetch-data.mjs). Public items only: members-only
// items are never published. Plain TypeScript, no framework imports.

export type OpportunityKind = 'funding' | 'opportunity';

export interface Opportunity {
  kind: OpportunityKind;
  cluster: string;
  /** YYYY-MM-DD, or null when the item is open-ended. */
  deadline: string | null;
  time: string | null;
  title: string;
  summary: string | null;
  link: string;
}

export interface OpportunitiesData {
  as_of: string;
  opportunities: Opportunity[];
}

export interface OpportunityFilter {
  cluster: string | null;
  kind: OpportunityKind | null;
}

export const KIND_LABELS: Record<OpportunityKind, string> = { funding: 'Funding call', opportunity: 'Opportunity' };
const KINDS = new Set<string>(['funding', 'opportunity']);

/** The filter held in a query string; unknown clusters and kinds are ignored. */
export function parseFilter(query: string, clusterIds: string[]): OpportunityFilter {
  const params = new URLSearchParams(query);
  const cluster = params.get('cluster');
  const kind = params.get('kind');
  return {
    cluster: cluster && clusterIds.includes(cluster) ? cluster : null,
    kind: kind && KINDS.has(kind) ? (kind as OpportunityKind) : null,
  };
}

/** The query string for a filter; empty for no filter. */
export function filterQuery(filter: OpportunityFilter): string {
  const params = new URLSearchParams();
  if (filter.cluster) params.set('cluster', filter.cluster);
  if (filter.kind) params.set('kind', filter.kind);
  return params.toString();
}

export function matches(o: Pick<Opportunity, 'cluster' | 'kind'>, filter: OpportunityFilter): boolean {
  return (!filter.cluster || o.cluster === filter.cluster) && (!filter.kind || o.kind === filter.kind);
}

export function filterOpportunities(list: Opportunity[], filter: OpportunityFilter): Opportunity[] {
  return list.filter((o) => matches(o, filter));
}

export function countText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} funding calls and opportunities.`;
}
