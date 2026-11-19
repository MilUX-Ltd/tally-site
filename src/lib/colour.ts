// Sequential colour scale for hexagon counts, from the MilUX brand colours,
// light to dark: light gold beige, olive gold, orange-brown, deep green.

export const BRAND_SCALE: readonly string[] = ['#D2C78D', '#B5B171', '#A35C17', '#113308'];

export interface LegendEntry {
  label: string;
  colour: string;
}

export interface ColourScale {
  /** Lower bound of each class; the first is always 1. */
  breaks: number[];
  colourFor: (count: number) => string;
  legend: LegendEntry[];
}

export function colourScale(maxCount: number): ColourScale {
  const max = Math.max(1, Math.floor(maxCount));
  const classes = Math.min(BRAND_SCALE.length, max);
  const breaks: number[] = [1];
  // Geometric breaks between 1 and the maximum, so dense areas stand out.
  for (let i = 1; i < classes; i++) {
    const next = Math.max(breaks[i - 1] + 1, Math.round(max ** (i / classes)));
    if (next > max) break;
    breaks.push(next);
  }
  // Spread colours across the full scale so the darkest is always used.
  const colours = breaks.map((_, i) =>
    breaks.length === 1 ? BRAND_SCALE[BRAND_SCALE.length - 1] : BRAND_SCALE[Math.round((i * (BRAND_SCALE.length - 1)) / (breaks.length - 1))],
  );
  const legend = breaks.map((lo, i) => {
    const hi = i + 1 < breaks.length ? breaks[i + 1] - 1 : max;
    const label = i + 1 === breaks.length ? (lo === hi ? `${lo}` : `${lo} or more`) : lo === hi ? `${lo}` : `${lo} to ${hi}`;
    return { label, colour: colours[i] };
  });
  const colourFor = (count: number): string => {
    let idx = 0;
    for (let i = 0; i < breaks.length; i++) if (count >= breaks[i]) idx = i;
    return colours[idx];
  };
  return { breaks, colourFor, legend };
}
