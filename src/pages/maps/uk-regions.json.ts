// /maps/uk-regions.json, written at build: the 12 UK regions as GeoJSON (ONS
// boundaries, Open Government Licence v3.0; src/lib/uk-map.ts). The Money view
// fetches it only when it opens, to shade regions by contract value.
import type { APIRoute } from 'astro';
import { ukRegionsGeoJSON } from '../../lib/uk-map';

export const GET: APIRoute = () => new Response(ukRegionsGeoJSON(), { headers: { 'Content-Type': 'application/json' } });
