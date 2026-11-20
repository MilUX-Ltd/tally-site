// The growth chart on New companies: the directory's size month by month,
// drawn as the hexagon columns of the Find map. Geometry is worked out at
// build time and written as SVG attributes (the CSP allows no style
// attributes). Plain TypeScript, no framework imports.
import { monthLabel, type History, type HistoryMonth } from './history';

/** The data ramp, low to high (the tokens --ramp-1 to --ramp-4 in base.css). */
export const RAMP = ['#F2D9A6', '#EDA552', '#E2611C', '#8A2B0A'] as const;
export type RampStep = 0 | 1 | 2 | 3;

/** Where a value sits on the ramp between the lowest and highest value shown. */
export function rampStep(value: number, min: number, max: number): RampStep {
  if (max <= min) return 3;
  const t = (value - min) / (max - min);
  return Math.min(3, Math.max(0, Math.floor(t * 4))) as RampStep;
}

/** A ramp colour darkened for the side of a column: `amount` 0 (as is) to 1. */
export function shade(hex: string, amount: number): string {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels.map((c) => Math.round(c * (1 - amount)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export interface GrowthColumn {
  month: string;
  label: string;
  /** "Jun" */
  short: string;
  /** "26", the year's last two digits */
  year: string;
  total: number;
  carried: boolean;
  step: RampStep;
  /** SVG polygon points: the top hexagon, the three sides that face the reader, and the flat shadow. */
  top: string;
  left: string;
  front: string;
  right: string;
  shadow: string;
  fills: { top: string; left: string; front: string; right: string };
}

export interface GrowthChart {
  width: number;
  height: number;
  /** The ground line the columns stand on. */
  ground: number;
  columns: GrowthColumn[];
  /** The accessible name of the drawing. */
  summary: string;
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SQUASH = 0.5;
const round = (n: number) => Math.round(n * 10) / 10;
const points = (list: Array<[number, number]>) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');

/**
 * One column per month, evenly spaced across the width so a row of labels in
 * as many equal columns lines up beneath. Heights are in proportion to the
 * total, from nought; the colour is the month's place on the ramp between the
 * smallest and largest month.
 */
export function growthChart(months: HistoryMonth[], width = 600, height = 300): GrowthChart {
  const nf = new Intl.NumberFormat('en-GB');
  const n = Math.max(1, months.length);
  const slot = width / n;
  const r = Math.min(slot * 0.4, 56);
  const depth = r * Math.sin(Math.PI / 3) * SQUASH;
  const ground = height - depth - 12;
  const tallest = ground - depth - 8;
  const totals = months.map((m) => m.total);
  const [min, max] = [Math.min(...totals), Math.max(1, ...totals)];
  const columns = months.map((m, i): GrowthColumn => {
    const cx = slot * (i + 0.5);
    const rise = Math.max(4, (tallest * m.total) / max);
    const at = (deg: number, y: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), y + r * SQUASH * Math.sin((deg * Math.PI) / 180)];
    const topY = ground - rise;
    const side = (a: number, b: number) => points([at(a, topY), at(b, topY), at(b, ground), at(a, ground)]);
    const step = rampStep(m.total, min, max);
    const colour = RAMP[step];
    const [y, mm] = m.month.split('-');
    return {
      month: m.month,
      label: monthLabel(m.month),
      short: SHORT[Number(mm) - 1] ?? m.month,
      year: y.slice(2),
      total: m.total,
      carried: m.carried,
      step,
      top: points([0, 60, 120, 180, 240, 300].map((d) => at(d, topY))),
      right: side(0, 60),
      front: side(60, 120),
      left: side(120, 180),
      shadow: points([0, 60, 120, 180, 240, 300].map((d) => at(d, ground)).map(([px, py]): [number, number] => [px + 7, py + 7])),
      fills: { top: colour, left: shade(colour, 0.1), front: shade(colour, 0.2), right: shade(colour, 0.34) },
    };
  });
  const first = months[0];
  const last = months[months.length - 1];
  const summary = first && last ? `Companies in Tally by month, from ${nf.format(first.total)} in ${monthLabel(first.month)} to ${nf.format(last.total)} in ${monthLabel(last.month)}.` : 'Companies in Tally by month.';
  return { width, height, ground, columns, summary };
}

/** The largest count any capability group reaches in any month (at least 1). */
export const groupMax = (history: History) => Math.max(1, ...history.months.flatMap((m) => Object.values(m.groups)));

/** The line under the chart: the month, its total and, when the data did not change, a note. */
export function monthReadout(months: HistoryMonth[], index: number): { label: string; total: string; note: string } {
  const nf = new Intl.NumberFormat('en-GB');
  const m = months[index];
  const note = m.carried && index > 0 ? ` (no update that month; same as ${monthLabel(months[index - 1].month).split(' ')[0]})` : '';
  return { label: monthLabel(m.month), total: nf.format(m.total), note };
}
