// The explorer island: filters, heatmap, area list and results. Its whole
// state is one ViewState, kept in the URL (src/lib/url-state.ts).
import '../styles/explorer.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import AreaPanel from './AreaPanel';
import Filters from './Filters';
import MapView, { type Binning } from './MapView';
import ResultsList from './ResultsList';
import { emptyFilters, filterCompanies, isLocated, type Facet } from '../lib/filters';
import { companiesInBbox } from '../lib/matrix';
import type { TallyData } from '../lib/types';
import { fromQuery, keywordText, roundPosition, sanitiseSites, sanitiseState, toQuery, type ViewState } from '../lib/url-state';
import SearchBox from './SearchBox';
import { askSearch, keywordSearch, readSearchAnswer } from '../lib/search';
import Matrix from './Matrix';
import Shortlist from './Shortlist';
import Growth from './Growth';
import SitesPanel from './SitesPanel';
import { companiesNearSite, ringPolygon, type SitesData } from '../lib/sites';
import CapMatchToggle from './CapMatchToggle';
import OverseasList from './OverseasList';
import { addToShortlist, removeFromShortlist } from '../lib/shortlist';
import type { Company } from '../lib/types';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Explorer() {
  const [data, setData] = useState<TallyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<ViewState>(() => fromQuery(window.location.search));
  const [binning, setBinning] = useState<Binning | null>(null);
  // Focus moves to the area list only when the user picks an area, not on load.
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    fetch('/data/tally.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: TallyData) => {
        setState((s) => sanitiseState(s, d));
        setData(d);
      })
      .catch(() => setFailed(true));
  }, []);

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
  const ring = useMemo(() => (site ? ringPolygon(site, state.radius) : null), [site, state.radius]);

  // Layout effect: the address changes in the same frame as the view.
  useLayoutEffect(() => {
    if (!data) return;
    const query = toQuery(state);
    if (query !== window.location.search.replace(/^\?/, '')) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }, [state, data]);

  const update = (change: Partial<ViewState>) => setState((s) => ({ ...s, ...change }));

  // Overlap: with two or more capabilities and "all" chosen, only places where
  // every capability is found. The hexagon module does the work; it loads with
  // the map, or here if the map has not loaded it yet.
  const overlapOn = state.capMatch === 'all' && state.filters.cap.length >= 2;
  useEffect(() => {
    if (overlapOn && !binning) import('../lib/binning').then((b) => setBinning(() => b)).catch(() => setFailed(true));
  }, [overlapOn, binning]);
  const facetFiltered = useMemo(() => {
    if (!data) return [];
    const byFacet = filterCompanies(data.companies, state.filters);
    return state.q ? keywordSearch(byFacet, state.q, data.taxonomy) : byFacet;
  }, [data, state.filters, state.q]);
  // While the hexagon module loads, keep showing the last result rather than
  // announcing that nothing matches.
  const overlapPending = overlapOn && !binning;
  const lastFiltered = useRef<Company[] | null>(null);
  const filtered = useMemo(() => {
    const near = site ? companiesNearSite(facetFiltered, site, state.radius) : facetFiltered;
    if (!overlapOn) return near;
    if (!binning) return lastFiltered.current ?? near;
    return binning.overlapCompanies(near, state.filters.cap);
  }, [overlapOn, binning, facetFiltered, state.filters.cap, site, state.radius]);
  lastFiltered.current = filtered;
  const onMap = useMemo(() => filtered.filter(isLocated).length, [filtered]);
  const within = site ? ` within ${state.radius} miles of ${site.name}` : '';
  const places = useMemo(
    () => (overlapOn && binning ? binning.binCompanies(filtered, binning.OVERLAP_RESOLUTION).length : 0),
    [overlapOn, binning, filtered],
  );

  const areaCompanies = useMemo(() => {
    if (state.cell) {
      const ids = new Set(binning ? binning.companiesInCell(filtered, state.cell) : []);
      return filtered.filter((c) => ids.has(c.id));
    }
    if (state.sel.length) {
      const ids = new Set(state.sel);
      return filtered.filter((c) => ids.has(c.id));
    }
    if (state.area) return companiesInBbox(filtered, state.area);
    return null;
  }, [state.cell, state.sel, state.area, binning, filtered]);

  const toggle = (facet: Facet, value: string, on: boolean) =>
    setState((s) => {
      const values = s.filters[facet].filter((v) => v !== value);
      const next = on ? [...values, value] : values;
      // Overlap needs two or more capabilities; with fewer, go back to any-of.
      const capMatch = facet === 'cap' && next.length < 2 ? 'any' : s.capMatch;
      return { ...s, filters: { ...s.filters, [facet]: next }, capMatch, page: 1, matrix: { ...s.matrix, page: 1 } };
    });

  // Plain-English search: filters from the route, checked against the data;
  // otherwise a keyword search, and the page says so.
  const [searchMessage, setSearchMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [reveal, setReveal] = useState(0);
  const runSearch = async (text: string) => {
    if (!data) return;
    setSearching(true);
    setSearchMessage('Searching.');
    const siteNames = new Map((sitesData?.sites ?? []).map((x) => [x.id, x.name]));
    const answer = readSearchAnswer(await askSearch(text), data.taxonomy, siteNames.keys(), siteNames);
    const reset = { cell: null, sel: [], area: null, page: 1 };
    if (answer.kind === 'filters') {
      setState((s) => ({ ...s, ...reset, filters: answer.filters, capMatch: answer.capMatch, site: answer.site, radius: answer.radius, q: '', matrix: { ...s.matrix, page: 1 } }));
      setReveal((n) => n + 1);
      setSearchMessage(`Search set these filters: ${answer.labels.join(', ')}.`);
    } else {
      const q = keywordText(text);
      setState((s) => ({ ...s, ...reset, filters: emptyFilters(), capMatch: 'any', site: null, q, matrix: { ...s.matrix, page: 1 } }));
      setSearchMessage(
        `We used a simple keyword search for this request, so filters were cleared and the list shows companies whose names, summaries or capabilities match: ${q}.`,
      );
    }
    setSearching(false);
  };

  const byId = useMemo(() => new Map((data?.companies ?? []).map((c) => [c.id, c])), [data]);
  const shortlisted = state.list.map((id) => byId.get(id)).filter((c): c is Company => Boolean(c));
  const shareUrl = `${window.location.origin}${window.location.pathname}${state.list.length ? `?list=${state.list.join(',')}` : ''}`;
  const removeFromList = (id: string) => setState((s) => ({ ...s, list: removeFromShortlist(s.list, id) }));
  const shortlistButton = (c: Company) =>
    state.list.includes(c.id) ? (
      <button type="button" class="secondary small" onClick={() => removeFromList(c.id)}>
        Remove<span class="vh"> {c.name}</span> from shortlist
      </button>
    ) : (
      <button type="button" class="secondary small" onClick={() => setState((s) => ({ ...s, list: addToShortlist(s.list, c.id) }))}>
        Add<span class="vh"> {c.name}</span> to shortlist
      </button>
    );

  if (failed) return <p class="notice">The company data could not be loaded. Please refresh the page to try again.</p>;
  if (!data) return <p class="notice">Loading companies.</p>;

  return (
    <div class="explorer">
      <aside class="explorer-filters" aria-label="Filters and shortlist">
        <Filters
          taxonomy={data.taxonomy}
          filters={state.filters}
          onToggle={toggle}
          reveal={reveal}
          onClear={() => update({ filters: emptyFilters(), page: 1, matrix: { ...state.matrix, page: 1 } })}
        />
        <Shortlist
          companies={shortlisted}
          taxonomy={data.taxonomy}
          shareUrl={shareUrl}
          onRemove={removeFromList}
          overlap={overlapOn}
        />
      </aside>
      <div class="explorer-main">
        <SearchBox
          keywords={state.q}
          message={searchMessage}
          busy={searching}
          onSearch={(text) => void runSearch(text)}
          onClear={() => {
            setSearchMessage('');
            update({ q: '', page: 1, matrix: { ...state.matrix, page: 1 } });
          }}
        />
        {state.filters.cap.length >= 2 && (
          <CapMatchToggle
            count={state.filters.cap.length}
            value={state.capMatch}
            onChange={(capMatch) => update({ capMatch, cell: null, page: 1, matrix: { ...state.matrix, page: 1 } })}
          />
        )}
        <p id="result-count" role="status">
          {overlapPending
            ? `${plural(filtered.length, 'company', 'companies')}${within} so far; working out where all chosen capabilities overlap.`
            : overlapOn
              ? `${plural(filtered.length, 'company', 'companies')} with a chosen capability${within}, in ${plural(places, 'place', 'places')} where all chosen capabilities overlap.`
              : `${plural(filtered.length, 'company matches', 'companies match')}${within}; ${onMap} on the map.`}
        </p>
        <MapView
          companies={filtered}
          sites={state.sites ? (sitesData?.sites ?? null) : site ? [site] : null}
          chosenSite={site?.id ?? null}
          ring={ring}
          fixedResolution={overlapOn && binning ? binning.OVERLAP_RESOLUTION : null}
          selectedCell={state.cell}
          initialPosition={state.map}
          onSelectCell={(cell) => {
            setPicked(true);
            update({ cell, sel: [], area: null });
          }}
          onSelectIds={(ids) => {
            setPicked(true);
            update({ cell: null, sel: ids, area: null });
          }}
          onMove={(position) => update({ map: roundPosition(position) })}
          onBinning={(b) => setBinning(() => b)}
          area={state.area}
          onArea={(area) => {
            setPicked(true);
            update({ area, cell: null, sel: [], matrix: { ...state.matrix, page: 1 } });
          }}
        />
        {(sitesData || sitesFailed) && (
          <SitesPanel
            data={sitesData}
            failed={sitesFailed}
            show={state.sites}
            site={site}
            radius={state.radius}
            onShow={(sites) => update({ sites })}
            onSite={(id) => update({ site: id, cell: null, sel: [], area: null, page: 1, matrix: { ...state.matrix, page: 1 } })}
            onRadius={(radius) => update({ radius, cell: null, sel: [], page: 1, matrix: { ...state.matrix, page: 1 } })}
          />
        )}
        {areaCompanies && (
          <AreaPanel companies={areaCompanies} focus={picked} actions={shortlistButton} onClear={() => update({ cell: null, sel: [], area: null })} />
        )}
        <Matrix
          taxonomy={data.taxonomy}
          companies={areaCompanies ?? filtered}
          selectedCaps={state.filters.cap}
          group={state.matrix.group}
          page={state.matrix.page}
          inArea={areaCompanies !== null}
          onToggleCap={(slug, on) => toggle('cap', slug, on)}
          onGroup={(group) => update({ matrix: { group, page: state.matrix.page } })}
          onPage={(page) => update({ matrix: { ...state.matrix, page } })}
        />
        <ResultsList companies={filtered} page={state.page} onPage={(page) => update({ page })} actions={shortlistButton} />
        <OverseasList companies={facetFiltered} overlap={overlapOn} actions={shortlistButton} />
        <Growth month={state.month} onMonth={(month) => update({ month })} />
      </div>
    </div>
  );
}
