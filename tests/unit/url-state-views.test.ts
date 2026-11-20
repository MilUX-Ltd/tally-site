// Unit tests: the explorer's view and overseas page in the URL, how links
// made before the views resolve to a view, and when the default view is
// written into the address.
import { describe, expect, it } from 'vitest';
import { addressFor, defaultState, fromQuery, resolveView, toQuery, VIEWS, type ViewState } from '../../src/lib/url-state';

const open = (query: string) => {
  const state = fromQuery(query);
  return { ...state, view: resolveView(query, state) };
};

describe('view in the URL', () => {
  it('round-trips every view, leaving out the default', () => {
    for (const view of VIEWS) {
      const state: ViewState = { ...defaultState(), view };
      const query = toQuery(state);
      expect(query).toBe(view === 'companies' ? '' : `view=${view}`);
      expect(fromQuery(query)).toEqual(state);
    }
  });

  it('keeps the other parameters beside a view', () => {
    const state: ViewState = { ...defaultState(), view: 'compare', filters: { ...defaultState().filters, cap: ['cyber'] }, list: ['example-subsea'] };
    expect(fromQuery(toQuery(state))).toEqual(state);
  });

  it('drops a view it does not know', () => {
    for (const value of ['COMPARE', 'Compare', '__proto__', 'constructor', '<script>', '', 'tabs', 'compare ']) {
      expect(fromQuery(`view=${encodeURIComponent(value)}`).view).toBe('companies');
    }
  });

  it('takes the first of a repeated view', () => {
    expect(fromQuery('view=growth&view=compare').view).toBe('growth');
  });
});

describe('overseas page in the URL', () => {
  it('round-trips a later page and leaves out the first', () => {
    const state: ViewState = { ...defaultState(), opage: 3 };
    expect(toQuery(state)).toBe('opage=3');
    expect(fromQuery('opage=3')).toEqual(state);
    expect(toQuery({ ...defaultState(), opage: 1 })).toBe('');
  });

  it('drops a malformed page', () => {
    for (const value of ['-3', '0', 'abc', '1.5', '12345678901234567890', '']) {
      expect(fromQuery(`opage=${value}`).opage).toBe(1);
    }
  });
});

describe('links made before the views', () => {
  it('open Compare for a matrix page or group, Growth for a month, Companies otherwise', () => {
    expect(open('mpage=2').view).toBe('compare');
    expect(open('mgroup=space').view).toBe('compare');
    expect(open('month=2026-09').view).toBe('growth');
    expect(open('mpage=2&month=2026-09').view).toBe('compare');
    expect(open('cap=cyber').view).toBe('companies');
    expect(open('').view).toBe('companies');
  });

  it('let a view named in the link win', () => {
    expect(open('view=growth&mpage=2').view).toBe('growth');
    expect(open('view=companies&mpage=2').view).toBe('companies');
    expect(open('view=companies&month=2026-09').view).toBe('companies');
  });

  it('treat a view it does not know as absent', () => {
    expect(open('view=nonsense&mpage=2').view).toBe('compare');
  });
});

describe('the address written for a state', () => {
  it('leaves out the default view when nothing else would open another view', () => {
    expect(addressFor(defaultState())).toBe('');
    expect(addressFor({ ...defaultState(), filters: { ...defaultState().filters, cap: ['cyber'] } })).toBe('cap=cyber');
  });

  it('names Companies beside a matrix page or group or a month', () => {
    const matrixPage: ViewState = { ...defaultState(), matrix: { group: null, page: 2 } };
    const matrixGroup: ViewState = { ...defaultState(), matrix: { group: 'space', page: 1 } };
    const month: ViewState = { ...defaultState(), month: '2026-09' };
    for (const state of [matrixPage, matrixGroup, month]) {
      const query = addressFor(state);
      expect(new URLSearchParams(query).get('view')).toBe('companies');
      expect(open(query)).toEqual(state);
    }
  });

  it('writes other views as toQuery does, and they reopen as written', () => {
    for (const view of ['compare', 'clusters', 'growth'] as const) {
      const state: ViewState = { ...defaultState(), view, month: '2026-09', matrix: { group: 'space', page: 2 } };
      expect(addressFor(state)).toBe(toQuery(state));
      expect(open(addressFor(state))).toEqual(state);
    }
  });
});
