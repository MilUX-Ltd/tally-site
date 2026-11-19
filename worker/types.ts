// The bindings this Worker uses, typed narrowly so the Worker code builds
// without the full Workers type library (which clashes with the DOM types
// the rest of the site uses).

/** Cloudflare's rate-limiting binding. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The part of a Durable Object namespace the Worker uses. */
export interface CounterNamespace {
  idFromName(name: string): unknown;
  get(id: never): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
}

/** The static assets binding. */
export interface Assets {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/** Durable Object storage, the key-value part. */
export interface CounterStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

export interface Env {
  /** Worker secret. When absent, search always falls back. */
  ANTHROPIC_API_KEY?: string;
  /** Daily model call budget (wrangler var). Missing or invalid means none. */
  SEARCH_DAILY_BUDGET?: string;
  SEARCH_RATE_LIMIT: RateLimit;
  SEARCH_BUDGET: CounterNamespace;
  ASSETS: Assets;
}
