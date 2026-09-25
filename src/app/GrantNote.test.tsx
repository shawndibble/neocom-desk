import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ESI_REGISTRY, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from './loginFlow';
import { GrantBanner, GrantNote } from './GrantNote';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const ACTIVE_ID = 7;
const ALT_ID = 8;
const ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];
const SCOPE = ESI_REGISTRY.getCharacterStandings.scope;
const COPY = { title: 'Assumes base standings', hint: 'Fees at 0.', actionLabel: 'Grant it' };

async function seedGrant(characterId: number, scopes: readonly string[]): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60_000,
    scopes: [...scopes],
  });
}

/** Lets a live query that would show the note settle before asserting it didn't. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  vi.mocked(beginEveLogin).mockClear();
  useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
});

afterEach(async () => {
  await db.tokens.clear();
});

describe('GrantNote', () => {
  it("shows for the active Character when their grant lacks the endpoints' scope", async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} {...COPY} />);

    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();
    expect(screen.getByText('Fees at 0.')).toBeInTheDocument();
  });

  it('renders nothing when the grant holds the scope', async () => {
    await seedGrant(ACTIVE_ID, [SCOPE]);
    const { container } = render(<GrantNote endpoints={ENDPOINTS} {...COPY} />);

    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it('treats a Character with no stored token as lacking the scope', async () => {
    render(<GrantNote endpoints={ENDPOINTS} {...COPY} />);

    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();
  });

  it('disappears once the grant lands', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} {...COPY} />);
    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();

    await seedGrant(ACTIVE_ID, [SCOPE]);
    await waitFor(() => expect(screen.queryByText('Assumes base standings')).toBeNull());
  });

  it('holds back before the active Character has hydrated', async () => {
    useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: false });
    await seedGrant(ACTIVE_ID, []);
    const { container } = render(<GrantNote endpoints={ENDPOINTS} {...COPY} />);

    await settle();
    expect(container).toBeEmptyDOMElement();
  });

  it("checks, names, and grants for the given Character's own grant, not the active one's", async () => {
    await seedGrant(ACTIVE_ID, [SCOPE]);
    await seedGrant(ALT_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} characterId={ALT_ID} characterName="Alt" {...COPY} />);

    expect(await screen.findByText('Alt — Assumes base standings')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant it' }));
    expect(beginEveLogin).toHaveBeenCalledWith({
      characterId: ALT_ID,
      groups: ['characterDetails'],
    });
  });

  it("never shows the next Character using the previous one's answer", async () => {
    await seedGrant(ACTIVE_ID, []);
    await seedGrant(ALT_ID, [SCOPE]);
    const { rerender } = render(
      <GrantNote endpoints={ENDPOINTS} characterId={ACTIVE_ID} {...COPY} />
    );
    expect(await screen.findByText('Assumes base standings')).toBeInTheDocument();

    // Synchronously after the switch the query still holds ACTIVE_ID's answer.
    rerender(<GrantNote endpoints={ENDPOINTS} characterId={ALT_ID} {...COPY} />);
    expect(screen.queryByText('Assumes base standings')).toBeNull();
    await settle();
    expect(screen.queryByText('Assumes base standings')).toBeNull();
  });
});

describe('GrantBanner', () => {
  it("asks for the endpoints' Permission for exactly the given Character", async () => {
    render(<GrantBanner characterId={ALT_ID} endpoints={['getCharacterMailHeaders']} {...COPY} />);

    await userEvent.click(screen.getByRole('button', { name: 'Grant it' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: ALT_ID, groups: ['mail'] });
  });

  it('asks for no Permission for a Core Grant endpoint, only the re-login', async () => {
    render(<GrantBanner characterId={ALT_ID} endpoints={['getCharacterSkills']} {...COPY} />);

    await userEvent.click(screen.getByRole('button', { name: 'Grant it' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: ALT_ID, groups: [] });
  });

  it('prefixes the title with the Character it is for, when named', () => {
    render(
      <GrantBanner
        characterId={ALT_ID}
        characterName="Alt"
        endpoints={['getCharacterMailHeaders']}
        {...COPY}
      />
    );

    expect(screen.getByText('Alt — Assumes base standings')).toBeInTheDocument();
  });
});
