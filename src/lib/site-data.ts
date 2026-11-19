// Build-time only: the data the static pages are built from, read once per
// build from what scripts/fetch-data.mjs wrote. Never imported by browser code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TallyData } from './types';

export interface CompanyText {
  what: string;
  products: string;
  verified: string | null;
}

let data: TallyData | null = null;
let texts: Record<string, CompanyText> | null = null;

export function siteData(): TallyData {
  data ??= JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'tally.json'), 'utf8')) as TallyData;
  return data;
}

export function companyTexts(): Record<string, CompanyText> {
  texts ??= JSON.parse(readFileSync(join(process.cwd(), '.tally', 'company-text.json'), 'utf8')) as Record<string, CompanyText>;
  return texts;
}
