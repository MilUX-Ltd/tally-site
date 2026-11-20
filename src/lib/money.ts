// The Money view: where UK defence contract money goes. Plain helpers over
// money.json (built by the data repo from Contracts Finder and Find a Tender
// award notices, Open Government Licence v3.0; checked and copied into
// public/data/money.json by scripts/fetch-data.mjs). No framework imports.
import { UK_REGIONS } from './company-page';
import type { Company, Taxonomy } from './types';

export interface Award {
  buyer: string;
  date: string;
  title: string;
  url: string;
  value: number;
}

export interface Bucket {
  count: number;
  value: number;
}

export interface RegionBucket extends Bucket {
  tally_count: number;
  tally_value: number;
}

export interface MoneyData {
  attribution: string;
  /** Awards to Tally companies, keyed by the company's name in Tally. */
  companies: Record<string, Award[]>;
  excluded: { frameworks: number; non_gbp: number };
  generated: string;
  /** By year, then by country. */
  overseas: Record<string, Record<string, Bucket>>;
  period: { from: string; to: string };
  /** By year, then by region. */
  regions: Record<string, Record<string, RegionBucket>>;
  sources: string[];
  /** UK suppliers that could not be placed in a region, by year. */
  unplaced: Record<string, Bucket>;
  years: number[];
}

/** Tally's 12 UK regions, as the data names them. */
export const MONEY_REGIONS: readonly string[] = UK_REGIONS;

const trim = (s: string) => s.replace(/\.0$/, '');

/** Short sterling: £950, £100k, £2.6m, £2.4bn; never a trailing .0. */
export function formatMoney(value: number): string {
  const v = Math.max(0, Math.round(value));
  if (v < 1000) return `£${v}`;
  const k = Math.round(v / 1000);
  if (k < 1000) return `£${k}k`;
  const m = Math.round(v / 100_000) / 10;
  if (m < 1000) return `£${trim(m.toFixed(1))}m`;
  return `£${trim((Math.round(v / 100_000_000) / 10).toFixed(1))}bn`;
}

/** The latest year the data's period covers in full; otherwise the latest year it holds. */
export function defaultYear(money: Pick<MoneyData, 'years' | 'period'>): number {
  const years = [...money.years].sort((a, b) => b - a);
  const full = years.find((y) => money.period.from <= `${y}-01-01` && money.period.to >= `${y}-12-31`);
  return full ?? years[0] ?? new Date().getUTCFullYear();
}

/** The year to show: the one asked for when the data holds it, else the default. */
export function chosenYear(money: Pick<MoneyData, 'years' | 'period'>, asked: number | null): number {
  return asked !== null && money.years.includes(asked) ? asked : defaultYear(money);
}

const sum = (buckets: Array<{ value: number }>) => buckets.reduce((n, b) => n + b.value, 0);
const sumCount = (buckets: Bucket[]) => buckets.reduce((n, b) => n + b.count, 0);

export interface Totals {
  uk: Bucket;
  overseas: Bucket;
  unplaced: Bucket;
}

/** Money to UK regions, to overseas suppliers, and to UK suppliers not placed, for a year. */
export function yearTotals(money: MoneyData, year: number): Totals {
  const regions = Object.values(money.regions[String(year)] ?? {});
  const overseas = Object.values(money.overseas[String(year)] ?? {});
  const unplaced = money.unplaced[String(year)] ?? { count: 0, value: 0 };
  return {
    uk: { value: sum(regions), count: sumCount(regions) },
    overseas: { value: sum(overseas), count: sumCount(overseas) },
    unplaced: { value: unplaced.value, count: unplaced.count },
  };
}

export interface RegionRow extends RegionBucket {
  region: string;
}

/** All 12 regions for a year, highest value first; regions with nothing are listed at £0. */
export function regionRows(money: MoneyData, year: number): RegionRow[] {
  const held = money.regions[String(year)] ?? {};
  return MONEY_REGIONS.map((region) => ({ region, ...(held[region] ?? { count: 0, value: 0, tally_count: 0, tally_value: 0 }) })).sort(
    (a, b) => b.value - a.value || a.region.localeCompare(b.region, 'en-GB'),
  );
}

export interface CountryRow extends Bucket {
  country: string;
}

/** Overseas suppliers' money by country for a year, highest first. */
export function overseasRows(money: MoneyData, year: number): CountryRow[] {
  return Object.entries(money.overseas[String(year)] ?? {})
    .map(([country, b]) => ({ country, value: b.value, count: b.count }))
    .sort((a, b) => b.value - a.value || a.country.localeCompare(b.country, 'en-GB'));
}

export interface Winner {
  company: Company;
  value: number;
  count: number;
}

/** Tally companies that won contracts in a year, highest value first. Names not in Tally are left out. */
export function tallyWinners(money: MoneyData, year: number, companies: Company[]): Winner[] {
  const byName = new Map(companies.map((c) => [c.name, c]));
  const prefix = `${year}-`;
  const out: Winner[] = [];
  for (const [name, awards] of Object.entries(money.companies)) {
    const company = byName.get(name);
    if (!company) continue;
    const won = awards.filter((a) => a.date.startsWith(prefix));
    if (!won.length) continue;
    out.push({ company, value: sum(won), count: won.length });
  }
  return out.sort((a, b) => b.value - a.value || a.company.name.localeCompare(b.company.name, 'en-GB'));
}

export interface CapabilityRow {
  slug: string;
  label: string;
  value: number;
  /** Tally companies with this capability that won contracts in the year. */
  companies: number;
}

/**
 * Tally companies' contract money for a year by top-level capability. A
 * company with several capabilities counts in each, so the rows add up to more
 * than the total.
 */
export function capabilityRows(winners: Winner[], taxonomy: Taxonomy): CapabilityRow[] {
  const labels = new Map(taxonomy.capabilities.filter((c) => !c.slug.includes('/')).map((c) => [c.slug, c.label]));
  const rows = new Map<string, CapabilityRow>();
  for (const w of winners) {
    for (const tag of new Set(w.company.tags)) {
      const label = labels.get(tag);
      if (!label) continue;
      const row = rows.get(tag) ?? { slug: tag, label, value: 0, companies: 0 };
      row.value += w.value;
      row.companies += 1;
      rows.set(tag, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'en-GB'));
}

/** The awards a company has won, newest first. */
export function companyAwards(money: Pick<MoneyData, 'companies'>, name: string): Award[] {
  return [...(money.companies[name] ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.value - a.value);
}

/** A share as a whole percentage, with "under 1%" for small non-zero shares. */
export function sharePercent(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%';
  const p = (part / whole) * 100;
  return p < 1 ? 'under 1%' : `${Math.round(p)}%`;
}
