import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { AskToCopyOffer } from '@/engine/communities/askToCopy';
import { uidForCharacter } from '@/sync/uid';
import { AskToCopyDialog } from './AskToCopyDialog';

const world = vi.hoisted(() => ({ members: vi.fn(), compose: vi.fn() }));
vi.mock('./communityStore', () => ({ loadCommunityMembers: world.members }));
vi.mock('./ComposeRequestDialog', () => ({
  ComposeRequestDialog: (props: unknown) => {
    world.compose(props);
    return <div>compose dialog</div>;
  },
}));

const offer = (communities: AskToCopyOffer['communities']): AskToCopyOffer => ({
  source: 'community',
  typeId: 33078,
  runs: -1,
  memberUid: 'u-ann',
  communities,
});
const ROSTER = [{ uid: 'u-ann', characterName: 'Ann', joinedAt: 1, libraryAsOf: 1 }];

function renderDialog(o: AskToCopyOffer) {
  render(
    <AskToCopyDialog
      characterId={90000001}
      offer={o}
      blueprintName="Rifter Blueprint"
      holderName="Ann"
      onClose={() => undefined}
    />
  );
}

describe('AskToCopyDialog', () => {
  beforeEach(() => {
    world.members.mockReset().mockResolvedValue(ROSTER);
    world.compose.mockReset();
  });

  it('opens compose in the one Community with the line and the holder filled', async () => {
    renderDialog(offer([{ id: 'c1', name: 'Alpha' }]));
    expect(await screen.findByText('compose dialog')).toBeInTheDocument();
    expect(world.members).toHaveBeenCalledWith(90000001, 'c1');
    expect(world.compose).toHaveBeenLastCalledWith(
      expect.objectContaining({
        communityId: 'c1',
        myUid: uidForCharacter(90000001),
        members: ROSTER,
        prefill: {
          lines: [{ typeId: 33078, name: 'Rifter Blueprint', quantity: 1, kind: 'bpc' }],
          tickedUids: ['u-ann'],
        },
      })
    );
  });

  it('asks which Community when the holder shares it in several, and posts to that one', async () => {
    const user = userEvent.setup();
    renderDialog(
      offer([
        { id: 'c1', name: 'Alpha' },
        { id: 'c2', name: 'Zed' },
      ])
    );
    expect(world.members).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Community'), 'c2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('compose dialog')).toBeInTheDocument();
    expect(world.members).toHaveBeenCalledWith(90000001, 'c2');
    expect(world.compose).toHaveBeenLastCalledWith(expect.objectContaining({ communityId: 'c2' }));
  });

  it('says so, and opens no compose, when the roster cannot be read', async () => {
    world.members.mockRejectedValue(new Error('offline'));
    renderDialog(offer([{ id: 'c1', name: 'Alpha' }]));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('compose dialog')).not.toBeInTheDocument();
  });
});
