// Build-time only: the data the static pages are built from, read once per
// build from what scripts/fetch-data.mjs wrote. Never imported by browser code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CertificationCheck } from './company-page';
import type { Site } from './sites';
import type { TallyData } from './types';

export interface CompanyText {
  what: string;
  products: string;
  verified: string | null;
}

let data: TallyData | null = null;
let texts: Record<string, CompanyText> | null = null;
let checks: Record<string, CertificationCheck[]> | null = null;

export function siteData(): TallyData {
  data ??= JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'tally.json'), 'utf8')) as TallyData;
  return data;
}

export function companyTexts(): Record<string, CompanyText> {
  texts ??= JSON.parse(readFileSync(join(process.cwd(), '.tally', 'company-text.json'), 'utf8')) as Record<string, CompanyText>;
  return texts;
}

let added: Record<string, string> | null = null;

/** When each company was first listed, by id (scripts/build-history.mjs). */
export function addedDates(): Record<string, string> {
  added ??= JSON.parse(readFileSync(join(process.cwd(), '.tally', 'added.json'), 'utf8')) as Record<string, string>;
  return added;
}

/** Recorded certification checks, keyed by company id (build-only, from scripts/fetch-data.mjs). */
export function certificationChecks(): Record<string, CertificationCheck[]> {
  checks ??= JSON.parse(readFileSync(join(process.cwd(), '.tally', 'certification-checks.json'), 'utf8')) as Record<string, CertificationCheck[]>;
  return checks;
}

let sites: Site[] | null = null;

/** The committed defence sites (public/sites/defence-sites.json). */
export function defenceSites(): Site[] {
  sites ??= (JSON.parse(readFileSync(join(process.cwd(), 'public', 'sites', 'defence-sites.json'), 'utf8')) as { sites: Site[] }).sites;
  return sites;
}

/** How many clusters the directory holds (public/data/clusters.json). */
export function clusterCount(): number {
  return (JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'clusters.json'), 'utf8')) as { clusters: unknown[] }).clusters.length;
}
