import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { MemberSrpView } from './MemberSrpView';

vi.mock('./MemberSrp', () => ({ MemberSrp: () => <p>member filing</p> }));

const CHARACTER_ID = 42;
const NPC_CORPORATION = 1000125;
const PLAYER_CORPORATION = 98000001;

beforeEach(async () => {
  await db.characters.clear();
  usePublicInfo.setState({ byCharacterId: {} });
  useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });
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

describe('MemberSrpView', () => {
  it('tells an NPC-corp pilot SRP is a player-corporation thing, with no director to ask', async () => {
    await seedCorporation(NPC_CORPORATION, 'State War Academy');
    render(<MemberSrpView />);
    expect(
      await screen.findByText('No ship replacement (SRP) in an NPC corporation')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'State War Academy is an NPC corporation. Ship replacement (SRP) is run by player corporations to pay back ships lost on corp operations.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/director/i)).not.toBeInTheDocument();
    expect(screen.queryByText('member filing')).not.toBeInTheDocument();
  });

  it('falls back to a nameless NPC line before public info loads', async () => {
    await seedCorporation(NPC_CORPORATION);
    render(<MemberSrpView />);
    expect(await screen.findByText(/^You're in an NPC corporation\./)).toBeInTheDocument();
  });

  it('hands a player-corp pilot to the filing view', async () => {
    await seedCorporation(PLAYER_CORPORATION, 'Ashfall Prospecting');
    render(<MemberSrpView />);
    expect(await screen.findByText('member filing')).toBeInTheDocument();
  });
});
