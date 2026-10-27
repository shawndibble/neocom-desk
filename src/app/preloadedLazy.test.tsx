import { describe, it, expect, vi } from 'vitest';
import { Suspense, type ComponentType } from 'react';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ErrorBoundary } from './ErrorBoundary';
import { remembered } from './routeChunks';
import { preloadedLazy } from './preloadedLazy';

function Shell({ label }: { label: string }) {
  return <p>{label}</p>;
}

describe('preloadedLazy', () => {
  it('renders straight through, with no fallback frame, when the chunk already loaded', async () => {
    const load = remembered(() => Promise.resolve({ default: Shell }));
    const Component = preloadedLazy(load);
    await load();

    render(
      <Suspense fallback={<p>fallback</p>}>
        <Component label="shell" />
      </Suspense>
    );
    // Synchronous: the very first commit is the real component.
    expect(screen.getByText('shell')).toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('suspends like React.lazy when the chunk has not loaded yet', async () => {
    let resolve!: (module: { default: typeof Shell }) => void;
    const load = remembered(() => new Promise<{ default: typeof Shell }>((r) => (resolve = r)));
    const Component = preloadedLazy(load);

    render(
      <Suspense fallback={<p>fallback</p>}>
        <Component label="shell" />
      </Suspense>
    );
    expect(screen.getByText('fallback')).toBeInTheDocument();
    resolve({ default: Shell });
    expect(await screen.findByText('shell')).toBeInTheDocument();
  });

  it('retries a chunk that failed once the boundary resets, instead of caching the failure', async () => {
    // Offline until told otherwise — React re-renders once on its own after
    // an error, so a single rejection would not reach the boundary.
    let online = false;
    const importer = vi.fn<() => Promise<{ default: ComponentType<{ label: string }> }>>(() =>
      online
        ? Promise.resolve({ default: Shell })
        : Promise.reject(new Error('Failed to fetch dynamically imported module'))
    );
    const Component = preloadedLazy(remembered(importer));
    const tree = (resetKey: string) => (
      <ErrorBoundary resetKey={resetKey}>
        <Suspense fallback={<p>fallback</p>}>
          <Component label="shell" />
        </Suspense>
      </ErrorBoundary>
    );

    const { rerender } = render(tree('/overview'));
    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument();

    // Navigating resets the boundary; a plain `lazy()` would rethrow its
    // cached rejection here forever.
    online = true;
    rerender(tree('/wallet'));
    expect(await screen.findByText('shell')).toBeInTheDocument();
  });
});
