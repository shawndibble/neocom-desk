import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { RouteStep } from '@/engine/route/routeSafetyTrip';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { RouteSafetyLeg } from './useRouteSafety';

const postAutopilotWaypointMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postAutopilotWaypoint: postAutopilotWaypointMock }));

import { SetWaypoints } from './SetWaypoints';

const ONE = 91;
const TWO = 92;
const JITA = 30000142;
const PERIMETER = 30000144;
const UEDAMA = 30002768;
const THERA = 31000005;
const NAMES = new Map([
  [JITA, 'Jita'],
  [PERIMETER, 'Perimeter'],
  [UEDAMA, 'Uedama'],
  [THERA, 'Thera'],
]);
const HOLE: RouteStep = {
  kind: 'hole',
  hole: {
    id: '1',
    hub: 'thera',
    hubSignature: 'ABC-123',
    exitSignature: 'XYZ-789',
    exitSystemId: UEDAMA,
    exitSystemName: 'Uedama',
    exitClass: null,
    exitRegionName: null,
    wormholeType: null,
    maxShipSize: 'large',
    expiresAt: 0,
  },
};
const BRIDGE: RouteStep = { kind: 'bridge', gate: { fromId: UEDAMA, toId: THERA, name: 'gate' } };
const WAYPOINT_SCOPE = 'esi-ui.write_waypoint.v1';

/** A leg flown by gate, its last step taken as `last` says. */
function leg(systems: number[], last: RouteStep = { kind: 'gate' }): RouteSafetyLeg {
  return {
    from: systems[0],
    to: systems[systems.length - 1],
    // Only `systemId` and `entry` matter here: the rows are read for how the trip is flown.
    rows: systems.map((systemId, index) => ({
      systemId,
      entry: index === 0 ? null : index === systems.length - 1 ? last : { kind: 'gate' },
    })) as NonNullable<RouteSafetyLeg['rows']>,
    summary: null,
    ways: [],
    pin: '',
    pinNote: null,
  };
}

async function seed(characters: { id: number; name: string; scopes: string[] }[]) {
  for (const { id, name, scopes } of characters) {
    await db.characters.put({ characterId: id, name, ownerHash: `oh-${id}`, addedAt: id });
    await db.tokens.put({
      characterId: id,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scopes,
    });
  }
}

function show(legs: RouteSafetyLeg[]) {
  render(
    <SetWaypoints legs={legs} nameOf={(id) => NAMES.get(id) ?? String(id)}>
      <span>facts</span>
    </SetWaypoints>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  postAutopilotWaypointMock.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

describe('SetWaypoints', () => {
  it('clears and sets each Stop in order, then says the client plans the path', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    show([leg([JITA, PERIMETER]), leg([PERIMETER, UEDAMA])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(
      await screen.findByText(
        'Waypoints set. Your client plans the path between them with its own settings.'
      )
    ).toBeInTheDocument();
    expect(postAutopilotWaypointMock.mock.calls).toEqual([
      [ONE, PERIMETER, { clearOtherWaypoints: true }],
      [ONE, UEDAMA, { clearOtherWaypoints: false }],
    ]);
  });

  it('sets waypoints only to a wormhole entrance, and says where to pick up', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    // Uedama → Thera is tagged a hole jump, as the trip assembly tags it.
    show([leg([JITA, PERIMETER, UEDAMA, THERA], HOLE)]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(
      await screen.findByText(
        'Waypoints set to Uedama. Take the wormhole there, then set the rest from Thera. Your client plans the path to Uedama with its own settings.'
      )
    ).toBeInTheDocument();
    expect(postAutopilotWaypointMock.mock.calls).toEqual([
      [ONE, UEDAMA, { clearOtherWaypoints: true }],
    ]);
  });

  it('sets waypoints only to a bridge entrance, naming it a bridge', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    // A stand-in Ansiblex from Uedama: the step is a bridge, not a hole.
    show([leg([JITA, PERIMETER, UEDAMA, THERA], BRIDGE)]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(
      await screen.findByText(
        'Waypoints set to Uedama. Take the bridge there, then set the rest from Thera. Your client plans the path to Uedama with its own settings.'
      )
    ).toBeInTheDocument();
  });

  it('disables the button for a Character without the scope, with a way to grant it', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: ['esi-location.read_location.v1'] }]);
    show([leg([JITA, PERIMETER])]);

    expect(
      await screen.findByText(/Setting waypoints needs a permission this character hasn't granted/)
    ).toBeInTheDocument();
    // `aria-disabled`, not `disabled`: the reason stays reachable in a tooltip.
    expect(screen.getByRole('button', { name: 'Set waypoints in game' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Log in again' })).toBeInTheDocument();
  });

  it('sets waypoints for the Character picked, not only the active one', async () => {
    await seed([
      { id: ONE, name: 'Pilot One', scopes: ['esi-location.read_location.v1'] },
      { id: TWO, name: 'Pilot Two', scopes: [WAYPOINT_SCOPE] },
    ]);
    show([leg([JITA, PERIMETER])]);

    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Character to set waypoints for' })
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Pilot Two' }));
    const button = screen.getByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    await waitFor(() =>
      expect(postAutopilotWaypointMock).toHaveBeenCalledWith(TWO, PERIMETER, {
        clearOtherWaypoints: true,
      })
    );
  });

  it('says ESI gave no reason rather than inventing one', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    postAutopilotWaypointMock.mockRejectedValue(new Error('network'));
    show([leg([JITA, PERIMETER])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Waypoints not set: ESI gave no reason. Is the character logged in to the game?'
    );
  });

  it('reports a failure plainly', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    const { EsiError } = await import('@/esi/errors');
    postAutopilotWaypointMock.mockRejectedValue(new EsiError(520, 'Character is not online'));
    show([leg([JITA, PERIMETER])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Waypoints not set: Character is not online'
    );
  });
});
