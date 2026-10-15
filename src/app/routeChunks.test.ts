import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { guarded, named, remembered } from './routeChunks';

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

  it('waits for the reload while a stale-build recovery is running', async () => {
    vi.resetModules();
    const recovery = await import('./staleBuildRecovery');
    const fresh = await import('./routeChunks');
    void recovery.recoverFromStaleBuild({
      now: () => 1_000_000,
      online: () => true,
      readLast: () => 0,
      writeLast: () => {},
      purge: () => new Promise<void>(() => {}),
      reload: () => {},
    });
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
