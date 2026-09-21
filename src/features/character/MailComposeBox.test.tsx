/**
 * The compose box's own behaviour, with the ESI send, draft store, contacts
 * and recipient search all mocked. `engine/mail.test.ts` owns the
 * reply-all/quoting/prefixing logic itself — what matters here is that this
 * component wires it up: which defaults populate, which chip is pinned,
 * what a Send click actually calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { MailComposeBox } from './MailComposeBox';
import type { MailHeader } from '@/esi/endpoints';

const sendMail = vi.hoisted(() => vi.fn());
vi.mock('./mail', () => ({ sendMail }));

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
  searchMailRecipients,
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
  drafts.loadDraft.mockResolvedValue(undefined);
  drafts.saveDraft.mockResolvedValue('ok');
  drafts.clearDraft.mockResolvedValue(undefined);
  loadContacts.mockResolvedValue({ cached: { data: [] } });
  resolveNames.mockResolvedValue(new Map());
  searchMailRecipients.mockResolvedValue([]);
});

function renderBox(kind: 'reply' | 'forward', onSent = vi.fn(), onClose = vi.fn()) {
  return render(
    <MailComposeBox
      characterId={CHAR_ID}
      kind={kind}
      header={HEADER}
      bodyText="Original body text"
      senderName="Sender Sal"
      formattedTimestamp="Sep 21, 2026 03:14"
      resolveRecipientName={resolveRecipientName}
      onClose={onClose}
      onSent={onSent}
    />
  );
}

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

describe('Forward defaults', () => {
  it('starts with no recipients and a FWD: subject', async () => {
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );
    expect(screen.queryByText('Sender Sal')).not.toBeInTheDocument();
  });

  it('adding a search result creates a removable chip', async () => {
    searchMailRecipients.mockResolvedValue([{ characterId: 500, name: 'Found Fenn' }]);
    const user = userEvent.setup();
    renderBox('forward');
    await waitFor(() =>
      expect(screen.getByLabelText('Subject')).toHaveValue('FWD: Ratting fleet up')
    );

    await user.type(screen.getByLabelText('Add recipient'), 'Fen');
    const option = await screen.findByRole('option', { name: 'Found Fenn' });
    await user.click(option);

    expect(screen.getByText('Found Fenn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Found Fenn' })).toBeInTheDocument();
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
      '\n\nOn Sep 21, 2026 03:14, Sender Sal wrote:\n> Original body text'
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
      await screen.findByText("Couldn't send: Contact 200 requires 1000000.0 ISK")
    ).toBeInTheDocument();
    expect(drafts.clearDraft).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
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
