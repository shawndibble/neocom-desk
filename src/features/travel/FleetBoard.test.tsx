import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { DscanRow } from '@/engine/pilotList/parsePilotPaste';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({
    '22548': { name: 'Mackinaw', groupID: 543 },
    '28606': { name: 'Orca', groupID: 941 },
    '2175': { name: 'Infiltrator II', groupID: 100 },
  }),
  loadGroupCategories: async () => ({ '543': 6, '941': 6, '100': 18 }),
}));

import { PINNED_GROUP_IDS } from '@/engine/pilotList/dscanRoles';
import { FleetBoard } from './FleetBoard';

const row = (typeId: number, distanceKm: number | null, name = ''): DscanRow => ({
  typeId,
  name,
  typeName: '',
  distanceKm,
});
const ROWS = [
  row(22548, 23, 'OR:E'),
  row(22548, 46, 'OR:E'),
  row(22548, 135),
  row(28606, 89),
  row(2175, 77),
  row(2175, 400),
];

afterEach(cleanup);

describe('FleetBoard', () => {
  it('groups hulls by role with counts, group, name hint and distance range', async () => {
    render(<FleetBoard rows={ROWS} />);
    const industrial = await screen.findByRole('region', { name: 'Industrial' });
    expect(industrial.textContent).toContain('Mackinaw');
    expect(industrial.textContent).toContain('Exhumer');
    expect(industrial.textContent).toContain('2 named OR:E');
    expect(industrial.textContent).toContain('23 km – 135 km');
    // Drones are a role of their own, not left out.
    expect(screen.getByRole('region', { name: 'Drones and deployables' })).toBeTruthy();
  });

  it('opens with a Read-out: the reading, the threat and the cloaked-ships caveat', async () => {
    render(<FleetBoard rows={ROWS} />);
    const readout = await screen.findByTestId('dscan-readout');
    expect(readout.textContent).toContain('A mining fleet');
    expect(readout.textContent).toContain('Clear on scan');
    expect(readout.textContent).toContain('Can it catch you');
    expect(readout.textContent).toContain('Cloaked ships and anything past 14.3 AU do not show.');
  });

  it('is one button, collapsed until pressed, that reveals the distance lanes', async () => {
    const user = userEvent.setup();
    render(<FleetBoard rows={ROWS} />);
    const bar = await screen.findByRole('button', { expanded: false });
    expect(bar.textContent).toContain('Industrial');
    expect(bar.textContent).toContain('Drones and deployables');
    expect(screen.queryByText('Distance from you, by role (km)')).toBeNull();

    await user.click(bar);
    expect(bar.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Distance from you, by role (km)')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Industrial: 4, nearest 23 km' })).toBeTruthy();

    await user.click(bar);
    expect(screen.queryByText('Distance from you, by role (km)')).toBeNull();
  });
});

describe('group sub-labels', () => {
  it('has a string for every group id the roles pin', async () => {
    const { default: en } = await import('@/i18n/locales/en.json');
    const labels = en.travel.pilot.dscan.group as Record<string, string>;
    expect(PINNED_GROUP_IDS.filter((id) => labels[String(id)] === undefined)).toEqual([]);
  });
});
