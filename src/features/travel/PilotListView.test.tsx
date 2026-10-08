import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n';
import type { PilotListRow } from './pilotListData';

const mocks = vi.hoisted(() => ({ loadPilotList: vi.fn(), syncConfigured: true }));
vi.mock('./pilotListData', () => ({ loadPilotList: mocks.loadPilotList }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => mocks.syncConfigured }));

import { DscanShareControl, PilotListView } from './PilotListView';

function stats(dangerRatio: number, gangRatio: number, kills: number) {
  return {
    kind: 'stats' as const,
    stats: {
      kills,
      losses: 0,
      iskDestroyed: 0,
      iskLost: 0,
      iskEfficiency: null,
      soloKills: 0,
      dangerRatio,
      gangRatio,
      topShips: [],
      memberCount: null,
    },
  };
}

const ROWS: PilotListRow[] = [
  {
    name: 'Calm',
    characterId: 1,
    corporationName: 'C1',
    allianceName: null,
    state: stats(20, 10, 5),
  },
  {
    name: 'Risky',
    characterId: 2,
    corporationName: 'C2',
    allianceName: 'A2',
    state: stats(90, 80, 900),
  },
  {
    name: 'Ghost',
    characterId: null,
    corporationName: null,
    allianceName: null,
    state: { kind: 'not-found' },
  },
  {
    name: 'Newbie',
    characterId: 3,
    corporationName: null,
    allianceName: null,
    state: { kind: 'no-history' },
  },
  {
    name: 'Offline',
    characterId: 4,
    corporationName: null,
    allianceName: null,
    state: { kind: 'unreachable' },
  },
];

describe('PilotListView (Local list)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadPilotList.mockImplementation(
      (_names: string[], { onRows }: { onRows: (rows: PilotListRow[]) => void }) => {
        onRows(ROWS);
        return Promise.resolve();
      }
    );
  });

  it('sorts by danger, highest first, and keeps unknown rows below', async () => {
    render(
      <PilotListView
        paste={{ kind: 'local', names: ROWS.map((r) => r.name), overflow: 0 }}
        onOpen={() => undefined}
      />
    );
    const table = await screen.findByRole('table', { name: 'Pasted pilots' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0]?.firstChild?.textContent);
    expect(names.slice(0, 2)).toEqual(['Risky', 'Calm']);
    expect(within(table).getByText('90%')).toBeTruthy();
  });

  it('tells the three missing-data states apart', async () => {
    render(
      <PilotListView
        paste={{ kind: 'local', names: ROWS.map((r) => r.name), overflow: 0 }}
        onOpen={() => undefined}
      />
    );
    expect(await screen.findByText('Not found')).toBeTruthy();
    expect(screen.getByText('No zKillboard history')).toBeTruthy();
    expect(screen.getByText("zKillboard couldn't be reached")).toBeTruthy();
    expect(screen.getByText(/1 name not found: Ghost/)).toBeTruthy();
  });

  it('opens a pilot from its row and says how many names were cut off', async () => {
    const onOpen = vi.fn();
    render(
      <PilotListView
        paste={{ kind: 'local', names: ROWS.map((r) => r.name), overflow: 12 }}
        onOpen={onOpen}
      />
    );
    fireEvent.click(await screen.findByText('Risky'));
    expect(onOpen).toHaveBeenCalledWith(2);
    expect(screen.getByText(/12 more not looked up/)).toBeTruthy();
  });
});

describe('DscanShareControl', () => {
  const scan = (text: string) => ({ kind: 'dscan' as const, typeIds: [626], rows: [], text });
  const TAB = String.fromCharCode(9);
  const NL = String.fromCharCode(10);
  const SCAN = ['626', '587', '626', '587']
    .map((id) => [id, 'X', 'Ship', '1 km'].join(TAB))
    .join(NL);
  const share = () => screen.getByRole('button', { name: 'Copy Share Link' });

  beforeEach(() => {
    mocks.syncConfigured = true;
  });

  it('is a labelled button, enabled for a signed-in character', () => {
    render(<DscanShareControl paste={scan(SCAN)} characterId={1} />);
    expect(share()).toBeEnabled();
  });

  it('is disabled without a character', () => {
    render(<DscanShareControl paste={scan(SCAN)} characterId={null} />);
    expect(share()).toBeDisabled();
  });

  it('is disabled when the scan is too large to share', () => {
    render(<DscanShareControl paste={scan(SCAN + NL + 'x'.repeat(60_000))} characterId={1} />);
    expect(share()).toBeDisabled();
  });
});
