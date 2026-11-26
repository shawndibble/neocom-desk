import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { scopesForGroup } from '@/esi/scopes';
import { usePermissionMarkDismissalsStore } from '@/features/permissions/permissionMarkDismissals';
import { setWaypointsInGame } from '@/features/travel/sendWaypoints';
import { configureClipboard } from '@/lib/clipboard';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedCharacter, seedGrant } from '@/test/seed';
import { TurnInBreakdown } from './TurnInBreakdown';
import { TurnInDetail, TurnInGlyph } from './TurnInDetail';
import type { TurnInOfferDetail } from './useTurnIns';

const mocks = vi.hoisted(() => ({ joined: vi.fn() }));
vi.mock('./campaignData', () => ({ loadJoinedObjectives: mocks.joined }));
vi.mock('@/features/travel/sendWaypoints', () => ({
  setWaypointsInGame: vi.fn().mockResolvedValue({ ok: true }),
}));

const ACTIVE_ID = 7;
const ALT_ID = 8;
const CAMPAIGNS = scopesForGroup('militaryCampaigns');
const WAYPOINTS = scopesForGroup('autopilot');

const REPORT: TurnInOfferDetail = {
  objectiveId: 'obj-report',
  campaignId: 'camp-caldari',
  typeId: 97545,
  iskPerItem: 28_000,
  iskPerInterval: 28_000,
  iskInterval: 1,
  lpPerItem: 40,
  lpPerBlock: 4_000,
  lpBlockSize: 100,
  lpCorporationId: 1000035,
  lpValue: 800,
  lpIskPerItem: 32_000,
  totalPerItem: 60_000,
  traderTypeId: 97622,
  traderName: 'Secure Strength Trader',
  systemId: 30045324,
  progress: 1_700_000,
  targetProgress: 10_000_000,
  filled: 0.17,
  remaining: 8_300_000,
  maxPerParticipant: null,
  objectiveTitle: 'Deliver Shield Failover Report in Onnamon',
  campaignTitle: 'Secure Strength',
  factionId: 500001,
  systemName: 'Onnamon',
  lpValueSource: 'market',
};

function joinedRead(committed: boolean) {
  return {
    kind: 'ok',
    joined: new Map([
      ['obj-report', { id: 'obj-report', campaignId: 'camp-caldari', committed, contributed: 0 }],
    ]),
    fetchedAt: new Date(),
    fromCache: false,
  };
}

async function openDetail(onRowClick = vi.fn()) {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <div onClick={onRowClick}>
        <TurnInDetail
          name="Shield Failover Report"
          offer={REPORT}
          characterId={ALT_ID}
          surfaceLine="You hold 340 · ~19.1M turned in"
          trigger={<TurnInGlyph name="Shield Failover Report" />}
        />
      </div>
    </MemoryRouter>
  );
  await user.click(
    screen.getByRole('button', { name: 'Turn-in reward for Shield Failover Report' })
  );
  const dialog = await screen.findByRole('dialog', {
    name: 'Shield Failover Report: turn-in reward',
  });
  return { user, dialog, onRowClick };
}

beforeEach(async () => {
  mocks.joined.mockResolvedValue(joinedRead(true));
  vi.mocked(setWaypointsInGame).mockClear();
  useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
  await seedCharacter(ACTIVE_ID, 'Active');
  await seedCharacter(ALT_ID, 'Alt');
  await seedGrant(ACTIVE_ID, [...CAMPAIGNS, ...WAYPOINTS]);
});

afterEach(async () => {
  await usePermissionMarkDismissalsStore.getState().setValue([]);
  await db.settings.clear();
  await db.tokens.clear();
  await db.characters.clear();
});

describe('TurnInDetail', () => {
  it("shows the reward and the row's Character's Participate, and sets that Character's destination", async () => {
    await seedGrant(ALT_ID, [...CAMPAIGNS, ...WAYPOINTS]);
    const { user, dialog, onRowClick } = await openDetail();

    expect(within(dialog).getByText('~60K')).toBeInTheDocument();
    expect(within(dialog).getByText('28,000 ISK + 40 LP (~32K)')).toBeInTheDocument();
    expect(within(dialog).getByText('You hold 340 · ~19.1M turned in')).toBeInTheDocument();
    expect(within(dialog).getByText('Secure Strength Trader · Onnamon')).toBeInTheDocument();
    expect(within(dialog).getByText('17% filled')).toBeInTheDocument();
    expect(
      within(dialog).getByText('LP paid per full 100 items · + faction tokens')
    ).toBeInTheDocument();
    expect(await within(dialog).findByText('Alt pressed Participate')).toBeInTheDocument();
    expect(mocks.joined).toHaveBeenCalledWith(ALT_ID);

    await user.click(within(dialog).getByRole('button', { name: 'Set destination to Onnamon' }));
    await waitFor(() => expect(setWaypointsInGame).toHaveBeenCalledWith(ALT_ID, [30045324]));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('tells a Character who has not pressed Participate where to press it', async () => {
    mocks.joined.mockResolvedValue(joinedRead(false));
    await seedGrant(ALT_ID, [...CAMPAIGNS, ...WAYPOINTS]);
    const { dialog } = await openDetail();
    expect(
      await within(dialog).findByText(
        'Not participating: press Participate now in the Opportunities window'
      )
    ).toBeInTheDocument();
  });

  it('marks the caveat and the blocked button when both Permissions are missing', async () => {
    await seedGrant(ALT_ID, []);
    const { user, dialog } = await openDetail();

    expect(
      within(dialog).getByText("Pays only if you've pressed Participate on the opportunity")
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByRole('button', { name: 'Alt: Military Campaigns not granted' })
    ).toBeInTheDocument();
    const button = within(dialog).getByRole('button', { name: 'Set destination to Onnamon' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(
      await within(dialog).findByRole('button', { name: 'Alt: Autopilot waypoints not granted' })
    ).toBeInTheDocument();
    await user.click(button);
    expect(setWaypointsInGame).not.toHaveBeenCalled();
  });

  it('drops both marks once dismissed, keeping the caveat and the disabled button', async () => {
    await seedGrant(ALT_ID, []);
    await usePermissionMarkDismissalsStore.getState().setValue(['militaryCampaigns', 'autopilot']);
    const { dialog } = await openDetail();

    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Set destination to Onnamon' })
      ).toHaveAttribute('aria-disabled', 'true')
    );
    expect(
      within(dialog).getByText("Pays only if you've pressed Participate on the opportunity")
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /not granted/ })).toBeNull();
  });
});

describe('TurnInBreakdown', () => {
  it('groups by Item Trader, totals the pile and copies each group as multibuy text', async () => {
    await seedGrant(ACTIVE_ID, [...CAMPAIGNS, ...WAYPOINTS]);
    const written = vi.fn().mockResolvedValue(undefined);
    configureClipboard(written);
    const user = userEvent.setup();
    const signal: TurnInOfferDetail = {
      ...REPORT,
      objectiveId: 'obj-signal',
      typeId: 97547,
      traderTypeId: 97623,
      traderName: 'Trail of Silence Trader',
      systemId: 30002537,
      systemName: 'Amo',
    };
    render(
      <MemoryRouter>
        <TurnInBreakdown
          open
          onClose={() => {}}
          items={[
            { name: 'Shield Failover Report', quantity: 300, offer: REPORT },
            { name: 'Stereo-Collapse Signal', quantity: 200, offer: signal },
          ]}
        />
      </MemoryRouter>
    );
    const dialog = await screen.findByRole('dialog', { name: 'Turn in: ~30M' });
    expect(within(dialog).getByText('Secure Strength Trader · Onnamon')).toBeInTheDocument();
    expect(within(dialog).getByText('Trail of Silence Trader · Amo')).toBeInTheDocument();
    expect((await within(dialog).findAllByText('Participating')).length).toBeGreaterThan(0);

    await user.click(
      within(dialog).getByRole('button', { name: 'Copy the list for Trail of Silence Trader' })
    );
    await waitFor(() => expect(written).toHaveBeenCalledWith('Stereo-Collapse Signal\t200'));
    configureClipboard(null);
  });
});
