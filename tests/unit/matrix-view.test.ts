// The Matrix view in the URL: view=matrix is read and written, other values
// are dropped, and a link from before views were named opens the matrix.
import { describe, expect, it } from 'vitest';
import { defaultState, fromLink, fromQuery, toQuery } from '../../src/lib/url-state';

describe('the view in the URL', () => {
  it('reads and writes list and matrix, and leaves the map out', () => {
    expect(fromQuery('view=matrix').view).toBe('matrix');
    expect(fromQuery('view=list').view).toBe('list');
    expect(toQuery({ ...defaultState(), view: 'matrix' })).toBe('view=matrix');
    expect(toQuery({ ...defaultState(), view: 'list' })).toBe('view=list');
    expect(toQuery(defaultState())).toBe('');
  });

  it('drops any other value', () => {
    for (const value of ['map', 'Matrix', 'matrix ', 'grid', '<script>', '']) expect(fromQuery(`view=${encodeURIComponent(value)}`).view).toBe('map');
  });

  it('opens the Matrix view for a link with a matrix page or group and no view', () => {
    expect(fromLink('?mpage=2').view).toBe('matrix');
    expect(fromLink('mgroup=space').view).toBe('matrix');
    expect(fromLink('?mgroup=space&mpage=3&cap=cyber').view).toBe('matrix');
    // The first page of every group is the default: nothing to open.
    expect(fromLink('?mpage=1').view).toBe('map');
    expect(fromLink('?cap=cyber').view).toBe('map');
    // A link that names its view keeps it.
    expect(fromLink('?mpage=2&view=list').view).toBe('list');
    expect(fromLink('?mgroup=space&view=matrix').view).toBe('matrix');
  });

  it('keeps the matrix page and group beside the view', () => {
    const state = fromLink('?view=matrix&mgroup=space&mpage=2');
    expect(state.matrix).toEqual({ group: 'space', page: 2 });
    expect(toQuery(state)).toBe('mgroup=space&mpage=2&view=matrix');
  });
});
