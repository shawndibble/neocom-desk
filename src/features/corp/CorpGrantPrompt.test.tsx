import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { StatusResult } from '@/esi/cache';
import type { CharacterCorporationRoles } from '@/esi/endpoints';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { beginEveLogin } from '@/app/loginFlow';
import { scopesForGroup } from '@/esi/scopes';
import { loadCharacterRoles } from './roles';
import { NO_DISMISSALS, useGrantPromptDismissals } from './grantPromptDismissal';
import { CorpGrantPrompt } from './CorpGrantPrompt';

vi.mock('./roles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./roles')>()),
  loadCharacterRoles: vi.fn(),
}));
vi.mock('@/app/useGrantedScopes', () => ({ useGrantedScopes: vi.fn() }));
vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const mockedLoadRoles = vi.mocked(loadCharacterRoles);
const mockedGrantedScopes = vi.mocked(useGrantedScopes);
const mockedBeginLogin = vi.mocked(beginEveLogin);

const CHARACTER_ID = 42;
const OTHER_CHARACTER_ID = 77;
const ALL_CORP_SCOPES = [...scopesForGroup('corp')];

function rolesResolvingTo(roles: readonly string[]): StatusResult<CharacterCorporationRoles> {
  return {
    cached: {
      data: { roles: [...roles] },
      fetchedAt: new Date(0),
      fromCache: false,
      truncated: false,
    },
    needsReauth: false,
  };
}

const prompt = () => screen.queryByRole('alert', { name: /corporation access/i });

beforeEach(async () => {
  vi.clearAllMocks();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
  useGrantPromptDismissals.setState({ value: NO_DISMISSALS, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  mockedGrantedScopes.mockReturnValue([]);
  mockedLoadRoles.mockResolvedValue(rolesResolvingTo(['Director']));
});

describe('CorpGrantPrompt — when it appears', () => {
  it('offers the grant once the Character has roles but no corp scopes', async () => {
    usePublicInfo.setState({
      byCharacterId: { [CHARACTER_ID]: { corporationName: 'Test Corp', allianceName: null } },
    });
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    expect(screen.getByText(/Director/)).toBeInTheDocument();
    expect(screen.getByText(/Test Corp/)).toBeInTheDocument();
  });

  it('names the corporation generically when nothing has loaded its name yet', async () => {
    // The name is borrowed from whatever already fetched it; this banner must
    // never fire an ESI read of its own to fill in a nicety.
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    expect(screen.getByText(/your corporation/i)).toBeInTheDocument();
  });

  it('stays away while the state is still unknown', () => {
    mockedLoadRoles.mockReturnValue(new Promise(() => {}));
    render(<CorpGrantPrompt />);
    expect(prompt()).not.toBeInTheDocument();
  });

  it('stays away for a Character with no corp role', async () => {
    mockedLoadRoles.mockResolvedValue(rolesResolvingTo([]));
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(mockedLoadRoles).toHaveBeenCalled());
    expect(prompt()).not.toBeInTheDocument();
  });

  it('stays away once the grant is already in place', async () => {
    mockedGrantedScopes.mockReturnValue(ALL_CORP_SCOPES);
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(mockedLoadRoles).toHaveBeenCalled());
    expect(prompt()).not.toBeInTheDocument();
  });
});

/**
 * AC 5, and the reason this component exists at all rather than a nag: at most
 * once per Character per device. A prompt that keeps coming back is the same
 * consent bloat the ticket exists to prevent, wearing a different hat.
 */
describe('CorpGrantPrompt — asked at most once', () => {
  it('is gone for good after Not now, and persists that across a remount', async () => {
    const { unmount } = render(<CorpGrantPrompt />);
    await waitFor(() => expect(prompt()).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /not now/i }));
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());

    unmount();
    useGrantPromptDismissals.setState({ value: NO_DISMISSALS, hydrated: false });
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(useGrantPromptDismissals.getState().hydrated).toBe(true));
    expect(prompt()).not.toBeInTheDocument();
  });

  it('does not re-ask after Grant either — a cancelled SSO trip is not a new occasion', async () => {
    render(<CorpGrantPrompt />);
    await waitFor(() => expect(prompt()).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /grant access/i }));

    expect(mockedBeginLogin).toHaveBeenCalledWith({
      characterId: CHARACTER_ID,
      groups: ['corp'],
    });
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
  });

  it('still offers it to an ALT that later makes Director (AC 3, AC 5)', async () => {
    const { unmount } = render(<CorpGrantPrompt />);
    await waitFor(() => expect(prompt()).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /not now/i }));
    unmount();

    useActiveCharacter.setState({ activeCharacterId: OTHER_CHARACTER_ID, hydrated: true });
    render(<CorpGrantPrompt />);

    await waitFor(() => expect(prompt()).toBeInTheDocument());
  });
});
