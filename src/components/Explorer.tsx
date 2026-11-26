// The Find page: the map filling the window with the search over it, then the
// results beside it. Its whole state is one ViewState, kept in the URL
// (src/lib/url-state.ts); what is open on screen (a panel, the shortlist) is
// not part of a link.
import '../styles/explorer.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import CapMatchToggle from './CapMatchToggle';
import Chips, { type Chip } from './Chips';
import Filters from './Filters';
import LayersPanel from './LayersPanel';
import MapView, { type Binning, type MapApi, type Padding } from './MapView';
import Matrix from './Matrix';
import MoneyPanel from './MoneyPanel';
import OverseasList from './OverseasList';
import ResultsPanel, { type Hit } from './ResultsPanel';
import SearchForm, { type Query } from './SearchForm';
import Sheet from './Sheet';
import Shortlist from './Shortlist';
import { clusterLabels, clusterMembers, eventMarkers, legendEntries, rankedRegions, regionBounds, today, upcoming, type ClustersData, type EventsData, type RegionsData } from '../lib/clusters';
import { activeFilterCount, emptyFilters, FACETS, filterCompanies, isLocated, type Facet } from '../lib/filters';
import { monthLabel } from '../lib/history';
import { companiesInBbox } from '../lib/matrix';
import { findPlaceInScope, isNearRadius, NEAR_RADII } from '../lib/near';
import { countryName, countryOf, DEFAULT_SCOPE, inScope, regionChoices, scopeBounds, scopeCountries, showsCountry, UNITED_KINGDOM } from '../lib/scope';
import { askSearch, keywordSearch, readSearchAnswer } from '../lib/search';
import { addToShortlist, removeFromShortlist } from '../lib/shortlist';
import { chosenYear, defaultYear, overseasRows, regionRows, type MoneyData } from '../lib/money';
import { chosenFinancialYear, latestFinancialYear, recentFinancialYears, spendRows, type ModSpend } from '../lib/mod-spend';
import { arcBounds, arcEndsGeoJSON, arcsGeoJSON, overseasArcs, shadedRegions, type RegionShape } from '../lib/money-map';
import { UK_BOUNDS } from '../lib/map-config';
import { companiesNearSite, distanceMiles, isRadius, RADII, ringPolygon, type Radius, type SitesData } from '../lib/sites';
import type { Company, TallyData } from '../lib/types';
import { defaultState, fromLink, keywordText, roundPosition, sanitiseClusters, sanitiseSites, sanitiseState, toQuery, type Bbox, type ViewState } from '../lib/url-state';

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** The site distance nearest to a number of miles. */
const asRadius = (miles: number): Radius => (isRadius(miles) ? miles : RADII.reduce((best, r) => (Math.abs(r - miles) < Math.abs(best - miles) ? r : best)));
const PHONE = '(max-width: 760px)';
/** Stands for "n companies found." in the status line, worked out when it is shown. */
const FOUND = '\u0000found';
const EXAMPLES: Array<Query & { label: string }> = [
  { label: 'Counter-drone near Salisbury', what: 'counter-drone', near: 'Salisbury' },
  { label: 'Space', what: 'space', near: '' },
  { label: 'Cyber near Cheltenham', what: 'cyber', near: 'Cheltenham' },
];

/** Whether anything in a link narrows the companies or asks for a page of them. */
function narrows(s: ViewState): boolean {
  return activeFilterCount(s.filters) > 0 || Boolean(s.q || s.site || s.near || s.cluster || s.cell || s.area) || s.sel.length > 0 || s.page > 1;
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const on = () => setPhone(query.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function Explorer() {
  const [data, setData] = useState<TallyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<ViewState>(() => fromLink(window.location.search));
  const [binning, setBinning] = useState<Binning | null>(null);
  // Goes up when the panel's heading should take focus: a pick on the map, the shortlist opening.
  const [focusPanel, setFocusPanel] = useState(0);
  // A shared shortlist link opens on the shortlist.
  const [showList, setShowList] = useState(() => state.list.length > 0 && state.view === 'map' && !narrows(state));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const phone = usePhone();
  const mapApi = useRef<MapApi | null>(null);

  useEffect(() => {
    setFailed(false);
    fetch('/data/tally.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: TallyData) => {
        setState((s) => sanitiseState(s, d));
        setData(d);
      })
      .catch(() => setFailed(true));
  }, [attempt]);

  // Defence sites: a small committed dataset, fetched as data.
  const [sitesData, setSitesData] = useState<SitesData | null>(null);
  const [sitesFailed, setSitesFailed] = useState(false);
  useEffect(() => {
    fetch('/sites/defence-sites.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: SitesData) => {
        setState((s) => sanitiseSites(s, d.sites.map((site) => site.id)));
        setSitesData(d);
      })
      .catch(() => setSitesFailed(true));
  }, []);
  const site = useMemo(() => sitesData?.sites.find((x) => x.id === state.site) ?? null, [sitesData, state.site]);
  // One location filter at a time: a chosen defence site, or a typed place.
  const place = site ? null : state.near;
  const location = useMemo(
    () => (site ? { lat: site.lat, lon: site.lon, miles: state.radius, name: site.name } : place ? { lat: place.lat, lon: place.lon, miles: state.within, name: place.name } : null),
    [site, state.radius, place, state.within],
  );
  const ring = useMemo(() => (location ? ringPolygon(location, location.miles) : null), [location]);

  // Clusters and their upcoming events, built from the data repo. Boundaries
  // are a committed file, fetched only once the overlay or a cluster is chosen.
  const [clustersData, setClustersData] = useState<ClustersData | null>(null);
  const [events, setEvents] = useState<EventsData | null>(null);
  const [regions, setRegions] = useState<RegionsData | null>(null);
  const [clustersFailed, setClustersFailed] = useState(false);
  useEffect(() => {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    Promise.all([get('/data/clusters.json'), get('/data/events.json')])
      .then(([c, e]: [ClustersData, EventsData]) => {
        setState((s) => sanitiseClusters(s, c.clusters.map((x) => x.id)));
        setClustersData(c);
        setEvents(e);
      })
      .catch(() => setClustersFailed(true));
  }, []);
  const wantRegions = state.clusters || Boolean(state.cluster);
  useEffect(() => {
    if (!wantRegions || regions) return;
    fetch('/clusters/cluster-regions.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RegionsData) => setRegions(d))
      .catch(() => setClustersFailed(true));
  }, [wantRegions, regions]);
  const cluster = useMemo(() => clustersData?.clusters.find((c) => c.id === state.cluster) ?? null, [clustersData, state.cluster]);
  const upcomingEvents = useMemo(() => (events ? upcoming(events.events, today()) : []), [events]);
  const regionFeatures = useMemo(() => {
    if (!regions) return null;
    const shown = regions.features.filter((f) => state.clusters || f.properties.id === state.cluster);
    return rankedRegions(shown, state.cluster, clustersData?.clusters ?? []);
  }, [regions, state.clusters, state.cluster, clustersData]);
  const labels2 = useMemo(
    () => (regions && clustersData && state.clusters ? clusterLabels(regions.features, clustersData.clusters) : null),
    [regions, clustersData, state.clusters],
  );
  const markers = useMemo(
    () => (regions && clustersData && state.clusters ? eventMarkers(upcomingEvents, regions.features, clustersData.clusters) : null),
    [regions, clustersData, upcomingEvents, state.clusters],
  );
  // Contract money and the region shapes it shades: fetched only when the
  // Money view first opens, so the other views cost nothing.
  const [money, setMoney] = useState<MoneyData | null>(null);
  const [regionShapes, setRegionShapes] = useState<RegionShape[] | null>(null);
  const [moneyFailed, setMoneyFailed] = useState(false);
  const [moneyAttempt, setMoneyAttempt] = useState(0);
  const [overseasShown, setOverseasShown] = useState(false);
  const moneyOpen = state.view === 'money';
  useEffect(() => {
    if (!moneyOpen || money) return;
    setMoneyFailed(false);
    fetch('/data/money.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: MoneyData) => {
        // A year the data does not hold, or the default year, is dropped from the address.
        setState((s) => (s.myear !== null && (!d.years.includes(s.myear) || s.myear === defaultYear(d)) ? { ...s, myear: null } : s));
        setMoney(d);
      })
      .catch(() => setMoneyFailed(true));
  }, [moneyOpen, money, moneyAttempt]);
  useEffect(() => {
    if (!moneyOpen || regionShapes) return;
    fetch('/maps/uk-regions.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { features: RegionShape[] }) => setRegionShapes(d.features))
      // The tables carry every figure; without the shapes the map is simply not shaded.
      .catch(() => setRegionShapes([]));
  }, [moneyOpen, regionShapes]);
  // MOD's official spend with industry: the second measure, and the scale
  // line under contract awards. Fetched with the contract money.
  const [modSpend, setModSpend] = useState<ModSpend | null>(null);
  const [modSpendFailed, setModSpendFailed] = useState(false);
  useEffect(() => {
    if (!moneyOpen || modSpend) return;
    setModSpendFailed(false);
    fetch('/data/mod-spend.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ModSpend) => {
        // A year the data does not hold, or the latest, is dropped from the address.
        setState((s) => (s.mfy !== null && (!recentFinancialYears(d).includes(s.mfy) || s.mfy === latestFinancialYear(d)) ? { ...s, mfy: null } : s));
        setModSpend(d);
      })
      .catch(() => setModSpendFailed(true));
  }, [moneyOpen, modSpend, moneyAttempt]);
  const spendOn = moneyOpen && state.mmeasure === 'spend';
  const spendYear = modSpend ? chosenFinancialYear(modSpend, state.mfy) : null;
  const moneyYear = money ? chosenYear(money, state.myear) : null;
  const moneyMap = useMemo(() => {
    if (spendOn) {
      if (!modSpend || spendYear === null) return null;
      // The regional figures are UK only: no overseas lines.
      const rows = spendRows(modSpend, spendYear).map((r) => ({ region: r.region, value: r.value }));
      return {
        year: spendYear,
        measure: 'spend' as const,
        regions: regionShapes?.length ? shadedRegions(regionShapes, rows as Parameters<typeof shadedRegions>[1]) : null,
        arcs: arcsGeoJSON([]),
        ends: arcEndsGeoJSON([]),
        bounds: null,
      };
    }
    if (!moneyOpen || !money || moneyYear === null) return null;
    const arcs = overseasArcs(overseasRows(money, moneyYear));
    return {
      year: String(moneyYear),
      measure: 'awards' as const,
      regions: regionShapes?.length ? shadedRegions(regionShapes, regionRows(money, moneyYear)) : null,
      arcs: arcsGeoJSON(arcs),
      ends: arcEndsGeoJSON(arcs),
      bounds: arcs.length ? arcBounds(arcs, UK_BOUNDS) : null,
    };
  }, [moneyOpen, money, moneyYear, regionShapes, spendOn, modSpend, spendYear]);
  useEffect(() => {
    if (!moneyMap?.bounds) setOverseasShown(false);
  }, [moneyMap?.bounds]);

  // Layout effect: the address changes in the same frame as the view.
  useLayoutEffect(() => {
    if (!data) return;
    const query = toQuery(state);
    if (query !== window.location.search.replace(/^\?/, '')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, [state, data]);

  const update = (change: Partial<ViewState>) => setState((s) => ({ ...s, ...change }));

  // The scope: the UK (the default, exactly as before country-aware Tally),
  // one other live country, or a bloc of live countries. Outside the UK scope
  // only the scope's companies are listed and only they are drawn.
  const countries = useMemo(() => data?.countries ?? [UNITED_KINGDOM], [data]);
  const ukScope = state.scope === DEFAULT_SCOPE;
  const drawn = useMemo(() => (ukScope ? [countries.find((c) => c.code === 'GB' && c.live && c.bounds) ?? UNITED_KINGDOM] : scopeCountries(state.scope, countries)), [ukScope, state.scope, countries]);
  const placeChoices = useMemo(() => (ukScope ? undefined : regionChoices(state.scope, countries)), [ukScope, state.scope, countries]);
  const scoped = useMemo(() => {
    if (!data) return [];
    if (ukScope) return data.companies;
    const chosen = new Set(state.countries);
    return data.companies.filter((c) => inScope(c, state.scope, countries) && (!chosen.size || chosen.has(countryOf(c).toLowerCase())));
  }, [data, ukScope, state.scope, state.countries, countries]);
  const toggleCountry = (code: string, on: boolean) =>
    setState((s) => {
      const rest = s.countries.filter((c) => c !== code);
      return { ...s, countries: on ? [...rest, code] : rest, page: 1, matrix: { ...s.matrix, page: 1 } };
    });

  // Overlap: with two or more capabilities and "all" chosen, only places where
  // every capability is found. The hexagon module does the work; it loads with
  // the map, or here if the map has not loaded it yet.
  const overlapOn = state.capMatch === 'all' && state.filters.cap.length >= 2;
  useEffect(() => {
    if (overlapOn && !binning) import('../lib/binning').then((b) => setBinning(() => b)).catch(() => setFailed(true));
  }, [overlapOn, binning]);
  const facetFiltered = useMemo(() => {
    if (!data) return [];
    const all = filterCompanies(scoped, state.filters);
    const byCluster = (cluster && clusterMembers(all, cluster)) || all;
    return state.q ? keywordSearch(byCluster, state.q, data.taxonomy) : byCluster;
  }, [data, scoped, state.filters, cluster, state.q]);
  const legend = useMemo(
    () => (data && clustersData && state.clusters ? legendEntries(clustersData.clusters, data.companies, upcomingEvents) : null),
    [data, clustersData, upcomingEvents, state.clusters],
  );
  const chooseCluster = (id: string | null) => update({ cluster: id, cell: null, sel: [], area: null, page: 1, matrix: { ...state.matrix, page: 1 } });
  const memberCount = useMemo(() => (data && cluster ? (clusterMembers(data.companies, cluster)?.length ?? null) : null), [data, cluster]);
  // While the hexagon module loads, keep showing the last result rather than
  // announcing that nothing matches.
  const overlapPending = overlapOn && !binning;
  const lastFiltered = useRef<Company[] | null>(null);
  const filtered = useMemo(() => {
    const near = location ? companiesNearSite(facetFiltered, location, location.miles, drawn) : facetFiltered;
    if (!overlapOn) return near;
    if (!binning) return lastFiltered.current ?? near;
    return binning.overlapCompanies(near, state.filters.cap, binning.OVERLAP_RESOLUTION, drawn);
  }, [overlapOn, binning, facetFiltered, state.filters.cap, location, drawn]);
  lastFiltered.current = filtered;
  const onMap = useMemo(() => filtered.filter((c) => isLocated(c, drawn)).length, [filtered, drawn]);
  const inCluster = cluster?.membership ? ` in the ${cluster.name} cluster` : '';
  const within = `${inCluster}${location ? ` within ${location.miles} miles of ${location.name}` : ''}`;
  const places = useMemo(
    () => (overlapOn && binning ? binning.binCompanies(filtered, binning.OVERLAP_RESOLUTION, drawn).length : 0),
    [overlapOn, binning, filtered, drawn],
  );

  const areaCompanies = useMemo(() => {
    if (state.cell) {
      const ids = new Set(binning ? binning.companiesInCell(filtered, state.cell, drawn) : []);
      return filtered.filter((c) => ids.has(c.id));
    }
    if (state.sel.length) {
      const ids = new Set(state.sel);
      return filtered.filter((c) => ids.has(c.id));
    }
    if (state.area) return companiesInBbox(filtered, state.area, drawn);
    return null;
  }, [state.cell, state.sel, state.area, binning, filtered, drawn]);

  const toggle = (facet: Facet, value: string, on: boolean) =>
    setState((s) => {
      const values = s.filters[facet].filter((v) => v !== value);
      const next = on ? [...values, value] : values;
      // Overlap needs two or more capabilities; with fewer, go back to any-of.
      const capMatch = facet === 'cap' && next.length < 2 ? 'any' : s.capMatch;
      return { ...s, filters: { ...s.filters, [facet]: next }, capMatch, page: 1, matrix: { ...s.matrix, page: 1 } };
    });



  // What the page looks like: the landing page, results beside the map, the
  // List view or the Matrix view. Anything that narrows the companies, a page of them, or
  // the shortlist being open, makes it results.
  // Paging through every company is still looking at results, on any page.
  // A link that only switches on a layer, moves the map or names a month showed
  // every company before the redesign, and still opens on the results.
  const [browsing, setBrowsing] = useState(() => Boolean(state.month || state.clusters || state.sites || state.onTop || state.map));
  const active = narrows(state) || browsing;
  const mode: 'landing' | 'results' | 'list' | 'matrix' | 'money' = state.view !== 'map' ? state.view : active || showList ? 'results' : 'landing';
  const listed = mode !== 'landing';
  // The List and Matrix views take the whole width; the map is out of reach.
  const full = mode === 'list' || mode === 'matrix';

  // The status line: the page's one live region. A message is said once and
  // stands until the results next change; after the first change, the count
  // is always part of it.
  const [toast, setToast] = useState<{ text: string; n: number; at: string | null }>({ text: '', n: 0, at: null });
  const say = (text: string) => setToast((t) => ({ text, n: t.n + 1, at: null }));
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    const timer = window.setTimeout(() => setQuiet(true), 6000);
    return () => window.clearTimeout(timer);
  }, [toast.n]);

  // Plain-English search: filters from the route, checked against the data;
  // otherwise a keyword search, and the page says so. The place is found
  // separately: a defence site by its name, anything else by postcodes.io,
  // which is sent only the place and only on Search.
  const [searching, setSearching] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [preset, setPreset] = useState<(Query & { clear?: boolean }) | null>(null);
  const searchedFor = useRef('');
  const submit = async ({ what, near }: Query) => {
    if (!data) return;
    setSearching(true);
    const messages: string[] = [];
    // A new search replaces the selection, including any chosen cluster.
    const reset = { cell: null, sel: [], area: null, page: 1, cluster: null };
    let change: Partial<ViewState> = {};
    let nearText = near;
    let siteFromSearch = false;
    if (what && what !== searchedFor.current) {
      // "counter-drone near Salisbury" typed into one box still finds the place.
      const split = near ? null : /^(.*?)\s+near\s+(.+)$/i.exec(what);
      const siteNames = new Map((sitesData?.sites ?? []).map((x) => [x.id, x.name]));
      const answer = readSearchAnswer(await askSearch(what), data.taxonomy, siteNames.keys(), siteNames);
      if (answer.kind === 'filters') {
        change = { ...reset, filters: answer.filters, capMatch: answer.capMatch, q: '' };
        if (answer.site && !near) {
          change = { ...change, site: answer.site, radius: answer.radius, near: null };
          siteFromSearch = true;
        } else if (split) nearText = split[2];
        setReveal((n) => n + 1);
        messages.push(`Showing: ${answer.labels.join(', ')}. Change these in Filters.`);
      } else {
        const q = keywordText(split ? split[1] : what);
        change = { ...reset, filters: emptyFilters(), capMatch: 'any', q };
        if (split) nearText = split[2];
        messages.push(`We could not turn that into filters, so we searched company names and descriptions for: ${q}.`);
      }
      searchedFor.current = what;
    } else if (!what && state.q) {
      change = { ...reset, q: '' };
      searchedFor.current = '';
    }
    if (!siteFromSearch) {
      const current = site?.name ?? place?.name ?? '';
      nearText = nearText.replace(/\s+/g, ' ').trim();
      if (!nearText) {
        if (current) change = { ...change, ...reset, near: null, site: null };
      } else if (!same(nearText, current)) {
        const named = sitesData?.sites.find((x) => same(x.name, nearText));
        if (named) {
          // The distance showing in Within carries over to the site.
          change = { ...change, ...reset, site: named.id, radius: asRadius(site ? state.radius : state.within), near: null };
        } else {
          const result = await findPlaceInScope(nearText, state.scope, scoped);
          if (result.kind === 'found') change = { ...change, ...reset, near: result.place, site: null };
          else if (result.kind === 'invalid') messages.push('Type a full postcode, the first part of one, a town or city name, or a defence site, using letters, numbers, spaces, hyphens, full stops and apostrophes.');
          else if (result.kind === 'not-found') messages.push(`We could not find ${nearText}. Try a full postcode, the first part of one, or a town or city name.`);
          else if (result.kind === 'outside') messages.push(`${nearText} is outside the UK area Tally maps.`);
          else messages.push('The place finder (postcodes.io) could not be reached. Please try again.');
        }
      }
    }
    if (Object.keys(change).length) {
      setShowList(false);
      setState((s) => ({ ...s, ...change, matrix: { ...s.matrix, page: 1 } }));
    }
    say(messages.join(' ') || (Object.keys(change).length ? FOUND : ''));
    setSearching(false);
  };

  const byId = useMemo(() => new Map((data?.companies ?? []).map((c) => [c.id, c])), [data]);
  const shortlisted = useMemo(() => state.list.map((id) => byId.get(id)).filter((c): c is Company => Boolean(c)), [state.list, byId]);
  const shareUrl = `${window.location.origin}${window.location.pathname}${state.list.length ? `?list=${state.list.join(',')}` : ''}`;
  const setShortlist = (c: Company, add: boolean) => {
    const list = add ? addToShortlist(state.list, c.id) : removeFromShortlist(state.list, c.id);
    update({ list });
    say(`${c.name} ${add ? 'added to' : 'removed from'} your shortlist. ${list.length} on your shortlist.`);
  };
  const shortlistButton = (c: Company) =>
    state.list.includes(c.id) ? (
      <button type="button" class="btn btn-sm is-selected" onClick={() => setShortlist(c, false)}>
        Remove<span class="vh"> {c.name}</span> from shortlist
      </button>
    ) : (
      <button type="button" class="btn btn-sm" onClick={() => setShortlist(c, true)}>
        Add<span class="vh"> {c.name}</span> to shortlist
      </button>
    );

  // The shortlist button lives in the top bar, outside this island: keep its
  // count and state in step, and let it open and close the shortlist.
  useEffect(() => {
    const button = document.getElementById('shortlist-toggle');
    if (!button) return;
    const count = document.getElementById('shortlist-count');
    if (count) count.textContent = String(state.list.length);
    button.classList.toggle('has', state.list.length > 0);
    button.setAttribute('aria-pressed', String(showList));
  }, [state.list.length, showList]);
  useEffect(() => {
    const button = document.getElementById('shortlist-toggle');
    if (!button) return;
    const toggle = () => {
      setShowList((on) => !on);
      setFocusPanel((n) => n + 1);
    };
    button.addEventListener('click', toggle);
    return () => button.removeEventListener('click', toggle);
  }, []);

  // Escape stops drawing an area.
  useEffect(() => {
    if (!drawing) return;
    const stop = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawing(false);
    };
    window.addEventListener('keydown', stop);
    return () => window.removeEventListener('keydown', stop);
  }, [drawing]);
  useEffect(() => {
    if (full) setDrawing(false);
  }, [full]);

  // The companies in the panel, in the order shown: the shortlist as added,
  // otherwise nearest first when a place is set, and A to Z when not.
  const narrowed = areaCompanies ?? filtered;
  const hits = useMemo<Hit[]>(() => {
    const from = location;
    const all = (showList ? shortlisted : narrowed).map((company) => ({
      company,
      miles: from && isLocated(company, drawn) ? distanceMiles(from.lat, from.lon, company.lat, company.lon) : null,
    }));
    if (showList) return all;
    const byName = (a: Hit, b: Hit) => a.company.name.localeCompare(b.company.name, 'en-GB');
    return all.sort((a, b) => (a.miles !== null && b.miles !== null ? a.miles - b.miles || byName(a, b) : byName(a, b)));
  }, [showList, shortlisted, narrowed, location, drawn]);
  const labels = useMemo(() => new Map((data?.taxonomy.capabilities ?? []).map((c) => [c.slug, c.label])), [data]);

  // The count in words. #result-count always holds it; the status line says it when it changes.
  const n = filtered.length;
  const countSentence = failed
    ? 'The company data could not be loaded.'
    : !data
      ? 'Loading companies.'
      : overlapPending
        ? `${plural(n, 'company', 'companies')}${within} so far; working out where all chosen capabilities overlap.`
        : overlapOn
          ? `${plural(n, 'company', 'companies')} with a chosen capability${within}, in ${plural(places, 'place', 'places')} where all chosen capabilities overlap.`
          : `${plural(n, 'company', 'companies')}${within}.${n ? ` ${onMap.toLocaleString('en-GB')} ${onMap === 1 ? 'is' : 'are'} on the map${onMap < n ? '; the rest are overseas or have no published address' : ''}.` : ''}`;
  const firstCount = useRef<string | null>(null);
  if (data && firstCount.current === null) firstCount.current = countSentence;
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (firstCount.current !== null && countSentence !== firstCount.current) setChanged(true);
  }, [countSentence]);
  useLayoutEffect(() => {
    if (toast.at === null && toast.text) setToast((t) => (t.at === null ? { ...t, at: countSentence } : t));
  }, [toast, countSentence]);
  const live = toast.text && (toast.at === null || toast.at === countSentence) ? toast.text : '';
  const message = live === FOUND ? `${plural(showList ? shortlisted.length : narrowed.length, 'company', 'companies')} found.` : live || (!toast.n && state.q ? `Showing companies whose names or descriptions match: ${state.q}.` : '');

  // Chips: everything that narrows the results, each with its own way out.
  const chips = useMemo<Chip[]>(() => {
    if (!data) return [];
    const out: Chip[] = [];
    const t = data.taxonomy;
    const regionOptions = placeChoices?.facet === 'region' ? placeChoices.options : t.regions;
    const options: Record<Facet, Array<{ slug: string; label: string }>> = { cap: t.capabilities, size: t.sizes, region: regionOptions, fw: t.frameworks, accr: t.accreditations, mbr: t.memberships };
    if (state.q) out.push({ key: 'q', label: `Keyword: ${state.q}`, onRemove: () => update({ q: '', page: 1 }) });
    for (const facet of FACETS) {
      for (const value of state.filters[facet]) {
        out.push({ key: `${facet}:${value}`, label: options[facet].find((o) => o.slug === value)?.label ?? value, onRemove: () => toggle(facet, value, false) });
      }
    }
    for (const code of state.countries) out.push({ key: `country:${code}`, label: countryName(code.toUpperCase(), countries), onRemove: () => toggleCountry(code, false) });
    if (overlapOn) out.push({ key: 'capmatch', label: 'All in the same area', onRemove: () => update({ capMatch: 'any', cell: null, page: 1 }) });
    if (location) out.push({ key: 'place', label: `Within ${location.miles} miles of ${location.name}`, onRemove: () => update({ near: null, site: null, cell: null, sel: [], page: 1 }) });
    if (cluster) out.push({ key: 'cluster', label: `${cluster.name} cluster`, onRemove: () => chooseCluster(null) });
    if (areaCompanies) out.push({ key: 'area', label: 'Map area', onRemove: () => update({ cell: null, sel: [], area: null, page: 1 }) });
    return out;
  }, [data, state.q, state.filters, overlapOn, location, cluster, areaCompanies !== null, placeChoices, state.countries, countries]);
  const clearAll = () => {
    searchedFor.current = '';
    setBrowsing(false);
    setState((s) => ({ ...s, filters: emptyFilters(), capMatch: 'any', q: '', near: null, site: null, cluster: null, cell: null, sel: [], area: null, page: 1, matrix: { ...s.matrix, page: 1 } }));
  };
  const startAgain = () => {
    clearAll();
    setShowList(false);
    setPreset({ what: '', near: '' });
    setState((s) => ({ ...s, view: 'map', matrix: defaultState().matrix, myear: null, mmeasure: 'awards', mfy: null }));
    requestAnimationFrame(() => document.getElementById('search-what')?.focus());
  };

  // The room the panels take over the map, so the camera frames what is left.
  const padding = useMemo<Padding>(() => {
    // On a phone the map is its own block in the page, with nothing over it.
    if (phone) return { top: 12, right: 0, bottom: 12, left: 0 };
    return { top: 60, right: 0, bottom: 0, left: Math.min(mode === 'landing' ? 592 : 480, Math.round(window.innerWidth * 0.45)) };
  }, [phone, mode === 'landing']);
  // What the camera frames, once everything a link may name has loaded.
  const settled = Boolean(data) && Boolean(sitesData || sitesFailed) && Boolean(clustersData || clustersFailed) && (!state.cluster || Boolean(regions) || clustersFailed);
  const focus = useMemo(() => {
    if (!settled) return null;
    if (ring) {
      const lons = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      return { key: `ring:${ring[0].join(',')}:${ring[24].join(',')}`, bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] as Bbox };
    }
    const feature = regions?.features.find((f) => f.properties.id === state.cluster);
    if (feature) return { key: `cluster:${feature.properties.id}`, bounds: regionBounds(feature) as Bbox };
    if (!ukScope) return { key: `scope:${state.scope}`, bounds: scopeBounds(state.scope, countries) };
    return { key: 'uk', bounds: null };
  }, [settled, ring, regions, state.cluster, ukScope, state.scope, countries]);

  const pick = (change: Partial<ViewState>) => {
    setShowList(false);
    setFocusPanel((k) => k + 1);
    update({ ...change, page: 1, matrix: { ...state.matrix, page: 1 } });
  };
  const searchArea = () => {
    const area = mapApi.current?.viewArea();
    if (area) pick({ area, cell: null, sel: [] });
  };
  const radii = site ? RADII : NEAR_RADII;
  const setWithin = (miles: number) => {
    if (site && isRadius(miles)) update({ radius: miles, cell: null, sel: [], page: 1, matrix: { ...state.matrix, page: 1 } });
    else if (!site && isNearRadius(miles)) update({ within: miles, cell: null, sel: [], page: 1, matrix: { ...state.matrix, page: 1 } });
  };
  const setView = (view: ViewState['view']) => {
    // Having looked at the list or the matrix, the map comes back with the results beside it.
    if (view !== 'map') setBrowsing(true);
    // The new view's heading takes focus.
    if (view !== state.view) setFocusPanel((k) => k + 1);
    // The Money view's year belongs to it; leaving it drops the year.
    if (view !== 'money') setOverseasShown(false);
    update(view === 'map' ? { view, matrix: defaultState().matrix, myear: null, mmeasure: 'awards', mfy: null } : view === 'money' ? { view } : { view, myear: null, mmeasure: 'awards', mfy: null });
  };
  const compare = (
    <button type="button" class="link" onClick={() => setView('matrix')}>
      Compare capabilities<span aria-hidden="true"> →</span>
    </button>
  );
  // The links at the top right of the results panel and the matrix.
  const panelActions = (
    <>
      {mode !== 'matrix' && compare}
      {showList ? (
        <button
          type="button"
          class="link"
          onClick={() => {
            setShowList(false);
            setFocusPanel((k) => k + 1);
          }}
        >
          Back to results
        </button>
      ) : (
        <>
          {areaCompanies && (
            <button type="button" class="link" onClick={() => update({ cell: null, sel: [], area: null, page: 1 })}>
              Clear the area
            </button>
          )}
          <button type="button" class="link" onClick={startAgain}>
            Start again
          </button>
        </>
      )}
    </>
  );

  const panelKind = showList ? 'shortlist' : areaCompanies ? 'area' : 'results';
  const sub = !data
    ? ''
    : showList
      ? 'The companies you have shortlisted.'
      : [
          areaCompanies ? 'In the area you chose on the map.' : '',
          location ? `Within ${location.miles} miles of ${location.name}, nearest first.` : areaCompanies ? '' : active ? 'Across the UK and overseas, A to Z.' : 'Every company, A to Z.',
          cluster?.membership ? `Members of the ${cluster.name} cluster.` : '',
          overlapOn && !overlapPending ? `In ${plural(places, 'place', 'places')} where all chosen capabilities are found.` : '',
          !areaCompanies && n > 0 && onMap < n ? `${onMap.toLocaleString('en-GB')} on the map; the rest are overseas or have no published address.` : '',
        ]
          .filter(Boolean)
          .join(' ');
  // When nothing matches, name the commonest way out and offer it.
  const wider = useMemo(() => {
    if (!location || hits.length > 0 || showList) return null;
    for (const miles of radii) {
      if (miles <= location.miles) continue;
      const found = companiesNearSite(facetFiltered, location, miles).length;
      if (found > 0) return { miles, found };
    }
    return null;
  }, [location, hits.length, showList, facetFiltered, radii]);
  const empty = showList ? (
    <p>Your shortlist is empty. Use + Shortlist on any company.</p>
  ) : failed ? (
    <>
      <p>The company data could not be loaded.</p>
      <p>
        <button type="button" class="btn" onClick={() => setAttempt((k) => k + 1)}>
          Try again
        </button>
      </p>
    </>
  ) : (
    <>
      <p>No companies match. Try a wider distance, or remove a filter.</p>
      <p class="empty-actions">
        {wider && (
          <button type="button" class="btn" onClick={() => setWithin(wider.miles)}>
            Widen to {wider.miles} miles ({plural(wider.found, 'company', 'companies')})
          </button>
        )}
        {areaCompanies && (
          <button type="button" class="btn" onClick={() => update({ cell: null, sel: [], area: null, page: 1 })}>
            Clear the area
          </button>
        )}
      </p>
    </>
  );
  const shortlistTools = showList && data ? <Shortlist companies={shortlisted} taxonomy={data.taxonomy} shareUrl={shareUrl} overlap={overlapOn} onSay={say} /> : undefined;
  const facts: Array<[string, string]> = [
    ['Companies', data ? data.companies.length.toLocaleString('en-GB') : '–'],
    ['Capabilities', data ? String(data.taxonomy.capabilities.length) : '–'],
    ['Defence sites', sitesData ? String(sitesData.sites.length) : '–'],
    ['Last updated', data ? new Date(data.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–'],
  ];
  const filterCount = activeFilterCount(state.filters);
  const siteNames = useMemo(() => (sitesData?.sites ?? []).map((x) => x.name), [sitesData]);
  const mapTools = (
    <div class="map-tools" role="group" aria-label="Map tools">
      <button type="button" class="btn btn-sm" onClick={searchArea}>
        Search this area
      </button>
      <button
        type="button"
        class="btn btn-sm"
        aria-pressed={drawing}
        onClick={() => {
          if (!drawing) say('Press and drag on the map to draw a rectangle. Escape stops.');
          setDrawing(!drawing);
        }}
      >
        Draw an area
      </button>
      <button type="button" class="btn btn-sm" aria-pressed={state.clusters} onClick={() => update({ clusters: !state.clusters })}>
        Cluster map
      </button>
    </div>
  );
  // The landing page keeps to the four main controls; the map tools join them
  // once there are results, the map has been moved or a layer is on.
  const showTools = !full && mode !== 'money' && (mode === 'results' || Boolean(state.map) || state.clusters || state.sites);
  const mapStyle = (
    <div class="seg" role="group" aria-label="Map style">
      <button type="button" class="btn" aria-pressed={!state.flat} onClick={() => update({ flat: false })}>
        3D
      </button>
      <button type="button" class="btn" aria-pressed={state.flat} onClick={() => update({ flat: true })}>
        Flat
      </button>
    </div>
  );

  return (
    <div class={`find ${mode === 'landing' ? 'landing' : mode === 'matrix' ? 'as-list as-matrix' : mode === 'list' ? 'as-list' : mode === 'money' ? 'with-results as-money' : 'with-results'}${layersOpen ? ' layers-open' : ''}`}>
      <p id="result-count" class="vh">
        {countSentence}
      </p>
      <div class={mode === 'landing' ? 'lead hero' : 'lead'}>
        {mode === 'landing' && <p class="mono kicker">Open directory · public sources · free to use</p>}
        <h1 class={mode === 'landing' ? 'display' : 'vh'}>
          Find UK defence capability<span class="stop">.</span>
        </h1>
        {mode === 'landing' && <p class="lede">Companies, clusters and defence sites on one map. Search by capability and place, shortlist the companies you want and share the list.</p>}
        <SearchForm
          compact={listed}
          busy={searching || !data}
          keywords={state.q}
          place={site?.name ?? place?.name ?? ''}
          radii={radii}
          within={site ? state.radius : state.within}
          siteNames={siteNames}
          preset={preset}
          onSubmit={(query) => void submit(query)}
          onWithin={setWithin}
        />
        {state.month && (
          <p class="moved">
            Growth over time has moved to New companies.{' '}
            <a class="link" href={`/new/?month=${state.month}`}>
              See growth over time for {monthLabel(state.month)}
            </a>{' '}
            <button type="button" class="link" onClick={() => update({ month: null })}>
              Dismiss
            </button>
          </p>
        )}
        {mode === 'landing' ? (
          <>
            <div class="try" role="group" aria-label="Example searches">
              <span class="mono" aria-hidden="true">
                Try
              </span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  disabled={searching || !data}
                  onClick={() => {
                    setPreset({ what: example.what, near: example.near });
                    // Examples with a place look a little wider than the default distance.
                    if (example.near && !site && state.within < 50) update({ within: 50 });
                    void submit(example);
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <dl class="facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dd>{value}</dd>
                  <dt class="mono">{label}</dt>
                </div>
              ))}
            </dl>
            {failed && (
              <p class="moved">
                The company data could not be loaded.{' '}
                <button type="button" class="link" onClick={() => setAttempt((k) => k + 1)}>
                  Try again
                </button>
              </p>
            )}
          </>
        ) : (
          <>
            {!showList && mode !== 'money' && <Chips chips={chips} onClear={clearAll} />}
            {mode === 'money' ? (
              <MoneyPanel
                money={money}
                failed={moneyFailed}
                onRetry={() => setMoneyAttempt((k) => k + 1)}
                year={moneyYear}
                onYear={(y) => update({ myear: money && y === defaultYear(money) ? null : y })}
                measure={state.mmeasure}
                onMeasure={(m) => {
                  if (m === 'spend') setOverseasShown(false);
                  update(m === 'spend' ? { mmeasure: 'spend' } : { mmeasure: 'awards', mfy: null });
                }}
                modSpend={modSpend}
                modSpendFailed={modSpendFailed}
                spendYear={spendYear}
                onSpendYear={(y) => update({ mfy: modSpend && y === latestFinancialYear(modSpend) ? null : y })}
                companies={data?.companies ?? null}
                taxonomy={data?.taxonomy ?? null}
                overseas={overseasShown}
                canShowOverseas={Boolean(moneyMap?.bounds)}
                onOverseas={setOverseasShown}
                focus={focusPanel}
              />
            ) : mode === 'matrix' ? (
              data ? (
                <Matrix
                  taxonomy={data.taxonomy}
                  companies={showList ? shortlisted : narrowed}
                  selectedCaps={state.filters.cap}
                  group={state.matrix.group}
                  page={state.matrix.page}
                  scope={panelKind}
                  shortlisted={(id) => state.list.includes(id)}
                  onShortlist={setShortlist}
                  onToggleCap={(slug, on) => toggle('cap', slug, on)}
                  onGroup={(group) => update({ matrix: { group, page: state.matrix.page } })}
                  onPage={(page) => update({ matrix: { ...state.matrix, page } })}
                  actions={panelActions}
                  tools={shortlistTools}
                  empty={empty}
                  focus={focusPanel}
                  countryOf={showsCountry(state.scope, countries) ? (c) => countryName(countryOf(c), countries) : null}
                />
              ) : (
                <section class="matrix" aria-labelledby="matrix-heading">
                  <header class="panel-head">
                    <div>
                      <h2 id="matrix-heading">Compare capabilities</h2>
                      <p>{failed ? '' : 'Loading companies.'}</p>
                    </div>
                  </header>
                  {failed && <div class="empty">{empty}</div>}
                </section>
              )
            ) : (
              <ResultsPanel
                countries={drawn}
                kind={panelKind}
                hits={hits}
                page={state.page}
                onPage={(page) => {
                  setBrowsing(true);
                  update({ page });
                }}
                labels={labels}
                shortlisted={(id) => state.list.includes(id)}
                onShortlist={setShortlist}
                sub={sub}
                loading={!data && !failed}
                empty={empty}
                focus={focusPanel}
                actions={panelActions}
                tools={shortlistTools}
              >
                {mode === 'list' && data && ukScope && <OverseasList companies={facetFiltered} overlap={overlapOn} actions={shortlistButton} />}
              </ResultsPanel>
            )}
          </>
        )}
      </div>

      <div class="controls">
        <button type="button" class="btn" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
          Filters{filterCount > 0 && <span class="count"> {filterCount}</span>}
        </button>
        <div class="seg" role="group" aria-label="View">
          <button type="button" class="btn" aria-pressed={state.view === 'map'} onClick={() => setView('map')}>
            Map
          </button>
          <button type="button" class="btn" aria-pressed={state.view === 'list'} onClick={() => setView('list')}>
            List
          </button>
          <button type="button" class="btn" aria-pressed={state.view === 'matrix'} onClick={() => setView('matrix')}>
            Matrix
          </button>
          <button type="button" class="btn" aria-pressed={state.view === 'money'} onClick={() => setView('money')}>
            Money
          </button>
        </div>
        {!full && !phone && mapStyle}
        <button type="button" class={layersOpen ? 'btn is-selected' : 'btn'} aria-haspopup="dialog" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}>
          Layers
        </button>
      </div>
      {showTools && !phone && <div class="tools">{mapTools}</div>}
      {phone && mode === 'landing' && (
        <p class="map-credit">
          Map: <a href="https://openfreemap.org">OpenFreeMap</a>, <a href="https://www.openmaptiles.org/">© OpenMapTiles</a>, data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
        </p>
      )}
      {drawing && <p class="draw-hint">Press and drag on the map to draw a rectangle. Escape stops.</p>}

      <MapView
        companies={showList ? shortlisted : filtered}
        countries={drawn}
        sites={state.sites ? (sitesData?.sites ?? null) : site ? [site] : null}
        chosenSite={site?.id ?? null}
        ring={ring}
        place={place}
        clusterRegions={regionFeatures}
        clusterEvents={markers}
        clusterLabels={labels2}
        clusterMap={state.clusters}
        companiesOnTop={state.onTop}
        onSelectCluster={(id) => chooseCluster(id)}
        fixedResolution={overlapOn && binning ? binning.OVERLAP_RESOLUTION : null}
        selectedCell={state.cell}
        initialPosition={state.map}
        onSelectCell={(cell) => pick(cell === state.cell ? { cell: null } : { cell, sel: [], area: null })}
        onSelectIds={(ids) => pick({ cell: null, sel: ids, area: null })}
        onMove={(position) => update({ map: roundPosition(position) })}
        onBinning={(b) => setBinning(() => b)}
        area={state.area}
        onArea={(area) => pick({ area, cell: null, sel: [] })}
        three={!state.flat}
        padding={padding}
        focus={focus}
        drawing={drawing}
        onDrawing={setDrawing}
        hidden={full}
        money={moneyMap}
        overseasBounds={overseasShown ? (moneyMap?.bounds ?? null) : null}
        api={mapApi}
      />
      <div class="fade" aria-hidden="true" />

      <Sheet
        id="filters"
        title="Filters"
        open={filtersOpen}
        modal
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button
              type="button"
              class="link"
              disabled={filterCount === 0}
              onClick={() => {
                searchedFor.current = '';
                update({ filters: emptyFilters(), capMatch: 'any', page: 1, matrix: { ...state.matrix, page: 1 } });
              }}
            >
              Clear all filters
            </button>
            <button type="button" class="btn btn-primary btn-lg" onClick={() => setFiltersOpen(false)}>
              Show {plural(n, 'company', 'companies')}
            </button>
          </>
        }
      >
        {data && (
          <>
            {state.filters.cap.length >= 2 && <CapMatchToggle value={state.capMatch} onChange={(capMatch) => update({ capMatch, cell: null, page: 1, matrix: { ...state.matrix, page: 1 } })} />}
            <Filters
              taxonomy={data.taxonomy}
              filters={state.filters}
              reveal={reveal}
              places={placeChoices}
              countries={state.countries}
              onCountry={toggleCountry}
              onToggle={(facet, value, on) => {
                searchedFor.current = '';
                toggle(facet, value, on);
              }}
            />
          </>
        )}
      </Sheet>
      <Sheet id="layers" title="Layers" open={layersOpen} modal={phone} onClose={() => setLayersOpen(false)}>
        <LayersPanel
          clusters={clustersData}
          clustersFailed={clustersFailed}
          showClusters={state.clusters}
          cluster={cluster}
          memberCount={memberCount}
          legend={legend}
          onTop={state.onTop}
          onShowClusters={(clusters) => update({ clusters })}
          onCluster={(id) => {
            setShowList(false);
            chooseCluster(id);
          }}
          onOnTop={(onTop) => update({ onTop })}
          sites={sitesData}
          sitesFailed={sitesFailed}
          showSites={state.sites}
          site={site}
          onShowSites={(sites) => update({ sites })}
          onSite={(id) => {
            setShowList(false);
            update({ site: id, near: id ? null : state.near, cell: null, sel: [], area: null, page: 1, matrix: { ...state.matrix, page: 1 } });
          }}
        >
          {phone && !full && (
            <div class="layer layer-map">
              {mapStyle}
              {showTools && mapTools}
            </div>
          )}
        </LayersPanel>
      </Sheet>

      <p id="search-status" role="status" class={`status${message && !quiet ? '' : ' quiet'}`}>
        {message}
        {changed && <span class="vh"> {countSentence}</span>}
      </p>
    </div>
  );
}
