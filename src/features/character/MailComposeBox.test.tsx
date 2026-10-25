/**
 * The compose box's own behaviour, with the ESI send, draft store, contacts
 * and recipient search all mocked. `engine/mail.test.ts` owns the
 * reply-all/quoting/prefixing logic itself — what matters here is that this
 * component wires it up: which defaults populate, which chip is pinned,
 * what a Send click actually calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { EsiError, EsiOfflineError, EsiTimeoutError } from '@/esi/errors';
import { PlainBodyEditor } from './PlainBodyEditor.testHelper';
import { MailComposeBox } from './MailComposeBox';
import type { MailHeader } from '@/esi/endpoints';

const sendMail = vi.hoisted(() => vi.fn());
const loadMailingLists = vi.hoisted(() => vi.fn());
vi.mock('./mail', () => ({ sendMail, loadMailingLists }));
const lacks = vi.hoisted(() => ({ value: false }));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => lacks.value }));

const drafts = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}));
vi.mock('./mailDrafts', () => drafts);

const loadContacts = vi.hoisted(() => vi.fn());
vi.mock('./contacts', () => ({ loadContacts }));

const resolveNames = vi.hoisted(() => vi.fn());
vi.mock('./names', () => ({ resolveNames }));

const searchMailRecipients = vi.hoisted(() => vi.fn());
vi.mock('./mailRecipientSearch', () => ({
  searchTypedMailRecipients: searchMailRecipients,
  MIN_RECIPIENT_SEARCH_LENGTH: 3,
}));

const CHAR_ID = 91;
const HEADER: MailHeader = {
  mail_id: 7,
  from: 200,
  subject: 'Ratting fleet up',
  timestamp: '2026-09-21T03:14:00Z',
  recipients: [
    { recipient_id: CHAR_ID, recipient_type: 'character' },
    { recipient_id: 300, recipient_type: 'character' },
  ],
};

const resolveRecipientName = (r: { recipient_id: number }) =>
  r.recipient_id === 200 ? 'Sender Sal' : r.recipient_id === 300 ? 'CC Cara' : 'Unknown';

beforeEach(() => {
  vi.clearAllMocks();
  lacks.value = false;
  drafts.loadDraft.mockResolvedValue(undefined);
  drafts.saveDraft.mockResolvedValue('ok');
  drafts.clearDraft.mockResolvedValue(undefined);
  loadContacts.mockResolvedValue({ cached: { data: [] } });
  resolveNames.mockResolvedValue(new Map());
  searchMailRecipients.mockResolvedValue([]);
  loadMailingLists.mockResolvedValue({ cached: { data: [] } });
});

function goOffline() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

function renderBox(kind: 'reply' | 'forward', onSent = vi.fn(), onClose = vi.fn()) {
  return render(
    <MailComposeBox
      characterId={CHAR_ID}
      kind={kind}
      header={HEADER}
      bodyText="Original body text"
      bodyEditor={PlainBodyEditor}
      senderName="Sender Sal"
      formattedTimestamp="Sep 21, 2026 03:14"
      resolveRecipientName={resolveRecipientName}
      onClose={onClose}
      onSent={onSent}
    />
  );
}

describe('visible labels', () => {
  it('Reply: Subject and Message have visible <label>s, Subject has no placeholder', async () => {
    renderBox('reply');
    const subject = await screen.findByLabelText('Subject');
    expect(subject.id).not.toBe('');
    expect(document.querySelector(`label[for="${subject.id}"]`)).toBeVisible();
    expect(subject).not.toHaveAttribute('aria-label');
    expect(subject).not.toHaveAttribute('placeholder');
    const message = screen.getByLabelText('Message');
    expect(message).not.toHaveAttribute('aria-label');
    expect(document.querySelector(`label[for="${message.id}"]`)).toBeVisible();
  });

  it('names the recipients group by a visible "To" label', async () => {
    renderBox('reply');
    const group = await screen.findByRole('group', { name: 'To' });
    expect(group).not.toHaveAttribute('aria-label');
    expect(screen.getByText('To')).toBeVisible();
  });

  it('Forward: recipient search has a visible label and keeps its hint placeholder', async () => {
    renderBox('forward');
    const search = await screen.findByLabelText('Add recipient');
    expect(search).not.toHaveAttribute('aria-label');
    expect(document.querySelector(`label[for="${search.id}"]`)).toBeVisible();
    expect(search).toHaveAttribute('placeholder', 'Add a character, corporation, alliance or list');
  });
});

describe('focus (issue #1485)', () => {
  it('focuses the Subject field on mount for Reply', async () => {
    renderBox('reply');
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveFocus());
  });

  it('focuses the recipient search box on mount for Forward, without popping its picker open', async () => {
    renderBox('forward');
    const recipientSearch = screen.getByLabelText('Add recipient');
    await waitFor(() => expect(recipientSearch).toHaveFocus());
    expect(recipientSearch).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('Reply defaults', () => {
  it('reply-all: sender chip plus every other original recipient, sender not removable', async () => {
    renderBox('reply');

    await screen.findByText('Sender Sal');
    expect(screen.getByText('CC Cara')).toBeInTheDocument();
    // The reading character itself (id CHAR_ID) is excluded from reply-all.
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Remove Sender Sal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove CC Cara' })).toBeInTheDocument();
  });

  it('prefixes the subject and quotes the original body', async () => {
    renderBox('reply');
    await screen.findByText('Sender Sal');

    expect(screen.getByLabelText('Subject')).toHaveValue('RE: Ratting fleet up');
    expect(screen.getByLabelText('Message')).toHaveValue(
      '\n\nOn Sep 21, 2026 03:14, Sender Sal wrote:\n> Original body text'
    );
  });

  it('removing a CC recipient drops its chip', async () => {
    const user = userEvent.setup();
    renderBox('reply');
    await screen.findByText('CC Cara');

    await user.click(screen.getByRole('button', { name: 'Remove CC Cara' }));

    expect(screen.queryByText('CC Cara')).not.toBeInTheDocument();
    expect(screen.getByText('Sender Sal')).toBeInTheDocument();
  });
});

describe('send path', () => {
  it('sanitizes the body before sending, whatever the editor emitted', async () => {
    function Rogue({ onChange, id }: { onChange: (v: string) => void; id: string }) {
      return (
        <button id={id} aria-label="emit" onClick={() => onChange('<script>x</script><b>ok</b>')}>
          emit
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      <MailComposeBox
        characterId={CHAR_ID}
        kind="reply"
        header={HEADER}
        bodyText="Original body text"
        bodyEditor={Rogue as never}
        senderName="Sender Sal"
        formattedTimestamp="Sep 21, 2026 03:14"
        resolveRecipientName={resolveRecipientName}
        onClose={vi.fn()}
        onSent={vi.fn()}
      />
    );
    await user.click(await screen.findByRole('button', { name: 'emit' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendMail).toHaveBeenCalled());
    expect(sendMail.mock.calls[0][3]).toBe('x<b>ok</b>');
  });
});

describe('Forward defaults', () => {
  it('starts with no recipients and a FWD: subject', async () => {
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );
    expect(screen.queryByText('Sender Sal')).not.toBeInTheDocument();
  });

  it('adding a search result creates a removable chip', async () => {
    searchMailRecipients.mockResolvedValue([{ id: 500, type: 'character', name: 'Found Fenn' }]);
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );

    await user.type(screen.getByLabelText('Add recipient'), 'Fen');
    const option = await screen.findByRole('option', { name: /Found Fenn/ });
    await user.click(option);

    expect(screen.getByText('Found Fenn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Found Fenn' })).toBeInTheDocument();
  });
});

describe('recipient search offline', () => {
  it('says the search needs a connection instead of "no results"', async () => {
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );
    goOffline();

    await user.type(screen.getByLabelText('Add recipient'), 'Fen');

    expect(await screen.findByText('Search needs a connection.')).toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });
});

describe('recipient search that fails while the browser says it is online', () => {
  it('says the search needs a connection instead of "No characters found"', async () => {
    searchMailRecipients.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );

    await user.type(screen.getByLabelText('Add recipient'), 'Fen');

    expect(await screen.findByText('Search needs a connection.')).toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });
});

describe('recipient search that ESI refuses', () => {
  it('says the search failed, not that it needs a connection, on an HTTP error', async () => {
    searchMailRecipients.mockRejectedValue(new EsiError(500, 'boom'));
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );

    await user.type(screen.getByLabelText('Add recipient'), 'Fen');

    expect(await screen.findByText('Search failed. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('Search needs a connection.')).not.toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });
});

describe('a saved draft', () => {
  it('is used instead of the reply-all defaults', async () => {
    drafts.loadDraft.mockResolvedValue({
      id: `${CHAR_ID}:7`,
      characterId: CHAR_ID,
      mailId: 7,
      kind: 'reply',
      recipients: [{ recipient_id: 300, recipient_type: 'character' }],
      subject: 'Already edited subject',
      body: 'Already typed reply',
      updatedAt: 1,
    });

    renderBox('reply');

    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('Already edited subject')
    );
    expect(screen.getByLabelText('Message')).toHaveValue('Already typed reply');
    expect(screen.queryByText('Sender Sal')).not.toBeInTheDocument();
    expect(screen.getByText('CC Cara')).toBeInTheDocument();
  });

  it('never clobbers a subject the pilot already typed while loadDraft was still resolving', async () => {
    let resolveLoad: (value: undefined) => void = () => {};
    drafts.loadDraft.mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)));
    const user = userEvent.setup();
    renderBox('reply');

    // Reply-all defaults haven't landed yet — loadDraft is still pending.
    expect(screen.getByLabelText('Subject')).toHaveValue('');
    await user.type(screen.getByLabelText('Subject'), 'My own subject');

    resolveLoad(undefined);
    await waitFor(() => expect(drafts.saveDraft).toHaveBeenCalled());

    expect(screen.getByLabelText('Subject')).toHaveValue('My own subject');
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });
});

describe('sending', () => {
  it('sends the current recipients/subject/body, clears the draft, and calls onSent', async () => {
    sendMail.mockResolvedValue(123456);
    const onSent = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', onSent);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
    expect(sendMail).toHaveBeenCalledWith(
      CHAR_ID,
      [
        { recipient_id: 200, recipient_type: 'character' },
        { recipient_id: 300, recipient_type: 'character' },
      ],
      'RE: Ratting fleet up',
      '\n\nOn Sep 21, 2026 03:14, Sender Sal wrote:\n&gt; Original body text'
    );
    expect(drafts.clearDraft).toHaveBeenCalledWith(CHAR_ID, 7);
    expect(onSent).toHaveBeenCalled();
  });

  it('shows only ESI’s own error message on a rejected send, and does not clear the draft', async () => {
    sendMail.mockRejectedValue(new Error('Contact 200 requires 1000000.0 ISK'));
    const onSent = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', onSent);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(
        "Couldn't send: Contact 200 requires 1000000.0 ISK Try sending from the EVE client instead."
      )
    ).toBeInTheDocument();
    expect(drafts.clearDraft).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says it is offline, and that the draft is saved, when the send was refused before leaving', async () => {
    sendMail.mockRejectedValue(new EsiOfflineError());
    const onSent = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', onSent);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(
        "You're offline — your draft is saved. Send it when you're back online."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(drafts.clearDraft).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('does not invite a duplicate when a send timed out after leaving: it could not confirm', async () => {
    sendMail.mockRejectedValue(new EsiTimeoutError(15_000, true));
    const user = userEvent.setup();
    renderBox('reply');
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/couldn't confirm the mail was sent/i)).toBeInTheDocument();
    expect(screen.getByText(/check your sent folder/i)).toBeInTheDocument();
    expect(screen.queryByText(/draft is saved/i)).not.toBeInTheDocument();
  });

  it.each([
    ['a fetch TypeError', new TypeError('Failed to fetch')],
    ['a raw TimeoutError', new DOMException('timed out', 'TimeoutError')],
  ])('cannot confirm the send after %s while online, and keeps the draft', async (_name, err) => {
    sendMail.mockRejectedValue(err);
    const onSent = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', onSent);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/couldn't confirm the mail was sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/draft is saved/i)).not.toBeInTheDocument();
    expect(drafts.clearDraft).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('does not read a failure after the send as offline, and still finishes', async () => {
    sendMail.mockResolvedValue(1);
    drafts.clearDraft.mockRejectedValue(new TypeError('IndexedDB closed'));
    const onSent = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', onSent);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it('disables Send while offline, with the reason in a tooltip, and sends nothing', async () => {
    const user = userEvent.setup();
    renderBox('reply');
    await screen.findByText('Sender Sal');
    goOffline();

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    fireEvent.pointerMove(send);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs a connection');
    await user.click(send);
    expect(sendMail).not.toHaveBeenCalled();
    expect(screen.getByText('Your draft is saved.')).toBeInTheDocument();
    // Local actions are untouched: the draft fields still take input.
    expect(screen.getByLabelText('Subject')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('lays out Cancel left and Send right in one footer row', async () => {
    renderBox('reply');
    await screen.findByText('Sender Sal');
    const footer = screen.getByRole('button', { name: 'Send' }).closest('footer')!;
    const cancel = within(footer).getByRole('button', { name: 'Cancel' });
    const send = within(footer).getByRole('button', { name: 'Send' });
    expect(cancel.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('refuses to send with no recipients', async () => {
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );

    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('Add at least one recipient before sending.')
    ).toBeInTheDocument();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('send-mail Permission', () => {
  it('offers the grant note when the stored grant lacks it, and still lets Send work', async () => {
    lacks.value = true;
    renderBox('reply');
    expect(await screen.findByText('Permission to send mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grant send mail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('shows no grant note when the Permission is held', async () => {
    renderBox('reply');
    await screen.findByLabelText('Subject');
    expect(screen.queryByText('Permission to send mail')).not.toBeInTheDocument();
  });
});

describe('Cancel', () => {
  it('calls onClose without sending', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderBox('reply', vi.fn(), onClose);
    await screen.findByText('Sender Sal');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});
