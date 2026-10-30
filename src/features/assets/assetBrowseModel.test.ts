import { describe, expect, it } from 'vitest';
import { queryLeavingSearch } from './assetBrowseModel';

describe('queryLeavingSearch', () => {
  it('drops the flat-list params and keeps the rest', () => {
    expect(queryLeavingSearch('?q=trit&all=1&min=5&chars=all')).toBe('?chars=all');
  });

  it('returns an empty string when nothing else is left', () => {
    expect(queryLeavingSearch('?q=trit')).toBe('');
    expect(queryLeavingSearch('')).toBe('');
  });
});
