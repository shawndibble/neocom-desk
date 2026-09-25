import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ESI_REGISTRY } from '@/esi/registry';
import { beginEveLogin } from '@/app/loginFlow';
import { AssumesBaseStandingsNote } from './AssumesBaseStandingsNote';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const ACTIVE_ID = 7;
const OTHER_ID = 8;
const STANDINGS_SCOPE = ESI_REGISTRY.getCharacterStandings.scope;

async function seedGrant(characterId: number, scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
}

describe('AssumesBaseStandingsNote', () => {
  beforeEach(() => {
    useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
  });

  afterEach(async () => {
    await db.tokens.clear();
  });

  it('shows the note and grant action when the active character lacks the standings scope', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<AssumesBaseStandingsNote hint="Fees at 0 standing." />);

    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();
    expect(screen.getByText('Fees at 0 standing.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant Character details' }));
    expect(beginEveLogin).toHaveBeenCalled();
  });

  it('disappears once the standings scope is granted', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<AssumesBaseStandingsNote hint="Fees at 0 standing." />);
    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();

    await seedGrant(ACTIVE_ID, [STANDINGS_SCOPE]);
    await waitFor(() => expect(screen.queryByText('Assumes base standings')).toBeNull());
  });

  it('checks the given character, not the active one, and names them', async () => {
    await seedGrant(ACTIVE_ID, [STANDINGS_SCOPE]);
    await seedGrant(OTHER_ID, []);
    render(
      <AssumesBaseStandingsNote
        hint="Fees at 0 standing."
        characterId={OTHER_ID}
        characterName="Alt"
      />
    );

    expect(await screen.findByText('Alt — Assumes base standings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant Character details' }));
    expect(beginEveLogin).toHaveBeenCalledWith(expect.objectContaining({ characterId: OTHER_ID }));
  });
});
