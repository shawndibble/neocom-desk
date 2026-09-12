import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { MailRowContextMenu } from './MailRowContextMenu';

const MAIL_ID = 481123;
const SENDER_ID = 90000001;

const writeSpy = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());

// No default: passing `undefined` explicitly must stay `undefined`, which a
// default parameter would silently replace with SENDER_ID.
function renderMenu(senderId: number | undefined) {
  const onRowClick = vi.fn();
  const view = render(
    <MailRowContextMenu mailId={MAIL_ID} senderId={senderId}>
      <button type="button" onClick={onRowClick}>
        Re: Fleet tonight
      </button>
    </MailRowContextMenu>
  );
  return { ...view, onRowClick };
}

beforeEach(() => {
  writeSpy.mockClear();
  configureClipboard(writeSpy);
  usePublicInfoModalStore.setState({ request: null });
});

afterEach(() => {
  configureClipboard(null);
});

describe('MailRowContextMenu (#889)', () => {
  it('opens the Public Info Modal for the sender, without opening the mail first', async () => {
    renderMenu(SENDER_ID);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Re: Fleet tonight' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'View sender' }));

    expect(usePublicInfoModalStore.getState().request).toEqual({
      kind: 'character',
      id: SENDER_ID,
    });
  });

  it('copies the mail id', async () => {
    renderMenu(SENDER_ID);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Re: Fleet tonight' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy mail ID' }));

    expect(writeSpy).toHaveBeenCalledWith(String(MAIL_ID));
  });

  it('disables View sender — rather than dropping it — when the header carries no sender', async () => {
    // Menu shape stays constant across rows, matching ContactContextMenu's
    // `disabled` treatment of a faction contact.
    renderMenu(undefined);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Re: Fleet tonight' }));

    expect(await screen.findByRole('menuitem', { name: 'View sender' })).toHaveAttribute(
      'data-disabled'
    );
    expect(usePublicInfoModalStore.getState().request).toBeNull();
  });

  it("leaves the row's own click-to-open behaviour intact", async () => {
    // `asChild` composition is exactly what a wrapper like this breaks, so the
    // row's own handler is asserted here rather than assumed.
    const user = userEvent.setup();
    const { onRowClick } = renderMenu(SENDER_ID);
    const row = screen.getByRole('button', { name: 'Re: Fleet tonight' });

    await user.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(row);
    expect(await screen.findByRole('menuitem', { name: 'View sender' })).toBeInTheDocument();
  });
});
