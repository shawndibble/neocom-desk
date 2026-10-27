import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import type { KillRecord } from '@/engine/pilotList/killActivity';
import { PilotShips } from './PilotShips';

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () =>
    Promise.resolve(
      new Map([
        [11, 'Gnosis'],
        [12, 'Caracal'],
        [21, 'Capsule'],
        [22, 'Ishtar'],
      ])
    ),
}));

const kill = (victimShipTypeId: number): KillRecord => ({
  timeMs: 1,
  space: 'nullsec',
  systemId: 1,
  victimShipTypeId,
  ownShipTypeId: null,
});

const KILLS = [kill(21), kill(21), kill(21), kill(22)];
const FLOWN = [
  { shipTypeId: 11, kills: 47 },
  { shipTypeId: 12, kills: 36 },
];

function renderShips(kills: KillRecord[] | null, flown: typeof FLOWN | null) {
  return render(
    <MemoryRouter>
      <PilotShips kills={kills} flown={flown} />
    </MemoryRouter>
  );
}

describe('PilotShips', () => {
  it('lists the hulls they fly and the hulls they kill most, side by side', async () => {
    renderShips(KILLS, FLOWN);
    const flies = await screen.findByRole('region', { name: 'Flies on kills' });
    expect(await within(flies).findByText('Gnosis')).toBeTruthy();
    expect(within(flies).getByText('47')).toBeTruthy();
    const killed = screen.getByRole('region', { name: 'Kills most' });
    expect(await within(killed).findByText('Capsule')).toBeTruthy();
    // Most kills first, with the count.
    const rows = within(killed).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Capsule');
    expect(rows[0].textContent).toContain('3');
    expect(rows[1].textContent).toContain('Ishtar');
  });

  it('says where each list comes from', () => {
    renderShips(KILLS, FLOWN);
    expect(screen.getByText('All-time, as zKillboard states them.')).toBeTruthy();
    expect(screen.getByText('From their latest 4 kills on zKillboard.')).toBeTruthy();
  });

  it('drops the flown column while the stats are not in', () => {
    renderShips(KILLS, null);
    expect(screen.queryByRole('region', { name: 'Flies on kills' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Kills most' })).toBeTruthy();
  });

  it('drops the killed column when no kill list came', () => {
    renderShips(null, FLOWN);
    expect(screen.getByRole('region', { name: 'Flies on kills' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Kills most' })).toBeNull();
  });

  it('draws nothing with neither', () => {
    const { container } = renderShips(null, null);
    expect(container.firstChild).toBeNull();
  });
});
