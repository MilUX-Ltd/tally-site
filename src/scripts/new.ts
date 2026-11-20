// New companies (/new). Progressive enhancement: the chart, the figures and
// every week are built into the page; this module adds
// 1. the month slider on the growth chart, with the chosen month held in the
//    URL (?month=YYYY-MM, left out for the latest month) and a Play button
//    that replays the months (not offered under reduced motion);
// 2. opening a week when the address points at it (#w-YYYY-MM-DD).
import { rampStep } from '../lib/growth-chart';
import { MONTH, monthLabel, type HistoryMonth } from '../lib/history';

const nf = new Intl.NumberFormat('en-GB');
const section = document.getElementById('growth');
const controls = document.getElementById('growth-controls');
const slider = document.getElementById('growth-month') as HTMLInputElement | null;
const play = document.getElementById('growth-play');

if (section && controls && slider && play && section.dataset.history) {
  const { groups, months } = JSON.parse(section.dataset.history) as { groups: string[]; months: HistoryMonth[] };
  const last = months.length - 1;
  const max = Math.max(1, ...months.flatMap((m) => Object.values(m.groups)));
  const columns = [...section.querySelectorAll('.growth-chart .column')];
  const ticks = [...section.querySelectorAll('.growth-axis li')];
  const rows = new Map([...section.querySelectorAll<HTMLTableRowElement>('.growth-groups tbody tr')].map((tr) => [tr.dataset.group, tr]));
  const el = (id: string) => document.getElementById(id);
  let index = last;
  let timer: number | undefined;

  const setUrl = (month: string | null) => {
    const url = new URL(location.href);
    if (month) url.searchParams.set('month', month);
    else url.searchParams.delete('month');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const show = (i: number, updateUrl: boolean) => {
    index = Math.min(last, Math.max(0, i));
    const m = months[index];
    const label = monthLabel(m.month);
    const total = nf.format(m.total);
    const set = (id: string, text: string) => {
      const node = el(id);
      if (node) node.textContent = text;
    };
    set('growth-label', `${label}: `);
    set('growth-count', total);
    set('growth-carried', m.carried && index > 0 ? ` (no update that month; same as ${monthLabel(months[index - 1].month).split(' ')[0]})` : '');
    set('growth-caption', `Companies by capability group in ${label}`);
    slider.value = String(index);
    slider.setAttribute('aria-valuetext', `${label}: ${total} companies`);
    columns.forEach((c, n) => c.classList.toggle('is-current', n === index));
    ticks.forEach((t, n) => t.classList.toggle('is-current', n === index));
    for (const slug of groups) {
      const tr = rows.get(slug);
      if (!tr) continue;
      const n = m.groups[slug] ?? 0;
      const cell = tr.querySelector('td.num');
      if (cell) cell.textContent = nf.format(n);
      tr.querySelector('rect')?.setAttribute('width', String((100 * n) / max));
      tr.dataset.step = String(rampStep(n, 0, max) + 1);
    }
    // The latest month is the default, so it leaves the URL.
    if (updateUrl) setUrl(index >= last ? null : m.month);
  };

  const stop = () => {
    window.clearTimeout(timer);
    timer = undefined;
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Play';
  };
  const step = () => {
    timer = window.setTimeout(() => {
      if (index >= last) stop();
      else {
        show(index + 1, true);
        step();
      }
    }, 900);
  };

  // A month in the address opens on it; one the history does not hold leaves the URL.
  const asked = new URLSearchParams(location.search).get('month');
  const found = asked && MONTH.test(asked) ? months.findIndex((m) => m.month === asked) : -1;
  if (asked !== null && (found < 0 || found === last)) setUrl(null);
  show(found >= 0 ? found : last, false);
  controls.hidden = false;

  slider.addEventListener('input', () => {
    stop();
    show(Number(slider.value), true);
  });
  play.addEventListener('click', () => {
    if (timer !== undefined) {
      stop();
      return;
    }
    if (index >= last) show(0, true);
    play.setAttribute('aria-pressed', 'true');
    play.textContent = 'Pause';
    step();
  });
  columns.forEach((c, n) =>
    c.addEventListener('click', () => {
      stop();
      show(n, true);
    }),
  );
}

// A week linked by its address opens (a closed week hides its companies).
const openTarget = () => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!/^w-\d{4}-\d{2}-\d{2}$/.test(id)) return;
  const details = document.getElementById(id)?.closest('details');
  if (details) details.open = true;
};
openTarget();
window.addEventListener('hashchange', openTarget);
