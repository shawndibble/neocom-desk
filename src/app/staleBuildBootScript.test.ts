import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const recovery = readFileSync(resolve(process.cwd(), 'src/app/staleBuildRecovery.ts'), 'utf8');
const script = html.match(/<script id="stale-build-boot">([\s\S]*?)<\/script>/)?.[1] ?? '';

describe('index.html stale-build-boot script', () => {
  it('exists', () => {
    expect(script).not.toBe('');
  });

  it('never purges offline, like staleBuildRecovery.ts', () => {
    expect(script).toContain('navigator.onLine === false');
    expect(recovery).toContain('navigator.onLine !== false');
  });

  it('deletes only the precache, with the same prefix as staleBuildRecovery.ts', () => {
    const prefix = recovery.match(/PRECACHE_PREFIX = '([^']+)'/)?.[1];
    expect(prefix).toBe('workbox-precache');
    expect(script).toContain(`indexOf('${prefix}') === 0`);
  });
});
