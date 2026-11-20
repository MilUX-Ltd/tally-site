// The cluster atlas geometry and the events calendar file.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { atlasFrame, labelSide, project, rampLabel, rampStep, regionBox, regionPath, shortCode, spreadLabels } from '../../src/lib/cluster-atlas';
import type { Cluster, ClusterEvent, RegionsData } from '../../src/lib/clusters';
import { eventsIcs, foldLine } from '../../src/lib/events-ics';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const regions = (read('../../public/clusters/cluster-regions.geojson') as RegionsData).features;
const clusters = read('../fixtures/clusters.json').clusters as Cluster[];

describe('cluster atlas', () => {
  const frame = atlasFrame(regions);

  it('frames every region and draws each as a closed path of whole numbers', () => {
    expect(frame.height).toBeGreaterThan(frame.width);
    for (const f of regions) {
      const d = regionPath(frame, f);
      expect(d).toMatch(/^M\d+ \d+(l-?\d+ -?\d+)+z/);
      expect(d).not.toMatch(/[.e]/);
      const [x, y, w, h] = regionBox(frame, f);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(Math.ceil(frame.width) + 1);
      expect(y + h).toBeLessThanOrEqual(Math.ceil(frame.height) + 1);
    }
  });

  it('puts north at the top and east to the right', () => {
    const [londonX, londonY] = project(frame, -0.1, 51.5);
    const [glasgowX, glasgowY] = project(frame, -4.25, 55.86);
    expect(glasgowY).toBeLessThan(londonY);
    expect(glasgowX).toBeLessThan(londonX);
  });

  it('names western clusters on the left and eastern ones on the right', () => {
    const side = (id: string) => {
      const p = regions.find((f) => f.properties.id === id)!.properties;
      return labelSide(p.lon, p.lat);
    };
    for (const id of ['NIDSC', 'ScotlandDSC', 'WalesDSC', 'SWRDSC', 'NWRDSC']) expect(side(id), id).toBe('left');
    for (const id of ['NERDSC', 'YRDSC', 'ERDSC', 'LRDSC', 'SERDSC', 'GLRDSC']) expect(side(id), id).toBe('right');
  });

  it('spreads labels so none overlap and all stay inside', () => {
    const out = spreadLabels([{ y: 700 }, { y: 705 }, { y: 710 }, { y: 100 }, { y: 104 }], 40, 720, 46);
    const ys = out.map((o) => o.labelY);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(46);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(40);
    expect(Math.max(...ys)).toBeLessThanOrEqual(720);
  });

  it('steps the data ramp by whole events, sized to the busiest cluster', () => {
    expect([0, 1, 2, 3, 4].map((n) => rampStep(n, 4))).toEqual([0, 1, 2, 3, 4]);
    expect([1, 2].map((n) => rampStep(n, 2))).toEqual([1, 2]);
    expect([1, 2, 3, 8, 9].map((n) => rampStep(n, 9))).toEqual([1, 1, 1, 3, 3]);
    expect(rampLabel(2, 4)).toBe('2');
    expect(rampLabel(2, 9)).toBe('4 to 6');
  });

  it('shortens cluster ids to map codes', () => {
    expect(['SWRDSC', 'WalesDSC', 'LRDSC', 'ScotlandDSC'].map(shortCode)).toEqual(['SW', 'WALES', 'L', 'SCOTLAND']);
  });
});

describe('events calendar file', () => {
  const events: ClusterEvent[] = [
    { audience: 'public', cluster: 'SCRDSC', date: '2099-12-31', time: '10:00', where: 'Hall; Room 2, Portsmouth', title: 'A, B; and C\\D', summary: 'Line one\nBEGIN:VEVENT', link: 'https://example.org/a' },
    { audience: 'members', cluster: 'WalesDSC', date: '2099-04-20', text: "Members' event: join the cluster for details", link: 'https://walesdsc.co.uk/' },
  ];
  const ics = eventsIcs(events, clusters, '2099-01-01');
  const unfolded = ics.replace(/\r\n /g, '');

  it('escapes text so event details cannot add lines or fields', () => {
    expect(unfolded).toContain('SUMMARY:A\\, B\\; and C\\\\D (South Central)');
    expect(unfolded).toContain('LOCATION:Hall\\; Room 2\\, Portsmouth');
    expect(unfolded).toContain('Line one\\nBEGIN:VEVENT');
    expect(unfolded.match(/^BEGIN:VEVENT$/gm)).toHaveLength(2);
    expect(unfolded).toContain('DTSTART;VALUE=DATE:20991231\r\nDTEND;VALUE=DATE:21000101');
  });

  it('keeps a members-only event to its signpost', () => {
    const block = unfolded.split('\r\nBEGIN:VEVENT\r\n')[2];
    expect(block).toContain("SUMMARY:Members' event: join the cluster for details (Wales)");
    expect(block).toContain('URL:https://walesdsc.co.uk/');
    expect(block).not.toMatch(/LOCATION|DESCRIPTION/);
  });

  it('uses CRLF line ends and folds long lines at 75 octets', () => {
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(foldLine('x'.repeat(80))).toBe(`${'x'.repeat(75)}\r\n ${'x'.repeat(5)}`);
  });

  it('drops a link that is not a plain web address', () => {
    const bad = eventsIcs([{ ...events[0], link: 'https://example.org/a\r\nATTACH:x' } as ClusterEvent], clusters, '2099-01-01');
    expect(bad).not.toContain('ATTACH');
    expect(bad.replace(/\r\n /g, '')).toContain('URL:https://www.southcentralrdsc.co.uk/');
  });
});
