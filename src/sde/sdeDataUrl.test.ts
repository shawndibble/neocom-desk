import { describe, expect, it } from 'vitest';
import { sdeDataUrl } from './sdeDataUrl';

describe('sdeDataUrl', () => {
  const versions = { 'types.json': 'aaa111', 'market/types.json': 'bbb222' };

  it('appends the file content version as ?v=, so a changed file is a new URL', () => {
    expect(sdeDataUrl('/', 'types.json', versions)).toBe('/data/types.json?v=aaa111');
  });

  it('keys by path under data/, not basename — data/ and data/market/ both have a types.json', () => {
    expect(sdeDataUrl('/', 'market/types.json', versions)).toBe('/data/market/types.json?v=bbb222');
  });

  it('falls back to the plain URL for a file with no known version, never ?v=undefined', () => {
    expect(sdeDataUrl('/', 'skills.json', versions)).toBe('/data/skills.json');
  });

  it('respects the base URL', () => {
    expect(sdeDataUrl('/app/', 'types.json', versions)).toBe('/app/data/types.json?v=aaa111');
  });
});

describe('__SDE_DATA_VERSIONS__ (vite.config.ts)', () => {
  it('carries a content hash for files at both data/ and data/market/', () => {
    expect(__SDE_DATA_VERSIONS__['types.json']).toMatch(/^[0-9a-f]{12}$/);
    expect(__SDE_DATA_VERSIONS__['market/types.json']).toMatch(/^[0-9a-f]{12}$/);
    expect(__SDE_DATA_VERSIONS__['types.json']).not.toBe(
      __SDE_DATA_VERSIONS__['market/types.json']
    );
  });
});
