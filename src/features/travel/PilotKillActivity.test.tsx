import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';

const mocks = vi.hoisted(() => ({ fetchPilotKillHistory: vi.fn() }));
vi.mock('@/lib/zkillboard', () => ({ fetchPilotKillHistory: mocks.fetchPilotKillHistory }));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () => Promise.resolve(new Map([[22456, 'Sabre']])),
}));
vi.mock('./pilotListData', () => ({
  loadViewerContext: () =>
    Promise.resolve({ contacts: new Map(), corporationId: null, allianceId: null }),
}));
vi.mock('@/stores/activeCharacter', () => ({
  useActiveCharacter: (select: (state: { activeCharacterId: number }) => unknown) =>
    select({ activeCharacterId: 1 }),
}));

import { PilotKillActivity, PilotKillActivityView } from './PilotKillActivity';

const DAY = 86_400_000;
const kill = (agoMs: number, space: 'highsec' | 'lowsec' | 'nullsec' | 'wormhole') => ({
  timeMs: Date.now() - agoMs,
  space,
  systemId: 1,
  victimShipTypeId: 22456,
  ownShipTypeId: 11,
});

function renderSection() {
  return render(
    <MemoryRouter>
      <PilotKillActivity characterId={7} />
    </MemoryRouter>
  );
}

describe('PilotKillActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchPilotKillHistory.mockResolvedValue({
      ok: true,
      kills: [kill(2 * DAY, 'nullsec'), kill(3 * DAY, 'nullsec'), kill(40 * DAY, 'wormhole')],
    });
  });

  it('draws the six-month chart open, with the 30-day counts under it in the same card', async () => {
    renderSection();
    const section = await screen.findByRole('region', { name: 'Where they kill' });
    const chart = within(section).getByRole('img', { name: /Kills per month by space/ });
    expect(within(section).queryByRole('button', { name: /Kills per month/ })).toBeNull();
    const tiles = within(section).getByText('Highsec').closest('ul') as HTMLElement;
    expect(chart.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getByText('Last 30 days')).toBeInTheDocument();
  });

  it('labels the chart with month names and the kills in each', async () => {
    renderSection();
    const section = await screen.findByRole('region', { name: 'Where they kill' });
    const chart = within(section).getByRole('img', { name: /Kills per month by space/ });
    expect(chart.getAttribute('aria-label')).toMatch(/[A-Z][a-z]{2}: \d/);
    // Two nullsec kills this month, so the label names the space, not just the total.
    expect(chart.getAttribute('aria-label')).toMatch(/: 2 \(2 nullsec\)/);
  });

  it('keys each count to its space by name and colour, and nullsec is not the verdict red', async () => {
    renderSection();
    const section = await screen.findByRole('region', { name: 'Where they kill' });
    const tiles = within(section).getByText('Highsec').closest('ul') as HTMLElement;
    const nullsec = within(tiles).getByText('Nullsec').closest('li') as HTMLElement;
    expect(nullsec).toHaveClass('border-t-space-nullsec');
    expect(within(nullsec).getByText('2')).toHaveClass('text-space-nullsec');
    expect(section.innerHTML).not.toMatch(/danger/);
    // A space with no kills in 30 days has no hue.
    expect(within(tiles).getByText('Highsec').closest('li')).toHaveClass('border-t-line');
  });

  it('does not repeat what the rest of the profile already shows', async () => {
    renderSection();
    await screen.findByRole('region', { name: 'Where they kill' });
    expect(screen.queryByText('Flew on their kills')).toBeNull();
    expect(screen.queryByText('Latest kills')).toBeNull();
    // The hulls they kill moved to the ships row, beside the ones they fly.
    expect(screen.queryByText('Ships they killed')).toBeNull();
    expect(screen.queryByText('Kills most')).toBeNull();
  });
});

describe('PilotKillActivityView retry focus', () => {
  it('keeps focus inside the section from Retry through loading', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <PilotKillActivityView history={{ kind: 'failed' }} onRetry={onRetry} />
      </MemoryRouter>
    );
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    act(() => retry.click());
    expect(onRetry).toHaveBeenCalled();
    rerender(
      <MemoryRouter>
        <PilotKillActivityView history={{ kind: 'loading' }} onRetry={onRetry} />
      </MemoryRouter>
    );
    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(active?.closest('section')).not.toBeNull();
  });
});
