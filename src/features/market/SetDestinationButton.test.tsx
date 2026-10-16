import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';

const waypoint = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postAutopilotWaypoint: waypoint }));

import { SetDestinationButton } from './SetDestinationButton';

const ONE = 91;

beforeEach(async () => {
  vi.clearAllMocks();
  waypoint.mockResolvedValue({ data: null });
  await db.characters.clear();
  await db.tokens.clear();
  await db.characters.put({ characterId: ONE, name: 'Pilot', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-ui.write_waypoint.v1'],
  });
  useActiveCharacter.setState({ activeCharacterId: ONE, hydrated: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

function show() {
  render(
    <MemoryRouter>
      <SetDestinationButton locationId={60003760} placeName="Jita IV" />
    </MemoryRouter>
  );
}

describe('SetDestinationButton', () => {
  it('is aria-disabled (not native disabled) with a visible reason while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    show();
    const button = await screen.findByRole('button', { name: /Set destination/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleDescription('Needs a connection');
    await userEvent.click(button);
    expect(waypoint).not.toHaveBeenCalled();
  });

  it('says it is offline on a network failure', async () => {
    waypoint.mockRejectedValue(new TypeError('Failed to fetch'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Set destination/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline");
  });
});
