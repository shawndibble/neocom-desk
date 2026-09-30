import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { PopularFit } from '@/engine/fittings/popularFits';
import type { PopularFitsResult } from './popularFits';

const { usePopularFitsMock } = vi.hoisted(() => ({ usePopularFitsMock: vi.fn() }));
vi.mock('./popularFits', () => ({ usePopularFits: usePopularFitsMock }));

import { PopularFitsPanel } from './PopularFitsPanel';

function fit(key: string, count: number, extra: Partial<PopularFit> = {}): PopularFit {
  return {
    key,
    count,
    lastSeen: null,
    value: null,
    killmailIds: [1],
    parts: {
      hullTypeId: 626,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active', chargeTypeId: 900 }],
      drones: [{ typeId: 500, quantity: 5, state: 'online' }],
      cargo: [],
      unresolved: [],
    },
    ...extra,
  };
}

function renderPanel(result: PopularFitsResult | null, onOpen = vi.fn()) {
  usePopularFitsMock.mockReturnValue(result);
  render(<PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={onOpen} />);
  return onOpen;
}

describe('PopularFitsPanel', () => {
  beforeEach(() => usePopularFitsMock.mockReset());

  it('lists each fit with its count, last seen and value, and opens one', () => {
    const lastSeen = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const onOpen = renderPanel({
      ok: true,
      fits: [fit('a', 5, { lastSeen, value: 12_300_000 }), fit('b', 1)],
    });
    expect(screen.getByText('5 losses')).toBeTruthy();
    expect(screen.getByText(/last seen 3d ago/)).toBeTruthy();
    expect(screen.getByText(/~12\.3M ISK/)).toBeTruthy();
    expect(screen.getByText('1 loss')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const loaded = onOpen.mock.calls[0][0];
    expect(loaded.fitting).toMatchObject({
      name: 'Vexor popular fit 1',
      shipTypeId: 626,
      modules: [{ slot: 'high', typeId: 100, chargeTypeId: 900 }],
    });
  });

  it('says so, without blocking anything, when zKillboard fails', () => {
    renderPanel({ ok: false });
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't load popular fits/);
  });

  it('shows a spinner while loading', async () => {
    renderPanel(null);
    expect(
      await screen.findByRole('status', { name: 'Loading popular fits from zKillboard…' })
    ).toBeTruthy();
  });

  it('notes when there is nothing to show', () => {
    renderPanel({ ok: true, fits: [] });
    expect(screen.getByText('No recent losses of this hull with a full fit.')).toBeTruthy();
  });
});
