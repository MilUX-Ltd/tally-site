// /maps/region/<slug>.svg, written at build: one file for each UK region and
// country, in the projection of /maps/uk.svg. A company page whose location
// is published only as a region lays its region over the UK outline.
import type { APIRoute, GetStaticPaths } from 'astro';
import { regionSlug, UK_REGIONS } from '../../../lib/company-page';
import { regionSvg } from '../../../lib/uk-map';

export const getStaticPaths = (() => UK_REGIONS.map((name) => ({ params: { region: regionSlug(name) }, props: { name } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const svg = regionSvg((props as { name: string }).name);
  if (!svg) throw new Error(`No outline for the region ${(props as { name: string }).name}`);
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
