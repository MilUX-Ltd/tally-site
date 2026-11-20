// The cluster events as an iCalendar file (RFC 5545), written at build. Every
// event is an all-day entry: the clusters publish times as free text, so the
// time goes in the description. Members-only events are signposts here as
// everywhere: the fixed line, the cluster and its public website, nothing else.
import type { Cluster, ClusterEvent } from './clusters';

const escapeText = (text: string) =>
  text
    .replace(/[^\P{Cc}\n]/gu, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');

/** Fold a content line at 75 octets, as the format requires. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = (date: string) => date.replaceAll('-', '');
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Only web addresses go in the URL line, and never one that could break out of it. */
const safeUrl = (link: string | null | undefined) => (link && /^https?:\/\/[^\s\\;,]+$/.test(link) ? link : null);

export function eventsIcs(events: ClusterEvent[], clusters: Cluster[], asOf: string): string {
  const byId = new Map(clusters.map((c) => [c.id, c]));
  const stamp = `${compact(asOf)}T000000Z`;
  const seen = new Map<string, number>();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MilUX//Tally cluster events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:UK regional defence cluster events (Tally)'];
  for (const e of events) {
    const cluster = byId.get(e.cluster);
    const name = cluster?.name ?? e.cluster;
    const key = `${e.date}-${e.cluster}-${e.audience}`.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    lines.push('BEGIN:VEVENT', `UID:${key}-${n}@tally.milux.co.uk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.date))}`);
    if (e.audience === 'public') {
      lines.push(`SUMMARY:${escapeText(`${e.title} (${name})`)}`);
      if (e.where) lines.push(`LOCATION:${escapeText(e.where)}`);
      const description = [e.time ? `Time: ${e.time}.` : null, e.summary, 'From the cluster\'s public pages. Dates and details can change; check with the organiser before you travel.'].filter(Boolean).join(' ');
      lines.push(`DESCRIPTION:${escapeText(description)}`);
      const url = safeUrl(e.link) ?? safeUrl(cluster?.web);
      if (url) lines.push(`URL:${url}`);
    } else {
      lines.push(`SUMMARY:${escapeText(`${e.text} (${name})`)}`);
      const url = safeUrl(e.link);
      if (url) lines.push(`URL:${url}`);
    }
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
