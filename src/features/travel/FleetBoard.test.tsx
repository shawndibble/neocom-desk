import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('@/market/prices', () => ({
  getHubPrices: async (_hub: unknown, ids: number[]) =>
    new Map(
      ids.filter((id) => id !== 28606).map((id) => [id, { sellMin: 100_000_000, buyMax: null }])
    ),
}));

import { db } from '@/db';
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

beforeEach(async () => {
  await db.settings.clear();
});
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

  it('prices hulls and never shows 0 for a hull with no price', async () => {
    render(<FleetBoard rows={ROWS} />);
    const worth = await screen.findByRole('region', { name: /Worth on the scan/ });
    expect(await within(worth).findAllByText('300M ISK')).toHaveLength(2);
    expect(worth.textContent).toContain('1 × Orca');
    expect(worth.textContent).toContain('price unavailable');
    expect(worth.textContent).toContain('Total');
    expect(worth.textContent).toContain('1 ship has no price');
  });

  it('diffs against the last stored scan and keeps only that one', async () => {
    await db.settings.put({
      key: 'dscan.lastScan',
      value: [
        { typeId: 22548, count: 1 },
        { typeId: 28606, count: 2 },
      ],
    });
    render(<FleetBoard rows={ROWS} trackHistory />);
    const since = await screen.findByRole('region', { name: /Since your last scan/ });
    expect(await within(since).findByText('+2')).toBeTruthy();
    expect(since.textContent).toContain('Mackinaw');
    expect(within(since).getByText('-1')).toBeTruthy();
    await waitFor(async () => {
      const stored = await db.settings.get('dscan.lastScan');
      expect(stored?.value).toContainEqual({ typeId: 22548, count: 3 });
    });
  });

  it('says so when there is no earlier scan, and a Shared D-Scan shows no diff', async () => {
    const first = render(<FleetBoard rows={ROWS} trackHistory />);
    expect(await screen.findByText(/No earlier scan stored/)).toBeTruthy();
    first.unmount();
    render(<FleetBoard rows={ROWS} />);
    await screen.findByRole('region', { name: /Worth on the scan/ });
    expect(screen.queryByRole('region', { name: /Since your last scan/ })).toBeNull();
  });
});
