// /maps/uk-local.svg, written at build: the UK outline again, finer and with
// thinner lines, for the local area a company page magnifies beside its
// point. One shared, cached file.
import type { APIRoute } from 'astro';
import { ukSvg } from '../../lib/uk-map';

export const GET: APIRoute = () => new Response(ukSvg('local'), { headers: { 'Content-Type': 'image/svg+xml' } });
