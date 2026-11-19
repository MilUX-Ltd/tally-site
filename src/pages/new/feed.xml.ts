// /new/feed.xml, written at build: RSS 2.0 of the companies added most
// recently, the same list as /new. Dated from the data, never the build.
// The header below applies in development only: the built site is static, so
// production gets its Content-Type from public/_headers.
import type { APIRoute } from 'astro';
import { feedXml, recentAdditions } from '../../lib/new-companies';
import { addedDates, siteData } from '../../lib/site-data';

export const GET: APIRoute = () => {
  const data = siteData();
  return new Response(feedXml(recentAdditions(data.companies, addedDates(), data.taxonomy)), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
