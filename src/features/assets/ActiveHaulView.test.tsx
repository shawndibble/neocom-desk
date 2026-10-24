import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { HaulLeg } from '@/engine/route/haulPlan';
import type { ActiveHaul } from './activeHaul';
import { ActiveHaulView } from './ActiveHaulView';

const station = { systemId: 30000142, stationId: 60003760, name: 'Jita 4-4' };
const pickup = (systemId: number, stationId: number | null, name: string) => ({
  systemId,
  stationId,
  name,
});
const start = pickup(30002187, null, 'Amarr');

const legs: HaulLeg[] = [
  {
    id: 0,
    characterId: 1,
    trip: 1,
    kind: 'pickup',
    from: start,
    to: pickup(30002659, 60008494, 'Dodixie IX'),
    jumps: 4,
    m3: 80,
    locationId: 1,
  },
  {
    id: 1,
    characterId: 1,
    trip: 1,
    kind: 'delivery',
    from: pickup(30002659, 60008494, 'Dodixie IX'),
    to: station,
    jumps: 6,
    m3: 80,
    locationId: null,
  },
  {
    id: 2,
    characterId: 1,
    trip: 2,
    kind: 'pickup',
    from: station,
    to: pickup(30002659, 60008494, 'Dodixie IX'),
    jumps: 6,
    m3: 20,
    locationId: 1,
  },
];

const haul: ActiveHaul = {
  id: 'h1',
  createdAt: 1,
  capacityM3: 100,
  destination: station,
  plan: {
    sections: [{ characterId: 1, name: 'Alice', trips: 2, legs }],
    leftOut: [
      { characterId: 1, name: 'Alice', locationId: 9, place: 'Rens VI', m3: 30, reason: 'cap' },
    ],
    flown: [{ characterId: 1, name: 'Alice', ships: ['Rifter'] }],
    totals: { legs: 3, jumps: 16, m3: 100 },
  },
};

function renderView(onClear = vi.fn().mockResolvedValue(undefined)) {
  render(
    <MemoryRouter>
      <ActiveHaulView haul={haul} onBack={vi.fn()} onClear={onClear} />
    </MemoryRouter>
  );
  return onClear;
}

describe('ActiveHaulView', () => {
  it('summarises the route and lists every leg, repeat station included', () => {
    renderView();
    expect(screen.getByText('3 legs · 16 jumps · 100 m³ to Jita 4-4')).toBeTruthy();
    expect(screen.getAllByText(/Dodixie IX/).length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-leg-id'))
    ).toHaveLength(3);
  });

  it('opens the next leg and folds the later ones', async () => {
    renderView();
    const buttons = screen.getAllByRole('button', { expanded: false });
    expect(screen.getAllByRole('link', { name: /Show in Route Safety/ })).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(screen.getAllByRole('link', { name: /Show in Route Safety/ })).toHaveLength(2);
  });

  it('links the first leg to Route Safety with its station-tagged stop', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Show in Route Safety, leg 1' });
    const params = new URL(link.getAttribute('href')!, 'http://x').searchParams;
    expect(params.get('from')).toBe('30002187');
    expect(params.get('stops')).toBe('30002659:60008494');
  });

  it('says what the cap left out and which ships are flown', () => {
    renderView();
    expect(screen.getByText(/Rens VI \(Alice\): 30 m³ is past the ten-stop limit/)).toBeTruthy();
    expect(screen.getByText(/Alice flies out: Rifter/)).toBeTruthy();
  });

  it('clears only after a confirm', async () => {
    const onClear = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Clear haul' }));
    expect(onClear).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Clear haul' }).find((b) => dialog.contains(b))!
    );
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
