import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

// The guards run before any key, limit or budget is touched, so an empty env is enough.
const env = {} as never;
const url = 'https://tally.example/api/search';

describe('search request guards', () => {
  it('refuses a plain-text post a cross-site page could send without a preflight', async () => {
    const res = await worker.fetch(new Request(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"q":"radar"}' }), env);
    expect(res.status).toBe(415);
  });
  it('refuses a form-encoded post', async () => {
    const res = await worker.fetch(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'q=radar' }), env);
    expect(res.status).toBe(415);
  });
  it('refuses a body larger than the cap before parsing it', async () => {
    const big = JSON.stringify({ q: 'x'.repeat(5000) });
    const res = await worker.fetch(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: big }), env);
    expect(res.status).toBe(413);
  });
  it('accepts JSON with a charset parameter', async () => {
    const res = await worker.fetch(new Request(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"q":"radar"}' }), env);
    expect(res.status).not.toBe(415);
  });
});
