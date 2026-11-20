// The filter groups shown in the Filters side panel: capabilities by group,
// then company facets.
import { useEffect, useRef } from 'preact/hooks';
import type { Facet, Filters as FilterState } from '../lib/filters';
import type { Option, Taxonomy } from '../lib/types';

interface Props {
  taxonomy: Taxonomy;
  filters: FilterState;
  onToggle: (facet: Facet, value: string, on: boolean) => void;
  /** Goes up by one each time a search sets the filters or the panel opens. */
  reveal: number;
}

function Choices({ facet, title, options, filters, onToggle, reveal }: { facet: Facet; title: string; options: Option[] } & Pick<Props, 'filters' | 'onToggle' | 'reveal'>) {
  const selected = filters[facet];
  const count = options.filter((o) => selected.includes(o.slug)).length;
  // After a search sets the filters, and when the panel opens, groups holding
  // a chosen value open so the choices are visible. They never close on their own.
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (reveal > 0 && count > 0 && details.current) details.current.open = true;
    // Only a new search should open groups, not every change of count.
  }, [reveal]);
  return (
    <details class="filter-group" ref={details}>
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

export default function Filters({ taxonomy, filters, onToggle, reveal }: Props) {
  return (
    <div class="filters">
      <h3>Capabilities</h3>
      {taxonomy.groups.map((g) => (
        <Choices
          key={g.slug}
          facet="cap"
          title={g.label}
          options={taxonomy.capabilities.filter((c) => c.group === g.slug)}
          filters={filters}
          reveal={reveal}
          onToggle={onToggle}
        />
      ))}
      <h3>Companies</h3>
      <Choices facet="size" title="Size" options={taxonomy.sizes} filters={filters} onToggle={onToggle} reveal={reveal} />
      <Choices facet="region" title="Region" options={taxonomy.regions} filters={filters} onToggle={onToggle} reveal={reveal} />
      <Choices facet="fw" title="Frameworks" options={taxonomy.frameworks} filters={filters} onToggle={onToggle} reveal={reveal} />
      <Choices facet="accr" title="Accreditations" options={taxonomy.accreditations} filters={filters} onToggle={onToggle} reveal={reveal} />
      <Choices facet="mbr" title="Memberships" options={taxonomy.memberships} filters={filters} onToggle={onToggle} reveal={reveal} />
    </div>
  );
}
