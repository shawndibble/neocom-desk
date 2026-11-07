import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { beginEveLogin } from '@/app/loginFlow';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { CorpDenied } from './CorpDenied';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

const mockedBeginLogin = vi.mocked(beginEveLogin);
const CHARACTER_ID = 42;
const NPC_CORPORATION = 1000125;
const PLAYER_CORPORATION = 98000001;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.characters.clear();
  usePublicInfo.setState({ byCharacterId: {} });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID });
});

async function seedCorporation(corporationId: number, corporationName?: string) {
  await db.characters.put({
    characterId: CHARACTER_ID,
    name: 'Pilot',
    ownerHash: 'hash',
    addedAt: 0,
    corporationId,
  });
  if (corporationName !== undefined) {
    usePublicInfo.setState({
      byCharacterId: { [CHARACTER_ID]: { corporationName, allianceName: null } },
    });
  }
}

function renderDenied(reason: Parameters<typeof CorpDenied>[0]['reason']) {
  render(
    <CorpDenied
      reason={reason}
      title="Route title"
      hint="Route hint"
      roleLine="Member tracking needs Director."
    />
  );
}

describe('CorpDenied', () => {
  it.each(['not-granted', 'roles-without-grant'] as const)(
    "offers the corp Grant under the route's role line when the reason is %s",
    async (reason) => {
      await seedCorporation(PLAYER_CORPORATION);
      renderDenied(reason);
      expect(screen.getByText('Corp officer pages')).toBeInTheDocument();
      expect(
        screen.getByText(/^Member tracking needs Director\. If that's you/)
      ).toBeInTheDocument();
      expect(screen.queryByText('Route hint')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /grant corporation access/i }));
      expect(mockedBeginLogin).toHaveBeenCalledWith({
        characterId: CHARACTER_ID,
        groups: ['corp'],
      });
    }
  );

  it('keeps the Grant when the corporation is not known yet', () => {
    renderDenied('not-granted');
    expect(screen.getByRole('button', { name: /grant corporation access/i })).toBeInTheDocument();
  });

  it.each(['none', 'capability'] as const)(
    "keeps the route's own copy, with no Grant, when the reason is %s",
    (reason) => {
      renderDenied(reason);
      expect(screen.getByText('Route hint')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );

  it.each(['not-granted', 'roles-without-grant', 'none', 'capability'] as const)(
    'names the NPC corporation, with no Grant, when the reason is %s',
    async (reason) => {
      await seedCorporation(NPC_CORPORATION, 'State War Academy');
      renderDenied(reason);
      expect(
        await screen.findByText(/^You're in State War Academy, an NPC corporation\./)
      ).toBeInTheDocument();
      expect(screen.getByText('Corp officer pages')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
  );

  it('still explains an NPC corporation whose name is not loaded', async () => {
    await seedCorporation(NPC_CORPORATION);
    renderDenied('not-granted');
    expect(await screen.findByText(/^You're in an NPC corporation\./)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
