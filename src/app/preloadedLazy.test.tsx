import { describe, it, expect } from 'vitest';
import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
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
});
