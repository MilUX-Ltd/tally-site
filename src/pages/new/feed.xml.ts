// /new/feed.xml, written at build: RSS 2.0 of the companies added most
// recently, the same list as /new. Dated from the data, never the build.
// The built site is static, so the host serves this file by its extension as
// application/xml, which feed readers accept; no Content-Type is set here.
import type { APIRoute } from 'astro';
import { feedXml, recentAdditions } from '../../lib/new-companies';
import { addedDates, siteData } from '../../lib/site-data';

export const GET: APIRoute = () => {
  const data = siteData();
  return new Response(feedXml(recentAdditions(data.companies, addedDates(), data.taxonomy)));
};
