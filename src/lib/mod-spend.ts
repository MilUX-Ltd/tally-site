// MOD's official direct spend with UK industry by region and financial year
// (card 7475): the "MOD spend with industry" measure in the Money view. The
// build checks the file (scripts/fetch-data.mjs, slimModSpend); these helpers
// only read it. No framework imports.

export interface ModSpendRegion {
  /** Pounds, current prices, as published. */
  value: number;
  /** Pounds per person, as published. */
  per_person: number;
}

export interface ModSpend {
  attribution: string;
  /** Financial years whose heading carries a break in series. */
  breaks: string[];
  generated: string;
  /** By financial year, then by region. */
  regions: Record<string, Record<string, ModSpendRegion>>;
  source: { title: string; url: string; published: string };
  /** The UK Total row, by financial year. */
  uk: Record<string, number>;
  /** Financial years in order, as "2025/26". */
  years: string[];
}

export interface SpendRow extends ModSpendRegion {
  region: string;
}

/** How many financial years the year choice offers. */
export const RECENT_YEARS = 5;

const FY = /^(\d{4})[/-](\d{2})$/;

/** "2025/26" as it is written in the address: "2025-26". */
export function fyParam(year: string): string {
  return year.replace('/', '-');
}

/** A financial year from the address ("2025-26" or "2025/26"), or null. */
export function fyFromParam(value: string | null | undefined): string | null {
  const m = FY.exec(value ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}

export function latestFinancialYear(d: ModSpend): string {
  return d.years[d.years.length - 1];
}

/** The year asked for when the data holds it; otherwise the latest. */
export function chosenFinancialYear(d: ModSpend, wanted: string | null): string {
  return wanted && d.years.includes(wanted) ? wanted : latestFinancialYear(d);
}

/** The last few financial years, latest first. */
export function recentFinancialYears(d: ModSpend): string[] {
  return [...d.years].reverse().slice(0, RECENT_YEARS);
}

/** All 12 regions for a year, highest spend first. */
export function spendRows(d: ModSpend, year: string): SpendRow[] {
  return Object.entries(d.regions[year] ?? {})
    .map(([region, r]) => ({ region, value: r.value, per_person: r.per_person }))
    .sort((a, b) => b.value - a.value || a.region.localeCompare(b.region, 'en-GB'));
}
