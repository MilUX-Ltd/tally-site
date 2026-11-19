// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Static output served by Cloudflare Workers static assets (docs/adr/0001).
export default defineConfig({
  site: 'https://tally.milux.co.uk',
  output: 'static',
  integrations: [preact()],
  build: {
    // The CSP is style-src 'self'; inline <style> would be blocked.
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      // Scripts and assets as files; inline scripts would be blocked by script-src 'self'.
      assetsInlineLimit: 0,
    },
  },
});
