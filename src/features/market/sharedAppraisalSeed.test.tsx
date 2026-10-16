import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import { loadShare } from '@/features/share/shareStore';
import { useSharedAppraisalSeed } from './sharedAppraisalSeed';

vi.mock('@/features/share/shareStore', () => ({ loadShare: vi.fn() }));

const SNAPSHOT: AppraisalSnapshot = {
  v: 1,
  hub: 'amarr',
  pricePercent: 85,
  generatedAt: 1,
  items: [
    { typeId: 34, name: 'Tritanium', quantity: 1000, buy: 5, sell: 6, unitVolume: 0.01 },
    { typeId: 35, name: 'Pyerite', quantity: 20, buy: 10, sell: 12, unitVolume: 0.01 },
  ],
};

function Probe({ onSeed }: { onSeed: (text: string) => void }) {
  const seed = useSharedAppraisalSeed(onSeed);
  return (
    <>
      <p data-testid="search">{useLocation().search}</p>
      <p data-testid="failed">{String(seed.loadFailed)}</p>
      <p data-testid="retrying">{String(seed.retrying)}</p>
      <button onClick={seed.retry}>retry</button>
      <button onClick={seed.dismiss}>dismiss</button>
    </>
  );
}

afterEach(() => {
  vi.mocked(loadShare).mockReset();
});

describe('useSharedAppraisalSeed', () => {
  it('pastes the shared pile, and drops ?share= from the URL', async () => {
    vi.mocked(loadShare).mockResolvedValue({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
    });
    const onSeed = vi.fn();
    render(
      <MemoryRouter initialEntries={['/market/appraisal?hub=amarr&percent=85&share=abc123XYZ']}>
        <Probe onSeed={onSeed} />
      </MemoryRouter>
    );

    await waitFor(() => expect(onSeed).toHaveBeenCalledWith('Tritanium\t1000\nPyerite\t20'));
    expect(onSeed).toHaveBeenCalledTimes(1);
    expect(loadShare).toHaveBeenCalledWith('abc123XYZ');
    // Hub and percent stay: they're what the pasted pile is priced at.
    expect(screen.getByTestId('search')).toHaveTextContent('?hub=amarr&percent=85');
  });

  it('seeds nothing from a dead link', async () => {
    vi.mocked(loadShare).mockResolvedValue({ ok: false, reason: 'not-found' });
    const onSeed = vi.fn();
    render(
      <MemoryRouter initialEntries={['/market/appraisal?share=abc123XYZ']}>
        <Probe onSeed={onSeed} />
      </MemoryRouter>
    );

    await waitFor(() => expect(loadShare).toHaveBeenCalled());
    expect(onSeed).not.toHaveBeenCalled();
    // Retrying a dead link cannot help, so it is not left in the address.
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    expect(screen.getByTestId('failed')).toHaveTextContent('false');
  });

  it('keeps ?share= and reports the failure when the fetch fails, then loads on retry', async () => {
    vi.mocked(loadShare).mockResolvedValueOnce({ ok: false, reason: 'failed' });
    const onSeed = vi.fn();
    render(
      <MemoryRouter initialEntries={['/market/appraisal?hub=amarr&share=abc123XYZ']}>
        <Probe onSeed={onSeed} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));
    expect(screen.getByTestId('search')).toHaveTextContent('?hub=amarr&share=abc123XYZ');
    expect(onSeed).not.toHaveBeenCalled();

    vi.mocked(loadShare).mockResolvedValueOnce({
      ok: true,
      share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
    });
    await act(async () => screen.getByText('retry').click());

    await waitFor(() => expect(onSeed).toHaveBeenCalledWith('Tritanium\t1000\nPyerite\t20'));
    expect(loadShare).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?hub=amarr'));
    expect(screen.getByTestId('search')).not.toHaveTextContent('share=');
    expect(screen.getByTestId('failed')).toHaveTextContent('false');
  });

  it('keeps loadFailed set while a retry runs, and across a repeat failure', async () => {
    vi.mocked(loadShare).mockResolvedValueOnce({ ok: false, reason: 'failed' });
    render(
      <MemoryRouter initialEntries={['/market/appraisal?share=abc123XYZ']}>
        <Probe onSeed={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));

    let settle!: (result: { ok: false; reason: 'failed' }) => void;
    vi.mocked(loadShare).mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    await act(async () => screen.getByText('retry').click());
    expect(screen.getByTestId('retrying')).toHaveTextContent('true');
    expect(screen.getByTestId('failed')).toHaveTextContent('true');

    await act(async () => settle({ ok: false, reason: 'failed' }));
    expect(screen.getByTestId('retrying')).toHaveTextContent('false');
    expect(screen.getByTestId('failed')).toHaveTextContent('true');
    expect(screen.getByTestId('search')).toHaveTextContent('share=abc123XYZ');
  });

  it('ignores a retry that resolves after the pilot dismissed it', async () => {
    vi.mocked(loadShare).mockResolvedValueOnce({ ok: false, reason: 'failed' });
    const onSeed = vi.fn();
    render(
      <MemoryRouter initialEntries={['/market/appraisal?share=abc123XYZ']}>
        <Probe onSeed={onSeed} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));

    type Loaded = Awaited<ReturnType<typeof loadShare>>;
    let settle!: (result: Loaded) => void;
    vi.mocked(loadShare).mockReturnValueOnce(
      new Promise<Loaded>((resolve) => {
        settle = resolve;
      })
    );
    await act(async () => screen.getByText('retry').click());
    await act(async () => screen.getByText('dismiss').click());
    await act(async () =>
      settle({
        ok: true,
        share: { type: 'appraisal', payload: SNAPSHOT, expiresAt: Date.now() + 1000 },
      })
    );

    expect(onSeed).not.toHaveBeenCalled();
    expect(screen.getByTestId('retrying')).toHaveTextContent('false');
    expect(screen.getByTestId('failed')).toHaveTextContent('false');
  });

  it('dismissing a failed load drops ?share=', async () => {
    vi.mocked(loadShare).mockResolvedValue({ ok: false, reason: 'failed' });
    render(
      <MemoryRouter initialEntries={['/market/appraisal?share=abc123XYZ']}>
        <Probe onSeed={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('failed')).toHaveTextContent('true'));
    await act(async () => screen.getByText('dismiss').click());
    expect(screen.getByTestId('search')).toHaveTextContent(/^$/);
    expect(screen.getByTestId('failed')).toHaveTextContent('false');
  });

  it('does nothing without ?share=', () => {
    render(
      <MemoryRouter initialEntries={['/market/appraisal']}>
        <Probe onSeed={vi.fn()} />
      </MemoryRouter>
    );
    expect(loadShare).not.toHaveBeenCalled();
  });
});
