import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { AskToCopyOffer } from '@/engine/communities/askToCopy';
import { AskToCopyDialog } from './AskToCopyDialog';

const world = vi.hoisted(() => ({ compose: vi.fn() }));
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
    world.compose.mockReset();
  });

  it('opens compose in the one Community with the one blueprint line filled', async () => {
    renderDialog(offer([{ id: 'c1', name: 'Alpha' }]));
    expect(await screen.findByText('compose dialog')).toBeInTheDocument();
    expect(world.compose).toHaveBeenLastCalledWith(
      expect.objectContaining({
        communityId: 'c1',
        prefill: {
          lines: [{ typeId: 33078, name: 'Rifter Blueprint', quantity: 1, kind: 'bpc' }],
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
    expect(world.compose).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Community'), 'c2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('compose dialog')).toBeInTheDocument();
    expect(world.compose).toHaveBeenLastCalledWith(expect.objectContaining({ communityId: 'c2' }));
  });
});
