import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { guarded, isRouteChunkFailure, named, remembered } from './routeChunks';

const Page: ComponentType = () => null;

describe('named', () => {
  it('re-shapes a named export as the default lazy() wants', async () => {
    const load = named(() => Promise.resolve({ Page }), 'Page');
    await expect(load()).resolves.toEqual({ default: Page });
  });

  it('rejects into the boundary when the import resolves undefined and no recovery is running', async () => {
    const load = named(
      () => Promise.resolve(undefined as unknown as Record<'Page', ComponentType>),
      'Page'
    );
    await expect(load()).rejects.toThrow(/unavailable/i);
  });
});

describe('guarded', () => {
  it('passes a loaded module through', async () => {
    await expect(guarded(() => Promise.resolve({ default: Page }))).resolves.toEqual({
      default: Page,
    });
  });

  it('rejects, rather than leaving Suspense pending forever, when nothing is recovering', async () => {
    await expect(guarded(() => Promise.resolve(undefined))).rejects.toThrow(/unavailable/i);
  });

  describe('while a stale-build recovery is running', () => {
    async function withRecovery(overrides: Record<string, unknown>) {
      vi.resetModules();
      const recovery = await import('./staleBuildRecovery');
      const fresh = await import('./routeChunks');
      const attempt = recovery.recoverFromStaleBuild({
        now: () => 1_000_000,
        online: () => true,
        readLast: () => 0,
        writeLast: () => {},
        probe: async () => true,
        purge: () => new Promise<void>(() => {}),
        reload: () => {},
        ...overrides,
      });
      return { fresh, attempt };
    }

    it('waits for the reload', async () => {
      const { fresh } = await withRecovery({});
      const outcome = await Promise.race([
        fresh
          .guarded(() => Promise.resolve(undefined))
          .then(
            () => 'settled',
            () => 'settled'
          ),
        new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
      ]);
      expect(outcome).toBe('pending');
    });

    it('rejects into the boundary once the recovery gives up (network probe failed)', async () => {
      const { fresh, attempt } = await withRecovery({ probe: async () => false });
      await expect(fresh.guarded(() => Promise.resolve(undefined))).rejects.toThrow(/unavailable/i);
      await expect(attempt).resolves.toBe(false);
    });
  });
});

describe('remembered', () => {
  it('exposes the component synchronously once the chunk has loaded', async () => {
    const load = remembered(() => Promise.resolve({ default: Page }));
    expect(load.peek()).toBeUndefined();
    await load();
    expect(load.peek()).toBe(Page);
  });

  it('shares one request between a preload and the later render', async () => {
    const importer = vi.fn(() => Promise.resolve({ default: Page }));
    const load = remembered(importer);
    const first = load();
    const second = load();
    expect(second).toBe(first);
    await second;
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the lazy render can retry it', async () => {
    const importer = vi
      .fn<() => Promise<{ default: ComponentType }>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Page });
    const load = remembered(importer);
    await expect(load()).rejects.toThrow('offline');
    expect(load.peek()).toBeUndefined();
    await expect(load()).resolves.toEqual({ default: Page });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('isRouteChunkFailure', () => {
  it('recognises the error guarded() throws, and nothing else', async () => {
    const thrown = await guarded(() => Promise.resolve(undefined)).catch((e: unknown) => e);
    expect(isRouteChunkFailure(thrown)).toBe(true);
    expect(isRouteChunkFailure(new Error('boom'))).toBe(false);
    expect(isRouteChunkFailure('Route chunk unavailable')).toBe(false);
  });

  it("recognises the browser's own dynamic-import rejection, which reaches the boundary raw", () => {
    // Chrome, Firefox and Safari word the same failure three ways.
    for (const message of [
      'Failed to fetch dynamically imported module: https://example.test/assets/DemoBoard-2uIGzk2r.js',
      'error loading dynamically imported module: https://example.test/assets/x.js',
      'Importing a module script failed.',
    ]) {
      expect(isRouteChunkFailure(new TypeError(message))).toBe(true);
    }
    expect(isRouteChunkFailure(new TypeError('Failed to fetch'))).toBe(false);
  });
});
