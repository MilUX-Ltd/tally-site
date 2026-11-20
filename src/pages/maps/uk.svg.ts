// /maps/uk.svg, written at build: the UK outline the company pages draw their
// point on (src/lib/uk-map.ts; ONS boundaries, Open Government Licence v3.0),
// in the same projection as projectUk. One shared, cached file; each page
// adds only a dot.
import type { APIRoute } from 'astro';
import { ukSvg } from '../../lib/uk-map';

export const GET: APIRoute = () => new Response(ukSvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
