import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LAZY_SDE_FILES, lazySdeGlobIgnores } from './lazySdeFiles';

const dataDir = join(process.cwd(), 'public', 'data');
const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf-8');
/** The service worker's `maximumFileSizeToCacheInBytes` (vite.config.ts). */
const PRECACHE_MAX_BYTES = 5 * 1024 * 1024;

describe('LAZY_SDE_FILES', () => {
  it('names only files that exist in public/data', () => {
    for (const file of LAZY_SDE_FILES) expect(existsSync(join(dataDir, file)), file).toBe(true);
  });

  it('has no duplicates', () => {
    expect(new Set(LAZY_SDE_FILES).size).toBe(LAZY_SDE_FILES.length);
  });

  it('is what vite.config.ts ignores for the precache, and nothing under data/ beyond it', () => {
    expect(viteConfig).toMatch(/from '\.\/src\/sde\/lazySdeFiles\.ts'/);
    expect(viteConfig).toContain('...lazySdeGlobIgnores()');
    // No second, hand-kept list of data files to drift from this one.
    expect(viteConfig).not.toMatch(/'\*\*\/data\/[^']*'/);
    expect(lazySdeGlobIgnores()).toEqual(LAZY_SDE_FILES.map((f) => `**/data/${f}`));
  });

  it('leaves every other data file precachable (under the size cap)', () => {
    const lazy = new Set<string>(LAZY_SDE_FILES);
    const precached = readdirSync(dataDir, { recursive: true, encoding: 'utf8' })
      .map((entry) => entry.replaceAll('\\', '/'))
      .filter((entry) => entry.endsWith('.json') && !lazy.has(entry));
    expect(precached).toContain('blueprints.json');
    expect(precached).toContain('shipTree.json');
    expect(precached).toContain('market/systemPositions.json');
    // The Fittings / Show Info catalogue: ~360 KB gzip together, precached so it needs no warm.
    for (const f of ['market/types.json', 'market/stations.json', 'market/variations.json'])
      expect(precached).toContain(f);
    for (const file of precached) {
      expect(statSync(join(dataDir, file)).size, file).toBeLessThan(PRECACHE_MAX_BYTES);
    }
  });
});
