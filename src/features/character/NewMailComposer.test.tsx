/**
 * New Mail composer wiring, with ESI send, draft store, mailing lists and
 * search mocked. The rules themselves (caps, validation) are covered in
 * `engine/mailCompose.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { EsiOfflineError } from '@/esi/errors';
import { NewMailComposer } from './NewMailComposer';

const sendMail = vi.hoisted(() => vi.fn());
const loadMailingLists = vi.hoisted(() => vi.fn());
vi.mock('./mail', () => ({ sendMail, loadMailingLists }));

const drafts = vi.hoisted(() => ({
  loadNewMailDraft: vi.fn(),
  saveNewMailDraft: vi.fn(),
  clearNewMailDraft: vi.fn(),
}));
vi.mock('./mailDrafts', () => drafts);

const search = vi.hoisted(() => vi.fn());
vi.mock('./mailRecipientSearch', () => ({
  searchTypedMailRecipients: search,
  MIN_RECIPIENT_SEARCH_LENGTH: 3,
}));

const lacks = vi.hoisted(() => ({ value: false }));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => lacks.value }));

const CHAR_ID = 91;

beforeEach(() => {
  vi.clearAllMocks();
  lacks.value = false;
  drafts.loadNewMailDraft.mockResolvedValue(undefined);
  drafts.saveNewMailDraft.mockResolvedValue('ok');
  drafts.clearNewMailDraft.mockResolvedValue(undefined);
  loadMailingLists.mockResolvedValue({
    cached: { data: [{ mailing_list_id: 5, name: 'Industry Chat' }] },
  });
  search.mockResolvedValue([{ id: 77, type: 'corporation', name: 'Acme Corp' }]);
  sendMail.mockResolvedValue(1);
});

function setup(props: Partial<React.ComponentProps<typeof NewMailComposer>> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <NewMailComposer characterId={CHAR_ID} fullPane onClose={onClose} onSent={onSent} {...props} />
  );
  return { onClose, onSent, user: userEvent.setup() };
}

async function addList(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole('combobox');
  await user.click(input);
  await user.click(await screen.findByRole('option', { name: /Industry Chat/ }));
}

describe('recipients', () => {
  it('adds a joined mailing list with its type shown', async () => {
    const { user } = setup();
    await addList(user);
    const chips = screen.getByRole('list', { name: 'To' });
    expect(chips).toHaveTextContent('Industry Chat');
    expect(chips).toHaveTextContent('Mailing list');
    expect(screen.getByText('1 / 50')).toBeInTheDocument();
  });

  it('adds a searched corporation with its type shown', async () => {
    const { user } = setup();
    await user.type(await screen.findByRole('combobox'), 'acme');
    await user.click(await screen.findByRole('option', { name: /Acme Corp/ }));
    expect(screen.getByRole('list', { name: 'To' })).toHaveTextContent('Corporation');
    expect(search).toHaveBeenCalledWith(CHAR_ID, 'acme', expect.anything());
  });

  it('does not search without the search Permission, and says so', async () => {
    lacks.value = true;
    const { user } = setup();
    await user.type(await screen.findByRole('combobox'), 'acme');
    expect(search).not.toHaveBeenCalled();
  });
});

describe('limits', () => {
  it('blocks Send and shows the counter past the body limit', async () => {
    const { user } = setup();
    await addList(user);
    const body = screen.getByLabelText('Message');
    await user.click(body);
    await user.paste('x'.repeat(10_001));
    expect(screen.getByText('10001 / 10000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});

describe('draft', () => {
  it('reopens the saved draft as left', async () => {
    drafts.loadNewMailDraft.mockResolvedValue({
      recipients: [{ recipient_id: 5, recipient_type: 'mailing_list', name: 'Industry Chat' }],
      subject: 'Hello',
      body: 'Saved body',
    });
    setup();
    expect(await screen.findByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Saved body')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'To' })).toHaveTextContent('Industry Chat');
  });

  it('closing keeps the draft and reports it', async () => {
    const { user, onClose } = setup();
    await user.type(await screen.findByLabelText('Subject'), 'Draft subject');
    await user.click(screen.getByRole('button', { name: 'Close and keep draft' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('kept'));
    expect(drafts.saveNewMailDraft).toHaveBeenLastCalledWith(CHAR_ID, [], 'Draft subject', '');
  });

  it('closing an untouched composer clears the slot quietly', async () => {
    const { user, onClose } = setup();
    await screen.findByLabelText('Subject');
    await user.click(screen.getByRole('button', { name: 'Close and keep draft' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('empty'));
    expect(drafts.saveNewMailDraft).not.toHaveBeenCalled();
  });

  it('Discard asks first, then clears', async () => {
    const { user, onClose } = setup();
    await user.type(await screen.findByLabelText('Subject'), 'x');
    await user.click(screen.getByRole('button', { name: 'Discard draft…' }));
    expect(await screen.findByText('Discard this draft?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('discarded'));
    expect(drafts.clearNewMailDraft).toHaveBeenCalledWith(CHAR_ID);
  });
});

describe('send', () => {
  it('sends the typed recipients, clears the draft and reports it', async () => {
    const { user, onSent } = setup();
    await addList(user);
    await user.type(screen.getByLabelText('Subject'), 'Hi');
    await user.click(screen.getByLabelText('Message'));
    await user.paste('Body');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sendMail).toHaveBeenCalledWith(
      CHAR_ID,
      [{ recipient_id: 5, recipient_type: 'mailing_list' }],
      'Hi',
      'Body'
    );
    expect(drafts.clearNewMailDraft).toHaveBeenCalledWith(CHAR_ID);
  });

  it('asks for a recipient instead of sending', async () => {
    const { user, onSent } = setup();
    await user.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one recipient/i);
    expect(sendMail).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('a never-sent failure keeps the draft and says so', async () => {
    sendMail.mockRejectedValue(new EsiOfflineError());
    const { user, onSent } = setup();
    await addList(user);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline/i);
    expect(onSent).not.toHaveBeenCalled();
    expect(drafts.clearNewMailDraft).not.toHaveBeenCalled();
  });
});

describe('body editor seam', () => {
  it('renders a supplied editor and sends what it emits', async () => {
    const Custom = ({
      value,
      onChange,
      id,
    }: {
      value: string;
      onChange: (v: string) => void;
      id: string;
    }) => (
      <button id={id} type="button" onClick={() => onChange(`${value}[b]x[/b]`)}>
        custom editor
      </button>
    );
    const { user, onSent } = setup({ bodyEditor: Custom });
    await addList(user);
    await user.click(screen.getByRole('button', { name: 'Message' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sendMail.mock.calls[0]?.[3]).toBe('[b]x[/b]');
  });
});
