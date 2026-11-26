import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { GrantNote } from './GrantNote';
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
  await db.characters.put({
    characterId: CHARACTER_ID,
    name: 'Kestrel Vane',
    ownerHash: 'h',
    addedAt: 0,
  });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
});

function WithControl() {
  return (
    <>
      <StandingsScopeNotice />
      <GrantNote
        endpoints={['getCharacterStandings']}
        characterId={CHARACTER_ID + 1}
        title="Control"
      />
    </>
  );
}
const settled = () => screen.findByText('Control');
const notice = () => screen.queryByText('Kestrel Vane: grant Character details');

describe('StandingsScopeNotice', () => {
  it('offers to grant the missing standings scope, not a re-login', async () => {
    await grant(['esi-characters.read_contacts.v1']);
    render(<StandingsScopeNotice />);

    expect(await screen.findByText('Kestrel Vane: grant Character details')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));

    expect(screen.queryByText(/logged in before/i)).not.toBeInTheDocument();
    expect(beginEveLogin).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the grant already holds the scope', async () => {
    await grant(['esi-characters.read_standings.v1']);
    render(<WithControl />);

    await settled();
    expect(notice()).not.toBeInTheDocument();
  });

  it('stays dismissed for that Character once dismissed', async () => {
    await grant([]);
    const { unmount } = render(<StandingsScopeNotice />);
    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    unmount();
    render(<WithControl />);
    await settled();
    expect(notice()).not.toBeInTheDocument();
  });
});
