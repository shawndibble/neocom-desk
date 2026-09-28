import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import { named, remembered } from './routeChunks';

const Page: ComponentType = () => null;

describe('named', () => {
  it('re-shapes a named export as the default lazy() wants', async () => {
    const load = named(() => Promise.resolve({ Page }), 'Page');
    await expect(load()).resolves.toEqual({ default: Page });
  });

  it('waits instead of throwing when a cancelled chunk failure resolves undefined', async () => {
    // main.tsx's `vite:preloadError` handler cancels the failure and reloads;
    // Vite's preload helper then resolves `undefined`. Reading a key off that
    // would throw into the route's error boundary before the reload lands.
    const load = named(
      () => Promise.resolve(undefined as unknown as Record<'Page', ComponentType>),
      'Page'
    );
    const outcome = await Promise.race([
      load().then(
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
