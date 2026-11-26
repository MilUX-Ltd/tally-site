// Build-time only: the outline of a country other than the UK that a company
// page draws its locator on, as SVG, in a plain projection scaled for the
// country's middle latitude. Made from src/data/country-outlines.json
// (Natural Earth, public domain; built by hand with
// scripts/build-country-outlines.mjs). Never imported by browser code: pages
// reference the file this writes (/maps/<code>.svg) and add only a dot.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Ring = Array<[number, number]>;
interface Outlines {
  attribution: string;
  countries: Record<string, Ring[]>;
}

/** The longer side of a country map, in map units. */
const SIDE = 400;
/** Russia is never drawn, whatever the outline file holds. */
const NEVER = new Set(['RU']);

let outlines: Outlines | null = null;
function countryOutlines(): Outlines {
  outlines ??= JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'country-outlines.json'), 'utf8')) as Outlines;
  return outlines;
}

function rings(code: string): Ring[] | null {
  const key = code.toUpperCase();
  if (NEVER.has(key)) return null;
  return countryOutlines().countries[key] ?? null;
}

export interface CountryMap {
  /** Size in map units. */
  width: number;
  height: number;
  /** Map units per degree of latitude. */
  scale: number;
  /** Map units per degree of longitude. */
  xScale: number;
  /** West, south, east, north of the outline. */
  bounds: [number, number, number, number];
}

/** The size and projection of a country's map. Throws for a country with no outline. */
export function countryMap(code: string): CountryMap {
  const r = rings(code);
  if (!r) throw new Error(`no outline for ${code}`);
  const xs = r.flatMap((ring) => ring.map((p) => p[0]));
  const ys = r.flatMap((ring) => ring.map((p) => p[1]));
  const pad = 0.3;
  const bounds: [number, number, number, number] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  const [w, s, e, n] = bounds;
  const cos = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = SIDE / Math.max((e - w) * cos, n - s);
  const xScale = scale * cos;
  return { width: Math.round((e - w) * xScale), height: Math.round((n - s) * scale), scale, xScale, bounds };
}

/** SVG coordinates of a longitude and latitude on a country's map, to one decimal place. */
export function projectCountry(code: string, lon: number, lat: number): { x: number; y: number } {
  const { bounds, scale, xScale } = countryMap(code);
  return { x: Math.round((lon - bounds[0]) * xScale * 10) / 10, y: Math.round((bounds[3] - lat) * scale * 10) / 10 };
}

/** Whether a country has an outline to draw on. */
export const hasCountryMap = (code: string) => rings(code) !== null;

/** /maps/<code>.svg: the country's land in white with an ink coast; null for a country with no outline, and always for Russia. */
export function countrySvg(code: string): string | null {
  const r = rings(code);
  if (!r) return null;
  const { width, height } = countryMap(code);
  const d = r
    .map((ring) => {
      const points = ring.slice(0, -1).map(([lon, lat]) => {
        const p = projectCountry(code, lon, lat);
        return `${p.x} ${p.y}`;
      });
      return points.length >= 3 ? `M${points.join('L')}Z` : '';
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<path d="${d}" fill="#fff" stroke="#0c1510" stroke-width="0.8" stroke-linejoin="round"/></svg>\n`
  );
}

/** The outlines' attribution, for the about page and the build. */
export const countryOutlinesAttribution = () => countryOutlines().attribution;
