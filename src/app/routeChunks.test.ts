import { describe, it, expect } from 'vitest';
import type { ComponentType } from 'react';
import { named } from './routeChunks';

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
