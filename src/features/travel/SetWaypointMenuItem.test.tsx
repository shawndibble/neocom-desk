import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { RowActionsMenu } from '@/components/ui';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const postAutopilotWaypointMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postAutopilotWaypoint: postAutopilotWaypointMock }));

import { SetWaypointMenuItem } from './SetWaypointMenuItem';

const ONE = 91;
const JITA_4_4 = 60003760;
const PLACE = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
const WAYPOINT_SCOPE = 'esi-ui.write_waypoint.v1';

async function seed(scopes: string[]) {
  await db.characters.put({ characterId: ONE, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

function openMenu() {
  render(
    <RowActionsMenu
      name="row"
      items={<SetWaypointMenuItem locationId={JITA_4_4} placeName={PLACE} />}
    >
      <div>row</div>
    </RowActionsMenu>
  );
  fireEvent.contextMenu(screen.getByText('row'));
}

beforeEach(async () => {
  vi.clearAllMocks();
  postAutopilotWaypointMock.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

describe('SetWaypointMenuItem', () => {
  it("sets the place as the client's destination and says so in the open menu", async () => {
    await seed([WAYPOINT_SCOPE]);
    openMenu();

    const item = await screen.findByRole('menuitem', { name: 'Set waypoint in game' });
    await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(item);

    expect(await screen.findByRole('status')).toHaveTextContent(`Destination set to ${PLACE}`);
    expect(postAutopilotWaypointMock.mock.calls).toEqual([
      [ONE, JITA_4_4, { clearOtherWaypoints: true }],
    ]);
  });

  it('reports a refusal in the menu rather than failing silently', async () => {
    await seed([WAYPOINT_SCOPE]);
    const { EsiError } = await import('@/esi/errors');
    postAutopilotWaypointMock.mockRejectedValue(new EsiError(520, 'Character is not online'));
    openMenu();

    const item = await screen.findByRole('menuitem', { name: 'Set waypoint in game' });
    await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(item);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Waypoints not set: Character is not online'
    );
  });

  it('stays inert for a Character without the waypoint scope', async () => {
    await seed(['esi-location.read_location.v1']);
    openMenu();

    // Inert renders a different item (`DisabledMenuItem`), so query afresh each try.
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Set waypoint in game' })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Set waypoint in game' }));

    expect(postAutopilotWaypointMock).not.toHaveBeenCalled();
  });
});
