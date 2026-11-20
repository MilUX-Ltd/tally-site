// Design prototype (/lab): the full-width map home page. One file, plain DOM,
// so the direction can be tried before it replaces the explorer. The search
// here is a keyword match in the browser; the real plain-English search is not
// called. Nothing a visitor types leaves the browser except a place sent to
// the postcode lookup, as on the home page.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { STYLE_URL, ATTRIBUTION } from '../lib/map-config';
import { findPlace, type Place } from '../lib/near';
import { distanceMiles, ringPolygon, type SitesData } from '../lib/sites';
import { shortlistCsv } from '../lib/shortlist';
import type { Company, TallyData } from '../lib/types';

interface Hit { c: Company; d: number | null }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => window.matchMedia('(max-width: 760px)').matches;
const PAGE = 20;

const STOP = new Set(['company', 'companies', 'firm', 'firms', 'supplier', 'suppliers', 'the', 'and', 'for', 'with', 'in', 'of', 'a', 'uk', 'defence', 'near', 'who', 'that', 'do', 'does', 'make', 'makes']);
const SYNONYMS: Record<string, string[]> = {
  'counter-drone': ['counter-uas'], 'counter-drones': ['counter-uas'], 'c-uas': ['counter-uas'], cuas: ['counter-uas'],
  drone: ['uas', 'drone'], drones: ['uas', 'drone'], uav: ['uas'], uavs: ['uas'], satellite: ['space', 'satellite'], satellites: ['space', 'satellite'],
  comms: ['comms', 'communications'], ai: ['ai', 'artificial'], ew: ['ew', 'electronic warfare'],
};

const state = {
  q: '', place: null as Place | null, within: 50, view: 'map' as 'map' | 'list', three: true, sites: false,
  cell: null as string | null, shortlistOnly: false, page: 1, list: new Set<string>(),
};
let data: TallyData;
let sites: SitesData | null = null;
let haystack = new Map<string, string>();
let labels = new Map<string, string>();
let map: MlMap | null = null;
let hits: Hit[] = [];
let statusTimer = 0;
// Loaded on demand, as the explorer does, so the home page's bundle is unchanged.
let binning: typeof import('../lib/binning');

function say(text: string) {
  $('status').textContent = text;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => ($('status').textContent = ''), 3500);
}

function terms(q: string): string[][] {
  return q.toLowerCase().split(/[^a-z0-9-]+/).filter((t) => t && !STOP.has(t)).map((t) => SYNONYMS[t] ?? [t.replace(/s$/, '')]);
}

function search(): Hit[] {
  const want = terms(state.q);
  const p = state.place;
  const out: Hit[] = [];
  const inCell = state.cell && !state.shortlistOnly ? new Set(binning.companiesInCell(data.companies, state.cell)) : null;
  for (const c of data.companies) {
    if (state.shortlistOnly && !state.list.has(c.id)) continue;
    if (!state.shortlistOnly) {
      const text = haystack.get(c.id) ?? '';
      if (!want.every((any) => any.some((t) => text.includes(t)))) continue;
    }
    const located = c.lat !== null && c.lon !== null;
    const d = p && located ? distanceMiles(p.lat, p.lon, c.lat as number, c.lon as number) : null;
    if (!state.shortlistOnly) {
      if (p && (d === null || d > state.within)) continue;
      if (inCell && !inCell.has(c.id)) continue;
    }
    out.push({ c, d });
  }
  out.sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : a.c.name.localeCompare(b.c.name, 'en-GB')));
  return out;
}

const active = () => Boolean(state.q || state.place || state.cell || state.shortlistOnly);

/** Coarser hexagons when zoomed out, finer when zoomed in. */
function resolution(): number {
  const z = map?.getZoom() ?? 5;
  return z < 6.3 ? 4 : z < 7.6 ? 5 : z < 9 ? 6 : 7;
}
const HEIGHT: Record<number, number> = { 4: 9000, 5: 4600, 6: 2200, 7: 1000 };

function drawHexes() {
  if (!map?.getSource('hex')) return;
  const res = resolution();
  // The map shows every match for the search and place; a chosen area narrows the list only.
  const shown = state.cell ? search0() : hits;
  const bins = binning.binCompanies(shown.map((h) => h.c), res);
  const max = Math.max(1, ...bins.map((b) => b.count));
  (map.getSource('hex') as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: binning.binsToGeoJSON(bins).features.map((f) => {
      const { cell: k, count: n } = f.properties;
      return { ...f, properties: { k, n, t: Math.sqrt(n / max), h: state.three ? Math.sqrt(n) * HEIGHT[res] : 0, on: k === state.cell } };
    }),
  });
}
/** The matches without the chosen area, so the map keeps its other columns. */
function search0(): Hit[] {
  const cell = state.cell;
  state.cell = null;
  const all = search();
  state.cell = cell;
  return all;
}

function row({ c, d }: Hit): string {
  const where = (c.hq || c.region || 'No published location').replace(/, (United Kingdom|UK|England)$/, '');
  const tags = c.tags.filter((t) => labels.has(t) && !t.includes('/')).slice(0, 3).map((t) => `<span class="tag">${esc(labels.get(t) as string)}</span>`).join('');
  const on = state.list.has(c.id);
  return `<li class="row"><h3><a href="/companies/${esc(c.id)}/">${esc(c.name)}</a></h3><button type="button" class="add" data-id="${esc(c.id)}" aria-pressed="${on}">${on ? '✓ Shortlisted' : '+ Shortlist'}<span hidden> ${esc(c.name)}</span></button><span class="pl">${d !== null ? `<b>${Math.round(d)} MI</b>` : ''}${esc(where)}</span><p>${esc(c.summary)}</p><div class="tags">${tags}</div></li>`;
}

function render(move = false) {
  hits = search();
  const on = active();
  document.body.classList.toggle('results', on && state.view === 'map');
  document.body.classList.toggle('listview', state.view === 'list');
  const n = hits.length;
  const pages = Math.max(1, Math.ceil(n / PAGE));
  state.page = Math.min(state.page, pages);
  const from = (state.page - 1) * PAGE;
  $('count').textContent = state.shortlistOnly ? `Shortlist: ${n}` : `${n.toLocaleString('en-GB')} ${n === 1 ? 'company' : 'companies'}`;
  const bits = [];
  if (state.shortlistOnly) bits.push('The companies you have shortlisted.');
  else {
    if (state.place) bits.push(`Within ${state.within} miles of ${state.place.name}, nearest first.`);
    if (state.cell) bits.push('In the area you chose on the map.');
    if (!state.place && !state.cell) bits.push(state.q ? 'Across the UK and overseas, A to Z.' : 'Every company, A to Z.');
  }
  $('sub').textContent = bits.join(' ');
  $('share').hidden = !state.shortlistOnly || n === 0;
  $('rows').innerHTML = n ? hits.slice(from, from + PAGE).map(row).join('') : `<li class="empty">${state.shortlistOnly ? 'Your shortlist is empty. Use + Shortlist on any company.' : 'No companies match. Try a wider distance or a different word.'}</li>`;
  $('rows').scrollTop = 0;
  $('pg').textContent = n ? `${from + 1} to ${Math.min(from + PAGE, n)} of ${n.toLocaleString('en-GB')}` : '';
  ($('prev') as HTMLButtonElement).disabled = state.page <= 1;
  ($('next') as HTMLButtonElement).disabled = state.page >= pages;
  $('short-n').textContent = String(state.list.size);
  $('short').classList.toggle('has', state.list.size > 0);
  $('short').setAttribute('aria-pressed', String(state.shortlistOnly));
  for (const [id, view] of [['v-map', 'map'], ['v-list', 'list']] as const) $(id).setAttribute('aria-pressed', String(state.view === view));
  $('d-3').setAttribute('aria-pressed', String(state.three));
  $('d-2').setAttribute('aria-pressed', String(!state.three));
  $('sites').setAttribute('aria-pressed', String(state.sites));
  ($('q2') as HTMLInputElement).value = state.q;
  ($('near2') as HTMLInputElement).value = state.place?.name ?? '';
  ($('within2') as HTMLSelectElement).value = String(state.within);
  drawHexes();
  drawRing();
  if (move) frame();
}

function drawRing() {
  if (!map?.getSource('ring')) return;
  const p = state.place;
  (map.getSource('ring') as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ringPolygon(p, state.within)] } }] : [],
  });
}

/** Moves the camera to suit the state: the UK on landing, the place and its ring after a search. */
function frame(instant = false) {
  if (!map) return;
  const small = phone();
  const padding = { left: small ? 0 : active() ? 480 : 560, right: 0, top: small ? 120 : 60, bottom: small && active() ? Math.round(window.innerHeight * 0.46) : 0 };
  const ZOOM: Record<number, number> = { 10: 9.3, 25: 8.2, 50: 7.3, 100: 6.4 };
  const p = state.place;
  map.easeTo({
    center: p ? [p.lon, p.lat] : [-3.4, 54.7],
    zoom: (p ? (ZOOM[state.within] ?? 7.3) : 5.25) - (small ? 0.7 : 0),
    pitch: state.three ? 50 : 0,
    bearing: state.three ? -12 : 0,
    padding,
    duration: instant || reduced ? 0 : 1400,
  });
}

async function submit(q: string, near: string, within: number) {
  state.q = q.trim();
  state.within = within;
  state.cell = null;
  state.shortlistOnly = false;
  state.page = 1;
  // "counter-drone near Salisbury" typed into one box still works.
  const m = !near.trim() && /^(.*?)\s+near\s+(.+)$/i.exec(state.q);
  if (m) {
    state.q = m[1];
    near = m[2];
  }
  if (near.trim()) {
    if (near.trim().toLowerCase() !== state.place?.name.toLowerCase()) {
      const found = await findPlace(near.trim());
      if (found.kind === 'found') state.place = found.place;
      else {
        state.place = null;
        say(found.kind === 'unreachable' ? 'The place lookup is not answering. Showing all places.' : `We could not find "${near.trim()}". Showing all places.`);
      }
    }
  } else state.place = null;
  render(true);
  $('status').textContent ||= `${hits.length} ${hits.length === 1 ? 'company' : 'companies'} found.`;
}

function wire() {
  $('cmd').addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(($('q') as HTMLInputElement).value, ($('near') as HTMLInputElement).value, Number(($('within') as HTMLSelectElement).value));
  });
  $('qbar').addEventListener('submit', (e) => {
    e.preventDefault();
    void submit(($('q2') as HTMLInputElement).value, ($('near2') as HTMLInputElement).value, Number(($('within2') as HTMLSelectElement).value));
  });
  $('within2').addEventListener('change', () => $('qbar').dispatchEvent(new Event('submit', { cancelable: true })));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-try]')) {
    b.addEventListener('click', () => void submit(b.dataset.try ?? '', b.dataset.near ?? '', 50));
  }
  $('reset').addEventListener('click', () => {
    Object.assign(state, { q: '', place: null, cell: null, shortlistOnly: false, page: 1, view: 'map' });
    ($('q') as HTMLInputElement).value = '';
    ($('near') as HTMLInputElement).value = '';
    render(true);
  });
  $('rows').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.add');
    if (!b?.dataset.id) return;
    if (state.list.has(b.dataset.id)) state.list.delete(b.dataset.id);
    else state.list.add(b.dataset.id);
    say(`${state.list.size} on your shortlist.`);
    render();
  });
  $('prev').addEventListener('click', () => { state.page--; render(); });
  $('next').addEventListener('click', () => { state.page++; render(); });
  $('short').addEventListener('click', () => { state.shortlistOnly = !state.shortlistOnly; state.page = 1; render(true); });
  $('v-map').addEventListener('click', () => { state.view = 'map'; render(); });
  $('v-list').addEventListener('click', () => { state.view = 'list'; render(); });
  $('d-3').addEventListener('click', () => { state.three = true; render(true); });
  $('d-2').addEventListener('click', () => { state.three = false; render(true); });
  $('sites').addEventListener('click', () => {
    state.sites = !state.sites;
    for (const id of ['site-dot', 'site-name']) map?.setLayoutProperty(id, 'visibility', state.sites ? 'visible' : 'none');
    render();
  });
  $('copy').addEventListener('click', () => {
    const url = `${location.origin}/?list=${[...state.list].join(',')}`;
    void navigator.clipboard?.writeText(url).then(() => say('Link copied.'), () => say(url));
  });
  $('csv').addEventListener('click', () => {
    const csv = shortlistCsv(data.companies.filter((c) => state.list.has(c.id)), data.taxonomy);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'tally-shortlist.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function startMap() {
  const [maplibregl, { default: workerUrl }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')]);
  maplibregl.setWorkerUrl(workerUrl);
  const m = new maplibregl.Map({
    container: 'map', style: STYLE_URL, center: [-3.4, 54.7], zoom: 5.25, pitch: 50, bearing: -12,
    minZoom: 3, maxZoom: 13, maxPitch: 60, attributionControl: { compact: false, customAttribution: ATTRIBUTION },
  });
  m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  m.on('load', () => {
    // A calm, light base: land, sea, borders and city names only.
    for (const l of m.getStyle().layers) {
      if (/road|highway|rail|bridge|tunnel|aeroway|building|poi|housenum|ferry|park|landuse|landcover|waterway/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
      else if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#FBFAF6');
      else if (l.type === 'fill' && /water/.test(l.id)) m.setPaintProperty(l.id, 'fill-color', '#DCE3E2');
      else if (l.type === 'line' && /boundary/.test(l.id)) m.setPaintProperty(l.id, 'line-color', '#B9B8AE');
      else if (l.type === 'symbol') {
        if (/state|suburb|village|other|country_3|water/.test(l.id)) m.setLayoutProperty(l.id, 'visibility', 'none');
        else {
          m.setPaintProperty(l.id, 'text-color', '#3F4A42');
          m.setPaintProperty(l.id, 'text-halo-color', 'rgba(251,250,246,0.9)');
        }
      }
    }
    const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    const empty = { type: 'FeatureCollection' as const, features: [] };
    m.addSource('ring', { type: 'geojson', data: empty });
    m.addLayer({ id: 'ring-fill', type: 'fill', source: 'ring', paint: { 'fill-color': '#113308', 'fill-opacity': 0.05 } }, firstLabel);
    m.addLayer({ id: 'ring-line', type: 'line', source: 'ring', paint: { 'line-color': '#113308', 'line-width': 1.5, 'line-dasharray': [3, 2] } }, firstLabel);
    m.addSource('hex', { type: 'geojson', data: empty });
    m.addLayer({
      id: 'hex', type: 'fill-extrusion', source: 'hex',
      paint: {
        'fill-extrusion-color': ['case', ['get', 'on'], '#113308', ['interpolate', ['linear'], ['get', 't'], 0, '#F2D9A6', 0.3, '#EDA552', 0.6, '#E2611C', 1, '#8A2B0A']],
        'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92,
      },
    }, firstLabel);
    m.addSource('sites', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: (sites?.sites ?? []).map((s) => ({ type: 'Feature' as const, properties: { name: s.name }, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } })) },
    });
    m.addLayer({ id: 'site-dot', type: 'circle', source: 'sites', layout: { visibility: 'none' }, paint: { 'circle-radius': 5, 'circle-color': '#113308', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    m.addLayer({
      id: 'site-name', type: 'symbol', source: 'sites', minzoom: 6.5,
      layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1], 'text-anchor': 'top' },
      paint: { 'text-color': '#113308', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    m.on('click', 'hex', (e) => {
      const k = e.features?.[0]?.properties?.k as string | undefined;
      if (!k) return;
      state.cell = state.cell === k ? null : k;
      state.page = 1;
      state.shortlistOnly = false;
      render();
    });
    m.on('mouseenter', 'hex', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'hex', () => (m.getCanvas().style.cursor = ''));
    let res = resolution();
    m.on('zoomend', () => {
      if (resolution() === res) return;
      res = resolution();
      state.cell = null;
      render();
    });
    map = m;
    frame(true);
    render();
    document.body.dataset.ready = 'true';
  });
}

async function main() {
  const [d, s] = await Promise.all([
    fetch('/data/tally.json').then((r) => r.json() as Promise<TallyData>),
    fetch('/sites/defence-sites.json').then((r) => r.json() as Promise<SitesData>).catch(() => null),
  ]);
  binning = await import('../lib/binning');
  data = d;
  sites = s;
  labels = new Map(d.taxonomy.capabilities.map((c) => [c.slug, c.label]));
  haystack = new Map(d.companies.map((c) => [c.id, `${c.name} ${c.summary} ${c.tags.join(' ')} ${c.tags.map((t) => labels.get(t) ?? '').join(' ')}`.toLowerCase()]));
  $('f-companies').textContent = d.companies.length.toLocaleString('en-GB');
  $('f-caps').textContent = String(d.taxonomy.capabilities.length);
  $('f-sites').textContent = String(s?.sites.length ?? 0);
  $('f-date').textContent = new Date(d.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  wire();
  const url = new URLSearchParams(location.search);
  if (url.has('flat')) state.three = false;
  await startMap();
  if (url.get('q') || url.get('near')) void submit(url.get('q') ?? '', url.get('near') ?? '', Number(url.get('within')) || 50);
}

void main();
