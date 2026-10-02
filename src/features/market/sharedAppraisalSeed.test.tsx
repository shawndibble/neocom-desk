import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  useSharedAppraisalSeed(onSeed);
  return <p data-testid="search">{useLocation().search}</p>;
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
