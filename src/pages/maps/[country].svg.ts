// /maps/<code>.svg, written at build: the outline of each live country other
// than the UK, which company pages there draw their point on
// (src/lib/country-map.ts; Natural Earth, public domain). The UK keeps
// /maps/uk.svg. Russia is never written.
import type { APIRoute, GetStaticPaths } from 'astro';
import { countrySvg, hasCountryMap } from '../../lib/country-map';
import { siteData } from '../../lib/site-data';

export const getStaticPaths = (() =>
  (siteData().countries ?? [])
    .filter((c) => c.live && c.code !== 'GB' && c.code !== 'RU' && hasCountryMap(c.code))
    .map((c) => ({ params: { country: c.code.toLowerCase() }, props: { code: c.code } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(countrySvg((props as { code: string }).code), { headers: { 'Content-Type': 'image/svg+xml' } });
