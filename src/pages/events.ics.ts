// /events.ics, written at build: the upcoming cluster events as a calendar
// file. Past events are dropped by the build's own date, as on the page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import type { ClustersData, EventsData } from '../lib/clusters';
import { eventsIcs } from '../lib/events-ics';

const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', name), 'utf8'));

export const GET: APIRoute = () => {
  const today = new Date().toISOString().slice(0, 10);
  const data = read('events.json') as EventsData;
  const events = data.events.filter((e) => e.date >= today);
  return new Response(eventsIcs(events, (read('clusters.json') as ClustersData).clusters, today), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
