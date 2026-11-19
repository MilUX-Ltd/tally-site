// The explorer island: filters, heatmap, area list and results. Its whole
// state is one ViewState, kept in the URL (src/lib/url-state.ts).
import '../styles/explorer.css';
import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import AreaPanel from './AreaPanel';
import Filters from './Filters';
import MapView, { type Binning } from './MapView';
import ResultsList from './ResultsList';
import { emptyFilters, filterCompanies, isLocated, type Facet } from '../lib/filters';
import { companiesInBbox } from '../lib/matrix';
import type { TallyData } from '../lib/types';
import { fromQuery, roundPosition, sanitiseState, toQuery, type ViewState } from '../lib/url-state';
import Matrix from './Matrix';
import Shortlist from './Shortlist';
import CapMatchToggle from './CapMatchToggle';
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
  const facetFiltered = useMemo(() => (data ? filterCompanies(data.companies, state.filters) : []), [data, state.filters]);
  const filtered = useMemo(() => {
    if (!overlapOn) return facetFiltered;
    return binning ? binning.overlapCompanies(facetFiltered, state.filters.cap) : [];
  }, [overlapOn, binning, facetFiltered, state.filters.cap]);
  const onMap = useMemo(() => filtered.filter(isLocated).length, [filtered]);
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
      return { ...s, filters: { ...s.filters, [facet]: on ? [...values, value] : values }, page: 1, matrix: { ...s.matrix, page: 1 } };
    });

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
          onClear={() => update({ filters: emptyFilters(), page: 1, matrix: { ...state.matrix, page: 1 } })}
        />
        <Shortlist companies={shortlisted} taxonomy={data.taxonomy} shareUrl={shareUrl} onRemove={removeFromList} />
      </aside>
      <div class="explorer-main">
        {state.filters.cap.length >= 2 && (
          <CapMatchToggle
            count={state.filters.cap.length}
            value={state.capMatch}
            onChange={(capMatch) => update({ capMatch, cell: null, page: 1, matrix: { ...state.matrix, page: 1 } })}
          />
        )}
        <p id="result-count" role="status">
          {plural(filtered.length, 'company matches', 'companies match')}; {onMap} on the map
          {overlapOn ? `, in ${plural(places, 'place', 'places')} where all chosen capabilities overlap` : ''}.
        </p>
        <MapView
          companies={filtered}
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
      </div>
    </div>
  );
}
