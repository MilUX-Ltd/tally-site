// The filter panel: capabilities by group, then company facets.
import { useEffect, useState } from 'preact/hooks';
import { activeFilterCount, type Facet, type Filters as FilterState } from '../lib/filters';
import type { Option, Taxonomy } from '../lib/types';

interface Props {
  taxonomy: Taxonomy;
  filters: FilterState;
  onToggle: (facet: Facet, value: string, on: boolean) => void;
  onClear: () => void;
}

function Choices({ facet, title, options, filters, onToggle }: { facet: Facet; title: string; options: Option[] } & Pick<Props, 'filters' | 'onToggle'>) {
  const selected = filters[facet];
  const count = options.filter((o) => selected.includes(o.slug)).length;
  return (
    <details class="filter-group">
      <summary>
        {title}
        {count > 0 && <span class="filter-count"> ({count} selected)</span>}
      </summary>
      <fieldset>
        <legend class="vh">{title}</legend>
        {options.map((o) => (
          <label key={o.slug} class={o.slug.includes('/') ? 'choice child' : 'choice'}>
            <input
              type="checkbox"
              checked={selected.includes(o.slug)}
              onChange={(e) => onToggle(facet, o.slug, (e.currentTarget as HTMLInputElement).checked)}
            />{' '}
            {o.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export default function Filters({ taxonomy, filters, onToggle, onClear }: Props) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 60rem)').matches) setOpen(false);
  }, []);
  const count = activeFilterCount(filters);
  return (
    <div class="filters">
      <button type="button" class="filters-toggle" aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen(!open)}>
        Filters{count > 0 ? ` (${count} selected)` : ''}
      </button>
      <div id="filter-panel" hidden={!open}>
        <h2>Capabilities</h2>
        {taxonomy.groups.map((g) => (
          <Choices
            key={g.slug}
            facet="cap"
            title={g.label}
            options={taxonomy.capabilities.filter((c) => c.group === g.slug)}
            filters={filters}
            onToggle={onToggle}
          />
        ))}
        <h2>Companies</h2>
        <Choices facet="size" title="Size" options={taxonomy.sizes} filters={filters} onToggle={onToggle} />
        <Choices facet="region" title="Region" options={taxonomy.regions} filters={filters} onToggle={onToggle} />
        <Choices facet="fw" title="Frameworks" options={taxonomy.frameworks} filters={filters} onToggle={onToggle} />
        <Choices facet="accr" title="Accreditations" options={taxonomy.accreditations} filters={filters} onToggle={onToggle} />
        <Choices facet="mbr" title="Memberships" options={taxonomy.memberships} filters={filters} onToggle={onToggle} />
        <button type="button" class="secondary" onClick={onClear} disabled={count === 0}>
          Clear all filters
        </button>
      </div>
    </div>
  );
}
