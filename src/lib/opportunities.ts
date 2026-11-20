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

// The deadline board. Day counts are worked out in the browser from each
// closing date, because the site is static and a count made at build time
// goes stale. Dates are calendar days.

const DAY_MS = 24 * 60 * 60 * 1000;
/** The bar on the board fills over this many days before a deadline. */
export const HORIZON_DAYS = 90;
/** A call closing within this many days counts as closing soon. */
export const SOON_DAYS = 30;

/** Today's calendar date where the reader is, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Whole days from `today` to `deadline` (both YYYY-MM-DD); negative once it has passed, null if either is not a date. */
export function daysUntil(deadline: string, today: string): number | null {
  const a = Date.parse(`${deadline}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/** How near a deadline is, as a step on the data ramp: 1 (far off) to 4 (this week). */
export function urgency(days: number): 1 | 2 | 3 | 4 {
  if (days <= 7) return 4;
  if (days <= SOON_DAYS) return 3;
  if (days <= 60) return 2;
  return 1;
}

/** How much of the bar is filled, 2 to 100: fuller as the deadline nears, full on the day. */
export function barFill(days: number): number {
  const part = 1 - Math.min(Math.max(days, 0), HORIZON_DAYS) / HORIZON_DAYS;
  return Math.max(2, Math.round(part * 100));
}

/** "1 day left", "10 days left". */
export const daysLeftUnit = (days: number) => (days === 1 ? 'day left' : 'days left');

const date = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });
/** "12 March 2099" */
export const closingDate = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });
/** The day of the month, "12". */
export const closingDay = (iso: string) => date(iso, { day: 'numeric' });
/** "Mar 2099" */
export const closingMonth = (iso: string) => date(iso, { month: 'short', year: 'numeric' });
