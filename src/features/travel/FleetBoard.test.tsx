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
    '1': { name: 'Cenotaph', groupID: 419 },
    '2': { name: 'Bustard', groupID: 380 },
    '3': { name: 'Rapier', groupID: 833 },
    '4': { name: 'Catalyst', groupID: 420 },
    '5': { name: 'Iteron V', groupID: 28 },
  }),
  loadGroupCategories: async () => ({
    '543': 6,
    '941': 6,
    '100': 18,
    '419': 6,
    '380': 6,
    '833': 6,
    '420': 6,
    '28': 6,
  }),
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

const openFullScan = async (user: ReturnType<typeof userEvent.setup>) => {
  const toggle = await screen.findByRole('button', { name: /^Full scan/ });
  if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
};

describe('FleetBoard', () => {
  it('groups hulls by role with counts, group, name hint and distance range', async () => {
    const user = userEvent.setup();
    render(<FleetBoard rows={ROWS} />);
    await openFullScan(user);
    const industrial = await screen.findByRole('region', { name: 'Industrial' });
    expect(industrial.textContent).toContain('Mackinaw');
    expect(industrial.textContent).toContain('Exhumer');
    expect(industrial.textContent).toContain('2 named OR:E');
    expect(industrial.textContent).toContain('23 km – 135 km');
    // Drones are a role of their own, not left out.
    expect(screen.getByRole('region', { name: 'Drones and deployables' })).toBeTruthy();
  });

  it('opens with the answer: Clear, the pattern, nothing to watch, and the Full scan collapsed', async () => {
    render(<FleetBoard rows={ROWS} />);
    const answer = await screen.findByTestId('dscan-answer');
    expect(answer.getAttribute('data-level')).toBe('clear');
    expect(answer.textContent).toContain('Nothing here can hurt you.');
    expect(answer.textContent).toContain('Reads as: A mining fleet.');
    expect(answer.textContent).toContain('Cloaked ships do not show on scan.');
    expect(screen.getByText('Nothing to watch.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Leave or re-check if' })).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /^Full scan: 4 ships/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Industrial' })).toBeNull();
  });

  it('names what can hurt and find you, ranked, with the reason in text', async () => {
    render(<FleetBoard rows={[row(1, 12), row(3, 30), row(2, 8)]} />);
    const answer = await screen.findByTestId('dscan-answer');
    expect(answer.getAttribute('data-level')).toBe('watch');
    expect(answer.textContent).toContain('One ship can hurt you, and one can find you.');
    expect(answer.textContent).toContain('Your ship is not set');
    const watch = screen.getByRole('region', { name: /Watch these/ });
    const items = within(watch).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Cenotaph');
    expect(items[0].textContent).toContain('Can hurt you');
    expect(items[1].textContent).toContain('Rapier');
    expect(items[1].textContent).toContain('Can find you');
    expect(watch.textContent).toContain('Not a threat');
  });

  it('reads the same scan wider for a fragile ship the pilot picked', async () => {
    await db.settings.put({ key: 'dscan.ownShip', value: 5 });
    render(<FleetBoard rows={[row(1, 12), row(4, 14)]} />);
    const answer = await screen.findByTestId('dscan-answer');
    await waitFor(() => expect(answer.textContent).toContain('Read for your Iteron V'));
    expect(answer.textContent).toContain('2 ships can hurt you.');
  });

  it('on the live view: says when the scan was taken, and a first scan has nothing to compare', async () => {
    render(<FleetBoard rows={[row(1, 12), row(3, 30)]} trackHistory />);
    const answer = await screen.findByTestId('dscan-answer');
    expect(answer.textContent).toContain('Scanned 5 seconds ago');
    expect(screen.getByText('First scan on this device.')).toBeTruthy();
  });

  it('tags a group that is new since the last scan', async () => {
    await db.settings.put({ key: 'dscan.lastScan', value: [{ typeId: 3, count: 1 }] });
    render(<FleetBoard rows={[row(1, 12), row(3, 30)]} trackHistory />);
    const watch = await screen.findByRole('region', { name: /Watch these/ });
    expect(within(watch).getByText('New')).toBeTruthy();
    expect(screen.getByTestId('dscan-answer').textContent).toContain(
      'Cenotaph is new since your last scan.'
    );
    expect(screen.queryByText('First scan on this device.')).toBeNull();
  });

  it('a Shared D-Scan shows no scan age and no first-scan note', async () => {
    render(<FleetBoard rows={[row(1, 12), row(3, 30)]} />);
    const answer = await screen.findByTestId('dscan-answer');
    expect(answer.textContent).not.toContain('Scanned');
    expect(screen.queryByText('First scan on this device.')).toBeNull();
  });

  it('is one button, collapsed until pressed, that reveals the distance lanes', async () => {
    const user = userEvent.setup();
    render(<FleetBoard rows={ROWS} />);
    await openFullScan(user);
    const bar = await screen.findByRole('button', { name: /Fleet by role/ });
    expect(bar.getAttribute('aria-expanded')).toBe('false');
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

describe('the Full scan', () => {
  it('prices hulls and never shows 0 for a hull with no price', async () => {
    const user = userEvent.setup();
    render(<FleetBoard rows={ROWS} />);
    await openFullScan(user);
    const worth = await screen.findByRole('region', { name: /Worth on the scan/ });
    expect(await within(worth).findAllByText('300M')).toHaveLength(2);
    expect(worth.textContent).toContain('1 × Orca');
    expect(worth.textContent).toContain('price unavailable');
    expect(worth.textContent).toContain('Total');
    expect(worth.textContent).toContain('1 ship has no price');
  });

  it('diffs against the last stored scan and keeps only that one', async () => {
    const user = userEvent.setup();
    await db.settings.put({
      key: 'dscan.lastScan',
      value: [
        { typeId: 22548, count: 1 },
        { typeId: 28606, count: 2 },
      ],
    });
    render(<FleetBoard rows={ROWS} trackHistory />);
    await openFullScan(user);
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
    const user = userEvent.setup();
    const first = render(<FleetBoard rows={ROWS} trackHistory />);
    await openFullScan(user);
    expect(await screen.findByText(/No earlier scan stored/)).toBeTruthy();
    first.unmount();
    render(<FleetBoard rows={ROWS} />);
    await openFullScan(user);
    await screen.findByRole('region', { name: /Worth on the scan/ });
    expect(screen.queryByRole('region', { name: /Since your last scan/ })).toBeNull();
  });
});
