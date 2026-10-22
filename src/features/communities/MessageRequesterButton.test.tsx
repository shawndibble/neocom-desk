import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';

const newMail = vi.hoisted(() => vi.fn());
vi.mock('@/esi/endpoints', () => ({ postOpenWindowNewMail: newMail }));

import { MessageRequesterButton } from './MessageRequesterButton';

const ONE = 91;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.characters.clear();
  await db.tokens.clear();
  await db.characters.put({ characterId: ONE, name: 'Pilot', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: ONE,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-ui.open_window.v1'],
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

function show() {
  render(
    <MemoryRouter>
      <MessageRequesterButton
        characterId={ONE}
        recipientId={5}
        name="Requester"
        subject="s"
        body="b"
      />
    </MemoryRouter>
  );
}

describe('MessageRequesterButton', () => {
  it('says it is offline, not that the character is out of the game, on a network failure', async () => {
    newMail.mockRejectedValue(new TypeError('Failed to fetch'));
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Requester/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("You're offline");
    expect(alert).not.toHaveTextContent('logged in to the game');
  });

  it('renders nothing when the character lacks the permission', async () => {
    await db.tokens.update(ONE, { scopes: [] });
    show();
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: /Requester/ })).not.toBeInTheDocument()
    );
  });

  it('is aria-disabled with a visible reason while offline, and sends nothing', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    show();
    const button = await screen.findByRole('button', { name: /Requester/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Needs a connection');
    await userEvent.click(button);
    expect(newMail).not.toHaveBeenCalled();
  });
});
