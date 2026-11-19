// The explorer island: filters, heatmap, area list and results.
import '../styles/explorer.css';
import { useEffect, useMemo, useState } from 'preact/hooks';
import AreaPanel from './AreaPanel';
import Filters from './Filters';
import MapView, { type Binning } from './MapView';
import ResultsList from './ResultsList';
import { emptyFilters, filterCompanies, isLocated, type Facet, type Filters as FilterState } from '../lib/filters';
import type { TallyData } from '../lib/types';

type Area = { kind: 'cell'; cell: string } | { kind: 'ids'; ids: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Explorer() {
  const [data, setData] = useState<TallyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filters, setFilters] = useState<FilterState>(emptyFilters());
  const [area, setArea] = useState<Area | null>(null);
  const [binning, setBinning] = useState<Binning | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/data/tally.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: TallyData) => setData(d))
      .catch(() => setFailed(true));
  }, []);

  const filtered = useMemo(() => (data ? filterCompanies(data.companies, filters) : []), [data, filters]);
  const onMap = useMemo(() => filtered.filter(isLocated).length, [filtered]);

  const areaCompanies = useMemo(() => {
    if (!area) return null;
    const ids = new Set(area.kind === 'cell' ? (binning ? binning.companiesInCell(filtered, area.cell) : []) : area.ids);
    return filtered.filter((c) => ids.has(c.id));
  }, [area, binning, filtered]);

  const toggle = (facet: Facet, value: string, on: boolean) => {
    setFilters((f) => ({ ...f, [facet]: on ? [...f[facet].filter((v) => v !== value), value] : f[facet].filter((v) => v !== value) }));
    setPage(1);
  };

  if (failed) return <p class="notice">The company data could not be loaded. Please refresh the page to try again.</p>;
  if (!data) return <p class="notice">Loading companies.</p>;

  return (
    <div class="explorer">
      <aside class="explorer-filters" aria-label="Filters">
        <Filters
          taxonomy={data.taxonomy}
          filters={filters}
          onToggle={toggle}
          onClear={() => {
            setFilters(emptyFilters());
            setPage(1);
          }}
        />
      </aside>
      <div class="explorer-main">
        <p id="result-count" role="status">
          {plural(filtered.length, 'company matches', 'companies match')}; {onMap} on the map.
        </p>
        <MapView
          companies={filtered}
          selectedCell={area?.kind === 'cell' ? area.cell : null}
          onSelectCell={(cell) => setArea({ kind: 'cell', cell })}
          onSelectIds={(ids) => setArea({ kind: 'ids', ids })}
          onBinning={(b) => setBinning(() => b)}
        />
        {areaCompanies && <AreaPanel companies={areaCompanies} onClear={() => setArea(null)} />}
        <ResultsList companies={filtered} page={page} onPage={setPage} />
      </div>
    </div>
  );
}
