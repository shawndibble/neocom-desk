import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { ESI_REGISTRY, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginEveLogin } from './loginFlow';
import { GrantBanner, GrantNote } from './GrantNote';
import { seedCharacter, seedGrant } from '@/test/seed';

vi.mock('./loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const ACTIVE_ID = 7;
const ALT_ID = 8;
const ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];
const SCOPE = ESI_REGISTRY.getCharacterStandings.scope;
const CONTEXT = 'Assumes base standings';
const ACTIVE_TITLE = 'Active: grant Character details';

const CONTROL_ID = 9;
function Control() {
  return (
    <GrantNote
      endpoints={ENDPOINTS}
      characterId={CONTROL_ID}
      characterName="Control"
      title={CONTEXT}
    />
  );
}
const settled = () => screen.findByText('Control: grant Character details');

beforeEach(async () => {
  vi.mocked(beginEveLogin).mockClear();
  useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: true });
  await seedCharacter(ACTIVE_ID, 'Active');
});

afterEach(async () => {
  await db.tokens.clear();
  await db.characters.clear();
});

describe('GrantNote', () => {
  it("shows for the active Character when their grant lacks the endpoints' scope", async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} title={CONTEXT} />);

    expect(await screen.findByText(ACTIVE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(CONTEXT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant in EVE' })).toBeInTheDocument();
  });

  it('omits the context line when no title is given', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} />);

    expect(await screen.findByText(ACTIVE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(CONTEXT)).toBeNull();
  });

  it('renders nothing when the grant holds the scope', async () => {
    await seedGrant(ACTIVE_ID, [SCOPE]);
    render(
      <>
        <GrantNote endpoints={ENDPOINTS} title={CONTEXT} />
        <Control />
      </>
    );

    await settled();
    expect(screen.queryByText(ACTIVE_TITLE)).toBeNull();
  });

  it('treats a Character with no stored token as lacking the scope', async () => {
    render(<GrantNote endpoints={ENDPOINTS} title={CONTEXT} />);

    expect(await screen.findByText(ACTIVE_TITLE)).toBeInTheDocument();
  });

  it('disappears once the grant lands', async () => {
    await seedGrant(ACTIVE_ID, []);
    render(<GrantNote endpoints={ENDPOINTS} title={CONTEXT} />);
    expect(await screen.findByText(ACTIVE_TITLE)).toBeInTheDocument();

    await seedGrant(ACTIVE_ID, [SCOPE]);
    await waitFor(() => expect(screen.queryByText(ACTIVE_TITLE)).toBeNull());
  });

  it('holds back before the active Character has hydrated', async () => {
    useActiveCharacter.setState({ activeCharacterId: ACTIVE_ID, hydrated: false });
    await seedGrant(ACTIVE_ID, []);
    render(
      <>
        <GrantNote endpoints={ENDPOINTS} title={CONTEXT} />
        <Control />
      </>
    );

    await settled();
    expect(screen.queryByText(ACTIVE_TITLE)).toBeNull();
  });

  it("checks, names, and grants for the given Character's own grant, not the active one's", async () => {
    await seedGrant(ACTIVE_ID, [SCOPE]);
    await seedGrant(ALT_ID, []);
    render(
      <GrantNote endpoints={ENDPOINTS} characterId={ALT_ID} characterName="Alt" title={CONTEXT} />
    );

    expect(await screen.findByText('Alt: grant Character details')).toBeInTheDocument();
    expect(screen.getByText(CONTEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({
      characterId: ALT_ID,
      groups: ['characterDetails'],
    });
  });

  it("never shows the next Character using the previous one's answer", async () => {
    await seedCharacter(ALT_ID, 'Alt');
    await seedGrant(ACTIVE_ID, []);
    await seedGrant(ALT_ID, [SCOPE]);
    const { rerender } = render(
      <GrantNote endpoints={ENDPOINTS} characterId={ACTIVE_ID} title={CONTEXT} />
    );
    expect(await screen.findByText(ACTIVE_TITLE)).toBeInTheDocument();

    rerender(
      <>
        <GrantNote endpoints={ENDPOINTS} characterId={ALT_ID} title={CONTEXT} />
        <Control />
      </>
    );
    expect(screen.queryByText(ACTIVE_TITLE)).toBeNull();
    expect(screen.queryByText(/^Alt:/)).toBeNull();
    await settled();
    expect(screen.queryByText(ACTIVE_TITLE)).toBeNull();
    expect(screen.queryByText(/^Alt:/)).toBeNull();
  });
});

describe('GrantBanner', () => {
  it('names the Character and the missing Permission, and asks for exactly it for that Character', async () => {
    render(
      <GrantBanner
        characterId={ALT_ID}
        characterName="Alt"
        endpoints={['getCharacterMailHeaders']}
        title={CONTEXT}
      />
    );

    expect(await screen.findByText('Alt: grant Mail')).toBeInTheDocument();
    expect(screen.getByText(CONTEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: ALT_ID, groups: ['mail'] });
  });

  it('reads the Character name from the device when not given', async () => {
    await seedCharacter(ALT_ID, 'Stored Alt');
    render(<GrantBanner characterId={ALT_ID} endpoints={['getCharacterMailHeaders']} />);

    expect(await screen.findByText('Stored Alt: grant Mail')).toBeInTheDocument();
  });

  it('falls back to a generic name for a Character not on the device', async () => {
    render(<GrantBanner characterId={ALT_ID} endpoints={['getCharacterMailHeaders']} />);

    expect(await screen.findByText('This character: grant Mail')).toBeInTheDocument();
  });

  it('asks for no Permission for a Core Grant endpoint, only the re-login', async () => {
    render(
      <GrantBanner characterId={ALT_ID} characterName="Alt" endpoints={['getCharacterSkills']} />
    );

    expect(await screen.findByText('Alt: log in again')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(beginEveLogin).toHaveBeenCalledWith({ characterId: ALT_ID, groups: [] });
  });

  it('says log in again when the stored grant already holds every scope', async () => {
    await seedGrant(ALT_ID, [ESI_REGISTRY.getCharacterMailHeaders.scope]);
    render(
      <GrantBanner
        characterId={ALT_ID}
        characterName="Alt"
        endpoints={['getCharacterMailHeaders']}
      />
    );

    expect(await screen.findByText('Alt: log in again')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  it('collapses several banners for one Character into one that asks for all their Permissions', async () => {
    render(
      <>
        <GrantBanner
          characterId={ALT_ID}
          characterName="Alt"
          endpoints={['getCharacterMailHeaders']}
        />
        <GrantBanner characterId={ALT_ID} characterName="Alt" endpoints={ENDPOINTS} />
      </>
    );

    expect(await screen.findByText('Alt: grant Mail, Character details')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Grant in EVE' })).toHaveLength(1);
    expect(screen.queryByText('Alt: grant Mail')).toBeNull();
    expect(screen.getByText('Alt: covered by the login prompt on this page.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Grant in EVE' }));
    expect(beginEveLogin).toHaveBeenCalledWith({
      characterId: ALT_ID,
      groups: ['mail', 'characterDetails'],
    });
  });

  it('lets a full banner outrank a one-line note, and a standalone note never join', async () => {
    render(
      <>
        <GrantBanner
          compact
          characterId={ALT_ID}
          characterName="Alt"
          endpoints={['getCharacterMailHeaders']}
        />
        <GrantBanner characterId={ALT_ID} characterName="Alt" endpoints={ENDPOINTS} />
        <GrantBanner
          standalone
          characterId={ALT_ID}
          characterName="Alt"
          endpoints={['getCharacterMailHeaders']}
          title="Assumes no mail"
        />
      </>
    );

    expect(await screen.findByText('Alt: grant Mail, Character details')).toBeInTheDocument();
    expect(screen.getByText('Alt: covered by the login prompt on this page.')).toBeInTheDocument();
    expect(screen.getByText('Assumes no mail')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Grant in EVE' })).toHaveLength(2);
  });

  it("still shows another Character's banner beside them", async () => {
    render(
      <>
        <GrantBanner
          characterId={ALT_ID}
          characterName="Alt"
          endpoints={['getCharacterMailHeaders']}
        />
        <GrantBanner characterId={ALT_ID} characterName="Alt" endpoints={ENDPOINTS} />
        <GrantBanner characterId={CONTROL_ID} characterName="Control" endpoints={ENDPOINTS} />
      </>
    );

    expect(await screen.findByText('Alt: grant Mail, Character details')).toBeInTheDocument();
    expect(await screen.findByText('Control: grant Character details')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Grant in EVE' })).toHaveLength(2);
  });
});
