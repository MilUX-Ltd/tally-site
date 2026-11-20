// Closed companies and defence companies formed and dissolved each year
// (D-iyz0k), from Companies House via the build (scripts/fetch-data.mjs).
// Plain TypeScript, build time only.
import { longDate } from './company-page';

export interface ClosedRecord {
  status: string;
  date: string | null;
}
export interface FlaggedRecord {
  status: string;
  detail: string | null;
}
export type TrendCounts = { total: number } & Record<string, number>;
export interface TrendYear {
  year: number;
  partial: boolean;
  formed: TrendCounts;
  dissolved: TrendCounts;
}
export interface Trend {
  codes: Record<string, string>;
  years: TrendYear[];
}
export interface CompaniesHouse {
  attribution: string;
  generated: string;
  closed: Record<string, ClosedRecord>;
  flagged: Record<string, FlaggedRecord>;
  trend: Trend;
}

const CLOSED_WORDS: Record<string, string> = {
  dissolved: 'dissolved',
  'converted-closed': 'closed',
  closed: 'closed',
  removed: 'removed from the register',
};
const FLAGGED_WORDS: Record<string, string> = {
  liquidation: 'in liquidation',
  administration: 'in administration',
  receivership: 'in receivership',
  'insolvency-proceedings': 'in insolvency proceedings',
  'voluntary-arrangement': 'in a voluntary arrangement',
};

/** "Companies House lists this company as dissolved on 14 May 2024." */
export function closedNote(rec: ClosedRecord): string {
  const what = CLOSED_WORDS[rec.status] ?? 'closed';
  const when = rec.date ? longDate(rec.date) : null;
  return `Companies House lists this company as ${what}${when ? ` on ${when}` : ''}.`;
}

/** "Companies House: in liquidation." */
export function flaggedNote(rec: FlaggedRecord): string {
  const what = FLAGGED_WORDS[rec.status] ?? (rec.detail === 'active-proposal-to-strike-off' ? 'proposed to be struck off the register' : 'not active');
  return `Companies House: ${what}.`;
}

/** The day before a date, the last complete day a partial year covers. */
function dayBefore(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** "2024", or "2026 to 19 November" for the year still running. */
export function yearLabel(y: TrendYear, generated: string): string {
  if (!y.partial) return String(y.year);
  const end = dayBefore(generated).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  return `${y.year} to ${end}`;
}

/** One sentence for the chart's accessible name: the span and the last full year. */
export function trendSummary(trend: Trend): string {
  const ys = trend.years;
  const full = [...ys].reverse().find((y) => !y.partial) ?? ys[ys.length - 1];
  return `Defence companies formed and dissolved each year, ${ys[0].year} to ${ys[ys.length - 1].year}. In ${full.year}, ${full.formed.total} formed and ${full.dissolved.total} dissolved.`;
}

/**
 * The years the page shows: the last ten full years and this year. Earlier
 * years are kept in the data, but Companies House has removed most companies
 * dissolved then, so their figures mislead.
 */
export const SHOWN_YEARS = 11;
export function recentTrend(trend: Trend, n = SHOWN_YEARS): Trend {
  return { codes: trend.codes, years: trend.years.slice(-n) };
}

export interface TrendBar {
  year: number;
  label: string;
  x: number;
  formed: { y: number; height: number; value: number };
  dissolved: { y: number; height: number; value: number };
  partial: boolean;
}
export interface TrendChart {
  width: number;
  height: number;
  base: number;
  bars: TrendBar[];
  ticks: { y: number; value: number }[];
  barWidth: number;
}

/** A round step for the scale: 1, 2 or 5 times a power of ten. */
function niceStep(max: number, steps = 4): number {
  const raw = Math.max(1, max) / steps;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
}

/** Paired bars per year, laid out at build time as SVG attributes (the CSP allows no style attributes). */
export function trendChart(trend: Trend, width = 720, height = 260): TrendChart {
  const left = 44;
  const right = 8;
  const top = 12;
  const base = height - 28;
  const max = Math.max(1, ...trend.years.flatMap((y) => [y.formed.total, y.dissolved.total]));
  const step = niceStep(max);
  const top_value = Math.ceil(max / step) * step;
  const scale = (v: number) => ((base - top) * v) / top_value;
  const slot = (width - left - right) / trend.years.length;
  const barWidth = Math.max(2, Math.min(18, slot * 0.36));
  const bars = trend.years.map((y, i) => {
    const x = left + i * slot + (slot - 2 * barWidth - 2) / 2;
    const f = scale(y.formed.total);
    const d = scale(y.dissolved.total);
    return {
      year: y.year,
      label: `'${String(y.year).slice(2)}`,
      x: Math.round(x * 10) / 10,
      formed: { y: Math.round((base - f) * 10) / 10, height: Math.round(f * 10) / 10, value: y.formed.total },
      dissolved: { y: Math.round((base - d) * 10) / 10, height: Math.round(d * 10) / 10, value: y.dissolved.total },
      partial: y.partial,
    };
  });
  const ticks = [];
  for (let v = 0; v <= top_value; v += step) ticks.push({ y: Math.round((base - scale(v)) * 10) / 10, value: v });
  return { width, height, base, bars, ticks, barWidth: Math.round(barWidth * 10) / 10 };
}
