import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { StandingsScopeNotice } from './StandingsScopeNotice';

const beginEveLogin = vi.fn();
vi.mock('./loginFlow', () => ({ beginEveLogin: (...args: unknown[]) => beginEveLogin(...args) }));

const CHARACTER_ID = 12;

function grant(scopes: string[]) {
  return db.tokens.put({
    characterId: CHARACTER_ID,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60_000,
    scopes,
  });
}

beforeEach(async () => {
  beginEveLogin.mockClear();
  localStorage.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

describe('StandingsScopeNotice', () => {
  it('prompts a re-login when the grant predates the standings scope', async () => {
    await grant(['esi-characters.read_contacts.v1']);
    render(<StandingsScopeNotice />);

    await userEvent.click(
      await screen.findByRole('button', { name: /log in to share standings/i })
    );

    expect(beginEveLogin).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the grant already holds the scope', async () => {
    await grant(['esi-characters.read_standings.v1']);
    render(<StandingsScopeNotice />);

    // Let the live query resolve before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stays dismissed for that Character once dismissed', async () => {
    await grant([]);
    const { unmount } = render(<StandingsScopeNotice />);
    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    unmount();
    render(<StandingsScopeNotice />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
