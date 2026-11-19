// The daily call budget: one SQLite-backed Durable Object holding today's
// count. A call is counted before it is made; when today's count has reached
// the budget, the answer is no. Days are UTC. Only the count is kept.
import type { CounterStorage, Env } from './types';

const today = () => new Date().toISOString().slice(0, 10);

export class SearchBudget {
  private readonly storage: CounterStorage;

  constructor(state: { storage: CounterStorage }, _env: unknown) {
    this.storage = state.storage;
  }

  /** POST with {"limit": n}: takes one call from today's budget if any is left. */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    let limit = 0;
    try {
      const body = (await request.json()) as { limit?: unknown };
      if (typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0) limit = body.limit;
    } catch {
      limit = 0;
    }
    const day = today();
    const stored = await this.storage.get<{ day: string; count: number }>('budget');
    const count = stored && stored.day === day ? stored.count : 0;
    if (count >= limit) return Response.json({ ok: false });
    await this.storage.put('budget', { day, count: count + 1 });
    return Response.json({ ok: true });
  }
}

/** Parses the budget setting; anything but a positive whole number means no budget. */
export function dailyBudget(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) return 0;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/** Takes one call from today's budget. Any failure counts as no budget left. */
export async function takeFromBudget(env: Env): Promise<boolean> {
  const limit = dailyBudget(env.SEARCH_DAILY_BUDGET);
  if (limit === 0) return false;
  try {
    const stub = env.SEARCH_BUDGET.get(env.SEARCH_BUDGET.idFromName('daily') as never);
    const response = await stub.fetch('https://budget/take', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ limit }),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
