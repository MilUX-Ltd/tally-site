// The deadline board on /opportunities. Progressive enhancement: without this
// module the dates and the full list show and the filter stays hidden.
// 1. Countdowns: the days to each deadline, counted here from the dates (the
//    site is static, so a count made at build would go stale), the bar that
//    fills as the deadline nears and its step on the data ramp.
// 2. The kind and cluster chips, held in the URL without adding history
//    entries.
import {
  barFill,
  countText,
  daysLeftUnit,
  daysUntil,
  filterQuery,
  localToday,
  matches,
  parseFilter,
  SOON_DAYS,
  urgency,
  type OpportunityFilter,
  type OpportunityKind,
} from '../lib/opportunities';

const items = [...document.querySelectorAll<HTMLLIElement>('.opp-list .opportunity')];
const today = localToday();
const nf = new Intl.NumberFormat('en-GB');

/** Writes the count into a countdown block: the numeral and its unit. */
function showCount(block: Element | null, numeral: string, unit: string) {
  const n = block?.querySelector('.n');
  const u = block?.querySelector('.u');
  if (n) n.textContent = numeral;
  if (u) u.textContent = unit;
}

let soon = 0;
let nextUp: { li: HTMLLIElement; days: number } | null = null;
for (const li of items) {
  const deadline = li.dataset.deadline;
  if (!deadline) continue;
  const days = daysUntil(deadline, today);
  if (days === null) continue;
  const block = li.querySelector('.countdown');
  const flag = li.querySelector<HTMLElement>('.flag');
  if (days < 0) {
    // Passed since the site was last built.
    showCount(block, 'Closed', '');
    li.dataset.closed = '';
    continue;
  }
  showCount(block, nf.format(days), daysLeftUnit(days));
  li.dataset.days = String(days);
  li.dataset.urgency = String(urgency(days));
  li.querySelector('.deadline-bar .fill')?.setAttribute('width', String(barFill(days)));
  li.querySelector('.bar-wrap')?.removeAttribute('hidden');
  if (flag && days <= 1) {
    flag.textContent = days === 0 ? 'Closes today' : 'Closes tomorrow';
    flag.hidden = false;
  }
  if (days <= SOON_DAYS) soon++;
  if (!nextUp) nextUp = { li, days };
}
// The note about the bars shows only once the bars are drawn.
for (const note of document.querySelectorAll<HTMLElement>('.bar-note')) note.hidden = false;
const soonFact = document.getElementById('fact-soon');
if (soonFact) soonFact.textContent = String(soon);

// The call that closes next, counted the same way. If the one built into the
// page has since closed, the next open one takes its place.
const spot = document.getElementById('next-up');
if (spot) {
  if (!nextUp) spot.hidden = true;
  else {
    const { li, days } = nextUp;
    const source = li.querySelector<HTMLAnchorElement>('h3 a');
    const link = spot.querySelector<HTMLAnchorElement>('.next-title a');
    if (source && link && link.href !== source.href) {
      link.href = source.href;
      link.textContent = source.textContent;
      const meta = spot.querySelector('.next-meta');
      if (meta) meta.textContent = [li.querySelector('.tag')?.textContent, li.querySelector('.meta .mono')?.textContent, li.querySelector('.deadline')?.textContent].filter(Boolean).join(' · ');
    }
    showCount(spot.querySelector('.next-count'), nf.format(days), daysLeftUnit(days));
    spot.dataset.urgency = String(urgency(days));
  }
}

const form = document.getElementById('opp-filter') as HTMLFormElement | null;
const count = document.getElementById('opp-count');
const none = document.getElementById('opp-none');

if (form && count && none) {
  const radios = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  const kinds = radios('kind');
  const clusters = radios('cluster');
  const ids = clusters.map((r) => r.value).filter(Boolean);
  const sections = [...document.querySelectorAll<HTMLElement>('section.board')];

  const apply = (filter: OpportunityFilter, updateUrl: boolean) => {
    let shown = 0;
    for (const li of items) {
      const show = matches({ cluster: li.dataset.cluster ?? '', kind: (li.dataset.kind ?? '') as OpportunityKind }, filter);
      li.hidden = !show;
      if (show) shown++;
    }
    // A group with nothing left to show goes with its heading.
    for (const section of sections) section.hidden = !section.querySelector('.opportunity:not([hidden])');
    count.textContent = countText(shown, items.length);
    none.hidden = shown > 0;
    if (updateUrl) {
      const query = filterQuery(filter);
      history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    }
  };
  const checked = (list: HTMLInputElement[]) => list.find((r) => r.checked)?.value ?? '';
  const read = (): OpportunityFilter => parseFilter(filterQuery({ cluster: checked(clusters) || null, kind: (checked(kinds) || null) as OpportunityKind | null }), ids);

  const initial = parseFilter(location.search, ids);
  for (const r of clusters) r.checked = r.value === (initial.cluster ?? '');
  for (const r of kinds) r.checked = r.value === (initial.kind ?? '');
  form.hidden = false;
  apply(initial, false);

  form.addEventListener('change', () => apply(read(), true));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply(read(), true);
  });
}
