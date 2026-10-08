import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

import { PilotKillActivity } from './PilotKillActivity';

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

  it('labels the chart: a legend for every colour drawn, month names, and the kills per month', async () => {
    renderSection();
    const section = await screen.findByRole('region', { name: 'Where they kill' });
    const chart = within(section).getByRole('img', { name: /Kills per month by space/ });
    expect(chart).toBeTruthy();
    // Blue is wormhole space: say so, and only name colours that appear.
    const legend = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(legend).toContain('Nullsec');
    expect(legend).toContain('Wormhole');
    expect(legend).not.toContain('Lowsec');
    // Month names, not "05".
    expect(chart.getAttribute('aria-label')).toMatch(/[A-Z][a-z]{2}: \d/);
  });

  it('does not repeat what the rest of the profile already shows', async () => {
    renderSection();
    await screen.findByRole('region', { name: 'Where they kill' });
    expect(screen.queryByText('Flew on their kills')).toBeNull();
    expect(screen.queryByText('Latest kills')).toBeNull();
    expect(await screen.findByText('Ships they killed')).toBeTruthy();
  });
});
