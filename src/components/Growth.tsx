// Growth over time: replay the directory's size month by month, from a small
// file built at build time from the data repo's git history
// (scripts/build-history.mjs). The chosen month is held in the URL.
import { useEffect, useRef, useState } from 'preact/hooks';
import { monthLabel, type History } from '../lib/history';

interface Props {
  month: string | null;
  onMonth: (month: string | null) => void;
}

const nf = new Intl.NumberFormat('en-GB');

export default function Growth({ month, onMonth }: Props) {
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch('/data/history.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((h: History) => setHistory(h))
      .catch(() => setFailed(true));
  }, []);

  const months = history?.months ?? [];
  const last = months.length - 1;
  const found = month ? months.findIndex((m) => m.month === month) : -1;
  const index = found >= 0 ? found : last;
  const choose = (i: number) => onMonth(i >= last ? null : months[i].month);

  // A month the history does not hold (or the latest, which is the default) leaves the URL.
  useEffect(() => {
    if (history && month && found < 0) onMonth(null);
  }, [history, month, found]);

  useEffect(() => {
    if (!playing) return undefined;
    timer.current = window.setTimeout(() => {
      if (index >= last) setPlaying(false);
      else choose(index + 1);
    }, 900);
    return () => window.clearTimeout(timer.current);
  }, [playing, index, last]);

  if (failed) return null;
  if (!history || !months.length) return null;
  const current = months[index];
  const max = Math.max(1, ...months.flatMap((m) => Object.values(m.groups)));
  const label = monthLabel(current.month);

  return (
    <section class="growth" aria-labelledby="growth-heading">
      <h2 id="growth-heading">Growth over time</h2>
      <p>
        Replay how the directory has grown, month by month, from its public history. The history starts in {monthLabel(months[0].month)}, so
        earlier growth is not shown. Group counts use today's capability list, so tags that have since changed are not counted.
      </p>
      <div class="growth-controls">
        <label for="growth-month">Month</label>
        <input
          id="growth-month"
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-valuetext={`${label}: ${nf.format(current.total)} companies`}
          onInput={(e) => {
            setPlaying(false);
            choose(Number((e.currentTarget as HTMLInputElement).value));
          }}
        />
        <button
          type="button"
          class="secondary"
          aria-pressed={playing}
          onClick={() => {
            if (!playing && index >= last) choose(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <p class="growth-total">
        <output for="growth-month" id="growth-total">
          {label}: {nf.format(current.total)} companies
          {current.carried && index > 0 ? ` (no update that month; same as ${monthLabel(months[index - 1].month).split(' ')[0]})` : ''}
        </output>
      </p>
      <table class="growth-table">
        <caption class="vh">Companies by capability group in {label}</caption>
        <thead>
          <tr>
            <th scope="col">Capability group</th>
            <th scope="col">Companies</th>
          </tr>
        </thead>
        <tbody>
          {history.groups.map((g) => {
            const n = current.groups[g.slug] ?? 0;
            return (
              <tr key={g.slug}>
                <th scope="row">{g.label}</th>
                <td>
                  <span class="num-bar">
                    {nf.format(n)}
                    <svg class="bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <rect x="0" y="0" height="10" width={(100 * n) / max} />
                    </svg>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
