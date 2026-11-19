// The cluster and kind filter on /opportunities. Progressive enhancement:
// without this module the full list shows and the form stays hidden. The
// filter is held in the URL (cluster, kind) without adding history entries.
import { countText, filterQuery, matches, parseFilter, type OpportunityFilter, type OpportunityKind } from '../lib/opportunities';

const form = document.getElementById('opp-filter') as HTMLFormElement | null;
const select = document.getElementById('opp-cluster') as HTMLSelectElement | null;
const count = document.getElementById('opp-count');
const none = document.getElementById('opp-none');
const items = [...document.querySelectorAll<HTMLLIElement>('#opp-list .opportunity')];

if (form && select && count && none) {
  const ids = [...select.options].map((o) => o.value).filter(Boolean);
  const radios = [...form.querySelectorAll<HTMLInputElement>('input[name="kind"]')];

  const apply = (filter: OpportunityFilter, updateUrl: boolean) => {
    let shown = 0;
    for (const li of items) {
      const show = matches({ cluster: li.dataset.cluster ?? '', kind: (li.dataset.kind ?? '') as OpportunityKind }, filter);
      li.hidden = !show;
      if (show) shown++;
    }
    count.textContent = countText(shown, items.length);
    none.hidden = shown > 0;
    if (updateUrl) {
      const query = filterQuery(filter);
      history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  };
  const read = (): OpportunityFilter => {
    const kind = radios.find((r) => r.checked)?.value ?? '';
    return parseFilter(filterQuery({ cluster: select.value || null, kind: (kind || null) as OpportunityKind | null }), ids);
  };

  const initial = parseFilter(location.search, ids);
  select.value = initial.cluster ?? '';
  for (const r of radios) r.checked = r.value === (initial.kind ?? '');
  form.hidden = false;
  apply(initial, false);

  form.addEventListener('change', () => apply(read(), true));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply(read(), true);
  });
}
