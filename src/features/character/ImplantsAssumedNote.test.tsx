import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { ImplantsAssumedNote } from './ImplantsAssumedNote';

const ACTIVE_ID = 1;
const ALT_ID = 2;
const IMPLANTS_SCOPE = ESI_REGISTRY.getCharacterImplants.scope;
const NOTE = 'Assumes no implants';

async function seedGrant(characterId: number, scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
}

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
});

afterEach(async () => {
  await db.tokens.clear();
});

describe('ImplantsAssumedNote', () => {
  it('shows the hint and a grant action when the active Character lacks Character details', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<ImplantsAssumedNote hint="Job time skips implants." />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    expect(screen.getByText('Job time skips implants.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant Character details' })).toBeInTheDocument();
  });

  it('renders nothing once the active Character has granted it', async () => {
    await seedGrant(ACTIVE_ID, [IMPLANTS_SCOPE]);
    const { container } = render(<ImplantsAssumedNote hint="hint" />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('checks the named Character’s own grant, not the active one’s', async () => {
    await seedGrant(ACTIVE_ID, [IMPLANTS_SCOPE]);
    await seedGrant(ALT_ID, []);
    render(<ImplantsAssumedNote characterId={ALT_ID} hint="hint" />);

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it('holds back before the active Character has hydrated', async () => {
    useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: false });
    await seedGrant(ACTIVE_ID, []);
    const { container } = render(<ImplantsAssumedNote hint="hint" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
