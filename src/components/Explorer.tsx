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

  const filtered = useMemo(() => (data ? filterCompanies(data.companies, state.filters) : []), [data, state.filters]);
  const onMap = useMemo(() => filtered.filter(isLocated).length, [filtered]);

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

  if (failed) return <p class="notice">The company data could not be loaded. Please refresh the page to try again.</p>;
  if (!data) return <p class="notice">Loading companies.</p>;

  return (
    <div class="explorer">
      <aside class="explorer-filters" aria-label="Filters">
        <Filters
          taxonomy={data.taxonomy}
          filters={state.filters}
          onToggle={toggle}
          onClear={() => update({ filters: emptyFilters(), page: 1, matrix: { ...state.matrix, page: 1 } })}
        />
      </aside>
      <div class="explorer-main">
        <p id="result-count" role="status">
          {plural(filtered.length, 'company matches', 'companies match')}; {onMap} on the map.
        </p>
        <MapView
          companies={filtered}
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
          <AreaPanel companies={areaCompanies} focus={picked} onClear={() => update({ cell: null, sel: [], area: null })} />
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
        <ResultsList companies={filtered} page={state.page} onPage={(page) => update({ page })} />
      </div>
    </div>
  );
}
