import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import type { RouteStep } from '@/engine/route/routeSafetyTrip';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { RouteSafetyLeg } from './useRouteSafety';

const postAutopilotWaypointMock = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postAutopilotWaypoint: postAutopilotWaypointMock }));

const grantMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/grantAction', () => ({ beginGrant: grantMock }));

import { SetWaypoints } from './SetWaypoints';
import { useWaypointsDismissed } from './waypointsDismissed';

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

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
  return render(
    <MemoryRouter>
      <SetWaypoints legs={legs} nameOf={(id) => NAMES.get(id) ?? String(id)}>
        <span>facts</span>
      </SetWaypoints>
      <Where />
    </MemoryRouter>
  );
}

function setOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

beforeEach(async () => {
  vi.clearAllMocks();
  postAutopilotWaypointMock.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  await useWaypointsDismissed.getState().setValue(false);
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

  it('offers Grant, Manage and Dismiss to a Character without the scope', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: ['esi-location.read_location.v1'] }]);
    show([leg([JITA, PERIMETER])]);

    expect(
      await screen.findByText("Pilot One hasn't granted Autopilot waypoints")
    ).toBeInTheDocument();
    expect(screen.queryByText(/log in again/i)).not.toBeInTheDocument();
    // `aria-disabled`, not `disabled`: the reason stays reachable in a tooltip.
    expect(screen.getByRole('button', { name: 'Set waypoints in game' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Grant permission' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage permissions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('grants only Autopilot waypoints, for that Character', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [] }]);
    show([leg([JITA, PERIMETER])]);

    await userEvent.click(await screen.findByRole('button', { name: 'Grant permission' }));
    expect(grantMock).toHaveBeenCalledWith(ONE, ['postAutopilotWaypoint']);
  });

  it('links Manage to Permissions, switching to a Character that is not active', async () => {
    await seed([
      { id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] },
      { id: TWO, name: 'Pilot Two', scopes: [] },
    ]);
    show([leg([JITA, PERIMETER])]);

    await userEvent.click(
      await screen.findByRole('combobox', { name: 'Character to set waypoints for' })
    );
    await userEvent.click(await screen.findByRole('option', { name: 'Pilot Two' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Manage permissions' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/settings/permissions?grant=autopilot');
    expect(useActiveCharacter.getState().activeCharacterId).toBe(TWO);
  });

  it('Dismiss hides the note, the button and the select, and survives a remount', async () => {
    await seed([
      { id: ONE, name: 'Pilot One', scopes: [] },
      { id: TWO, name: 'Pilot Two', scopes: [] },
    ]);
    const first = show([leg([JITA, PERIMETER])]);

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Set waypoints in game' })).toBeNull()
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grant permission' })).toBeNull();
    expect(screen.getByText('facts')).toBeInTheDocument();

    first.unmount();
    show([leg([JITA, PERIMETER])]);
    expect(await screen.findByText('facts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set waypoints in game' })).toBeNull();
  });

  it('shows the button for a Character that holds the scope even when dismissed', async () => {
    await useWaypointsDismissed.getState().setValue(true);
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    show([leg([JITA, PERIMETER])]);

    expect(
      await screen.findByRole('button', { name: 'Set waypoints in game' })
    ).toBeInTheDocument();
  });

  it('brings the dismissal back when the scope is revoked', async () => {
    await useWaypointsDismissed.getState().setValue(true);
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    show([leg([JITA, PERIMETER])]);
    await screen.findByRole('button', { name: 'Set waypoints in game' });

    await db.tokens.update(ONE, { scopes: [] });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Set waypoints in game' })).toBeNull()
    );
    expect(useWaypointsDismissed.getState().value).toBe(true);
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

  it('says it is offline when the request never left the browser', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    postAutopilotWaypointMock.mockRejectedValue(new TypeError('Failed to fetch'));
    show([leg([JITA, PERIMETER])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You're offline — waypoints weren't set.");
    expect(alert).not.toHaveTextContent('ESI gave no reason');
  });

  it('says how many were set when the connection drops partway', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    postAutopilotWaypointMock
      .mockResolvedValueOnce({ data: null })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    show([leg([JITA, PERIMETER]), leg([PERIMETER, UEDAMA])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You're offline — 1 of 2 waypoints were set"
    );
  });

  it('does not claim the rest were not set when the request timed out after leaving', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    const { EsiTimeoutError } = await import('@/esi/errors');
    postAutopilotWaypointMock
      .mockResolvedValueOnce({ data: null })
      .mockRejectedValueOnce(new EsiTimeoutError(30_000, true));
    show([leg([JITA, PERIMETER]), leg([PERIMETER, UEDAMA])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'At least 1 of 2 waypoints were set'
    );
  });

  it('is disabled with a "Needs a connection" reason while offline, and sends nothing', async () => {
    await seed([{ id: ONE, name: 'Pilot One', scopes: [WAYPOINT_SCOPE] }]);
    setOffline();
    show([leg([JITA, PERIMETER])]);

    const button = await screen.findByRole('button', { name: 'Set waypoints in game' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.pointerMove(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs a connection');
    await userEvent.click(button);
    expect(postAutopilotWaypointMock).not.toHaveBeenCalled();
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
