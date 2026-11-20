import { describe, expect, it } from 'vitest';
import { fromFixture } from '../../scripts/build-history.mjs';
import { growthChart, monthReadout, RAMP, rampStep, shade } from '../../src/lib/growth-chart';
import type { History } from '../../src/lib/history';
import { weeklyCounts, WEEKS, type NewWeek } from '../../src/lib/new-companies';
import { barFill, daysLeftUnit, daysUntil, localToday, urgency } from '../../src/lib/opportunities';

describe('the deadline board', () => {
  it('counts whole days between calendar dates', () => {
    expect(daysUntil('2099-03-12', '2099-03-02')).toBe(10);
    expect(daysUntil('2099-03-12', '2099-03-12')).toBe(0);
    expect(daysUntil('2099-03-12', '2099-03-13')).toBe(-1);
    expect(daysUntil('2027-01-11', '2026-11-20')).toBe(52);
    // Across the clocks changing, a day is still a day.
    expect(daysUntil('2027-03-29', '2027-03-27')).toBe(2);
    expect(daysUntil('soon', '2099-03-02')).toBeNull();
  });
  it("reads today from the reader's own calendar", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('steps up the ramp and fills the bar as the deadline nears', () => {
    expect([90, 61, 60, 31, 30, 8, 7, 0].map(urgency)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(barFill(0)).toBe(100);
    expect(barFill(45)).toBe(50);
    expect(barFill(90)).toBe(2);
    expect(barFill(400)).toBe(2);
    expect(barFill(10)).toBeGreaterThan(barFill(30));
    expect([0, 1, 2].map(daysLeftUnit)).toEqual(['days left', 'day left', 'days left']);
  });
});

describe('the growth chart', () => {
  const history = fromFixture() as History;
  it('draws one column a month, taller and darker as the directory grows', () => {
    const chart = growthChart(history.months);
    expect(chart.columns.map((c) => c.total)).toEqual([20, 26, 26, 26, 30, 32]);
    expect(chart.columns[0].fills.top).toBe(RAMP[0]);
    expect(chart.columns[5].fills.top).toBe(RAMP[3]);
    const topY = (points: string) => Math.min(...points.split(' ').map((p) => Number(p.split(',')[1])));
    expect(topY(chart.columns[5].top)).toBeLessThan(topY(chart.columns[0].top));
    expect(topY(chart.columns[1].top)).toBe(topY(chart.columns[2].top));
    // Evenly spaced, so a row of equal-width labels lines up beneath.
    const xs = chart.columns.map((c) => Number(c.top.split(' ')[0].split(',')[0]));
    expect(Math.round(xs[1] - xs[0])).toBe(Math.round(chart.width / 6));
    expect(chart.summary).toBe('Companies in Tally by month, from 20 in June 2026 to 32 in November 2026.');
    for (const c of chart.columns) expect(Object.values(c.fills).every((f) => /^#[0-9A-F]{6}$/.test(f))).toBe(true);
  });
  it('places values on the ramp and darkens a colour for a side', () => {
    expect([0, 24, 25, 50, 75, 100].map((v) => rampStep(v, 0, 100))).toEqual([0, 0, 1, 2, 3, 3]);
    expect(rampStep(5, 5, 5)).toBe(3);
    expect(shade('#FFFFFF', 0)).toBe('#FFFFFF');
    expect(shade('#F2D9A6', 0.5)).toBe('#796D53');
  });
  it('says when a month had no update', () => {
    expect(monthReadout(history.months, 3)).toEqual({ label: 'September 2026', total: '26', note: ' (no update that month; same as August)' });
    expect(monthReadout(history.months, 5).note).toBe('');
  });
});

describe('the weekly strip', () => {
  it('counts every week the list covers, oldest first, empty weeks included', () => {
    const entry = { id: 'a', name: 'A', path: '/companies/a/', region: '', capabilities: [], summary: '', added: '' };
    const weeks: NewWeek[] = [
      { week: '2026-11-16', label: '', entries: [entry, entry] },
      { week: '2026-10-12', label: '', entries: [entry] },
    ];
    const strip = weeklyCounts(weeks);
    expect(strip).toHaveLength(WEEKS);
    expect(strip[0].week).toBe('2026-08-31');
    expect(strip.at(-1)).toEqual({ week: '2026-11-16', short: '16 Nov', long: '16 November 2026', count: 2 });
    expect(strip.filter((w) => w.count > 0).map((w) => [w.week, w.count])).toEqual([['2026-10-12', 1], ['2026-11-16', 2]]);
    expect(weeklyCounts([])).toEqual([]);
  });
});
