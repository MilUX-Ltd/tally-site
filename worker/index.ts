// The Tally Worker. Pages and data are static assets served before this code
// runs; only /api/* and /mcp reach it (run_worker_first in wrangler.jsonc).
import { handleMcp } from './mcp';
import { handleSearch } from './search';
import type { Env } from './types';

export { SearchBudget } from './budget';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/search') return handleSearch(request, env);
    if (pathname === '/mcp') return handleMcp(request, env);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not-found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
