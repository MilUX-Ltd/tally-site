// New companies: the companies added most recently, grouped by week, and the
// RSS feed of the same list. Added dates come from the data repo's history
// (scripts/build-history.mjs writes them at build); nothing here reads the
// clock, so the page and feed are the same on every rebuild of the same data.
// Plain TypeScript with no framework imports.
import { canonicalUrl, companyPath } from './company-page';
import type { Company, Taxonomy } from './types';

/** How many weeks the list covers, up to and including the newest addition's week. */
export const WEEKS = 12;
/** Top capabilities shown for each company. */
export const TOP_CAPABILITIES = 3;
export const NEW_PATH = '/new';
export const FEED_PATH = '/new/feed.xml';

export interface NewEntry {
  id: string;
  name: string;
  path: string;
  region: string;
  capabilities: string[];
  summary: string;
  /** ISO date (UTC) the company was first listed. */
  added: string;
}

export interface NewWeek {
  /** The Monday (UTC) that starts the week, YYYY-MM-DD. */
  week: string;
  label: string;
  entries: NewEntry[];
}

const DAY = 24 * 60 * 60 * 1000;

/** The Monday (UTC) starting the week of an ISO date, as YYYY-MM-DD. */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * DAY).toISOString().slice(0, 10);
}

/** A date in words, for example 19 November 2026. */
export const dayText = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

/** Where the company is, in a few words: its UK region, or its country when overseas. */
export function regionText(company: Company): string {
  const overseas = Boolean(company.country) || company.region === 'Overseas';
  if (overseas) return company.country || 'Overseas';
  return company.region || 'Region not known';
}

/**
 * Up to `max` top-level capabilities the company has, directly or through a
 * sub-capability, in taxonomy order (group order, then value order).
 */
export function topCapabilities(company: Company, taxonomy: Taxonomy, max = TOP_CAPABILITIES): string[] {
  const has = new Set(company.tags.map((t) => t.split('/')[0]));
  const groupOrder = new Map(taxonomy.groups.map((g, i) => [g.slug, i]));
  return taxonomy.capabilities
    .filter((c) => !c.slug.includes('/') && has.has(c.slug) && groupOrder.has(c.group))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (groupOrder.get(a.c.group) ?? 0) - (groupOrder.get(b.c.group) ?? 0) || a.i - b.i)
    .slice(0, max)
    .map(({ c }) => c.label);
}

/**
 * Companies added in the WEEKS weeks up to and including the week of the
 * newest addition, grouped by week, newest week first; within a week, newest
 * first, then by name. Companies without an added date are left out.
 */
export function recentAdditions(companies: Company[], added: Record<string, string>, taxonomy: Taxonomy): NewWeek[] {
  const dated = companies.filter((c) => typeof added[c.id] === 'string' && !Number.isNaN(Date.parse(added[c.id])));
  if (!dated.length) return [];
  const newest = dated.reduce((m, c) => (Date.parse(added[c.id]) > Date.parse(added[m.id]) ? c : m));
  const from = new Date(Date.parse(`${weekStart(added[newest.id])}T00:00:00Z`) - (WEEKS - 1) * 7 * DAY).toISOString().slice(0, 10);
  const entries: NewEntry[] = dated
    .filter((c) => weekStart(added[c.id]) >= from)
    .map((c) => ({
      id: c.id,
      name: c.name,
      path: companyPath(c.id),
      region: regionText(c),
      capabilities: topCapabilities(c, taxonomy),
      summary: c.summary,
      added: added[c.id],
    }))
    .sort((a, b) => Date.parse(b.added) - Date.parse(a.added) || a.name.localeCompare(b.name, 'en-GB'));
  const weeks = new Map<string, NewEntry[]>();
  for (const e of entries) {
    const w = weekStart(e.added);
    weeks.set(w, [...(weeks.get(w) ?? []), e]);
  }
  return [...weeks].map(([week, list]) => ({ week, label: `Week of ${dayText(`${week}T00:00:00Z`)}`, entries: list }));
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
/** Escapes text for an XML text node or attribute, and drops characters XML 1.0 forbids. */
export const xmlEscape = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    // A lone surrogate is not a character XML can carry; a valid pair is kept.
    .replace(/\p{Cs}/gu, '')
    .replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);

const rfc822 = (iso: string) => new Date(iso).toUTCString();

/** The plain-text item description: region, top capabilities and the public summary. */
function describe(e: NewEntry): string {
  const head = [e.region, e.capabilities.join(', ')].filter(Boolean).join('. ');
  return [head && `${head}.`, e.summary.trim()].filter(Boolean).join(' ');
}

/** The RSS 2.0 feed of the recent additions, newest first, with absolute links on the site. */
export function feedXml(weeks: NewWeek[]): string {
  const entries = weeks.flatMap((w) => w.entries);
  const newest = entries[0]?.added;
  const tag = (name: string, text: string) => `<${name}>${xmlEscape(text)}</${name}>`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    tag('title', 'New companies in Tally'),
    tag('link', canonicalUrl(`${NEW_PATH}/`)),
    tag('description', `Companies added to Tally, the open directory of UK defence capability, in the ${WEEKS} weeks to the latest addition. Public information only.`),
    tag('language', 'en-gb'),
    `<atom:link href="${xmlEscape(canonicalUrl(FEED_PATH))}" rel="self" type="application/rss+xml"/>`,
    ...(newest ? [tag('pubDate', rfc822(newest)), tag('lastBuildDate', rfc822(newest))] : []),
    ...entries.map((e) => {
      const url = canonicalUrl(e.path);
      return [
        '<item>',
        tag('title', e.name),
        tag('link', url),
        `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        tag('pubDate', rfc822(e.added)),
        tag('description', describe(e)),
        ...e.capabilities.map((c) => tag('category', c)),
        '</item>',
      ].join('');
    }),
    '</channel>',
    '</rss>',
  ];
  return `${lines.join('\n')}\n`;
}
