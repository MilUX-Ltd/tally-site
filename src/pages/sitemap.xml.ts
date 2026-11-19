// /sitemap.xml, written at build: the explorer, the about, events and new companies pages,
// and every company page.
import type { APIRoute } from 'astro';
import { companyPath, sitemapXml } from '../lib/company-page';
import { siteData } from '../lib/site-data';

export const GET: APIRoute = () =>
  new Response(sitemapXml(['/', '/about/', '/events/', '/new/', ...siteData().companies.map((c) => companyPath(c.id))]), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
