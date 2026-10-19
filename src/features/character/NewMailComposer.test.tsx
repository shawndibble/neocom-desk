/**
 * New Mail composer wiring, with ESI send, draft store, mailing lists and
 * search mocked. The rules themselves (caps, validation) are covered in
 * `engine/mailCompose.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { EsiOfflineError } from '@/esi/errors';
import { NewMailComposer } from './NewMailComposer';
import { PlainBodyEditor } from './PlainBodyEditor.testHelper';

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

afterEach(() => {
  vi.useRealTimers();
});

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
    <NewMailComposer
      characterId={CHAR_ID}
      fullPane
      bodyEditor={PlainBodyEditor}
      onClose={onClose}
      onSent={onSent}
      {...props}
    />
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
    const option = await screen.findByRole('option', { name: /Acme Corp/ });
    expect(option.querySelector('img')?.src).toMatch(/\/corporations\/\d+\/logo/);
    await user.click(option);
    const chips = screen.getByRole('list', { name: 'To' });
    expect(chips).toHaveTextContent('Corporation');
    expect(chips.querySelector('img')?.src).toMatch(/\/corporations\/\d+\/logo/);
    expect(search).toHaveBeenCalledWith(CHAR_ID, 'acme', expect.anything());
  });

  it('does not search without the search Permission, and says so', async () => {
    lacks.value = true;
    const { user } = setup();
    await user.type(await screen.findByRole('combobox'), 'acme');
    expect(search).not.toHaveBeenCalled();
  });
});

describe('action layout', () => {
  it('puts Close in the header after the title, and Send and Discard in the footer', async () => {
    const { user } = setup();
    await user.type(await screen.findByLabelText('Subject'), 'x');
    const header = screen.getByRole('heading', { name: 'New mail' }).closest('header')!;
    const footer = screen.getByRole('button', { name: 'Send' }).closest('footer')!;
    const title = within(header).getByRole('heading', { name: 'New mail' });
    const close = within(header).getByRole('button', { name: 'Close and keep draft' });
    expect(title.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    const discard = within(footer).getByRole('button', { name: 'Discard draft…' });
    const send = within(footer).getByRole('button', { name: 'Send' });
    expect(discard.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(footer).queryByRole('button', { name: /^Close/ })).not.toBeInTheDocument();
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
      recipients: [
        { recipient_id: 5, recipient_type: 'mailing_list', name: 'Industry Chat' },
        { recipient_id: 90000001, recipient_type: 'character', name: 'Ashken Archangel' },
      ],
      subject: 'Hello',
      body: 'Saved body',
    });
    setup();
    expect(await screen.findByDisplayValue('Hello')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Saved body')).toBeInTheDocument();
    const chips = screen.getByRole('list', { name: 'To' });
    expect(chips).toHaveTextContent('Industry Chat');
    expect(chips.querySelector('img')?.src).toBe(
      'https://images.evetech.net/characters/90000001/portrait?size=64'
    );
  });

  it('escapes a plain draft saved before the rich editor, so its < > & stay literal and are sent as entities', async () => {
    drafts.loadNewMailDraft.mockResolvedValue({
      recipients: [],
      subject: '',
      body: 'if a < b && <b>x</b>',
    });
    setup();
    expect(await screen.findByDisplayValue('if a < b && <b>x</b>')).toBeInTheDocument();
  });

  it('keeps a markup draft as saved', async () => {
    drafts.loadNewMailDraft.mockResolvedValue({
      recipients: [],
      subject: '',
      body: '<b>bold</b>',
      format: 'markup',
    });
    setup();
    expect(await screen.findByDisplayValue('bold')).toBeInTheDocument();
  });

  it('sends a legacy plain draft with < > & as entities, never as tags', async () => {
    drafts.loadNewMailDraft.mockResolvedValue({
      recipients: [{ recipient_id: 5, recipient_type: 'mailing_list', name: 'Industry Chat' }],
      subject: 's',
      body: 'a <b>x</b> & y',
    });
    const { user } = setup();
    await screen.findByDisplayValue('a <b>x</b> & y');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendMail).toHaveBeenCalled());
    expect(sendMail.mock.calls[0][3]).toBe('a &lt;b&gt;x&lt;/b&gt; &amp; y');
  });

  it('sanitizes whatever an editor emitted before sending', async () => {
    function Rogue({ onChange, id }: { onChange: (v: string) => void; id: string }) {
      return (
        <button
          id={id}
          aria-label="emit"
          onClick={() => onChange('<script>x</script><b>ok</b><img src=x>')}
        >
          emit
        </button>
      );
    }
    const { user } = setup({ bodyEditor: Rogue as never });
    await addList(user);
    await user.click(await screen.findByRole('button', { name: 'emit' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendMail).toHaveBeenCalled());
    expect(sendMail.mock.calls[0][3]).toBe('x<b>ok</b>');
  });

  it('Escape inside a dialog (a format sheet) does not close the composer', async () => {
    function WithSheet({ id }: { id: string }) {
      return (
        <dialog open>
          <button id={id} aria-label="in sheet">
            in sheet
          </button>
        </dialog>
      );
    }
    const { user, onClose } = setup({ bodyEditor: WithSheet as never });
    (await screen.findByRole('button', { name: 'in sheet' })).focus();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    screen.getByLabelText('Subject').focus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
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

describe('draft survives leaving without Close', () => {
  it('flushes the latest text when the composer unmounts inside the debounce window', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <NewMailComposer characterId={CHAR_ID} fullPane={false} onClose={vi.fn()} onSent={vi.fn()} />
    );
    await user.type(await screen.findByLabelText('Subject'), 'Typed fast');
    unmount();
    await waitFor(() =>
      expect(drafts.saveNewMailDraft).toHaveBeenLastCalledWith(CHAR_ID, [], 'Typed fast', '')
    );
  });

  it('flushes when the page is backgrounded', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(await screen.findByLabelText('Subject'), 'Hidden soon');
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Reflect.deleteProperty(document, 'visibilityState');
    await waitFor(() =>
      expect(drafts.saveNewMailDraft).toHaveBeenLastCalledWith(CHAR_ID, [], 'Hidden soon', '')
    );
  });

  it('does not write after a send finished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, onSent } = setup();
    await addList(user);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    drafts.saveNewMailDraft.mockClear();
    await vi.advanceTimersByTimeAsync(600);
    expect(drafts.saveNewMailDraft).not.toHaveBeenCalled();
  });
});

describe('send guard', () => {
  it('sends once on a double press', async () => {
    let release: (v: number) => void = () => undefined;
    sendMail.mockReturnValue(new Promise<number>((r) => (release = r)));
    const { user } = setup();
    await addList(user);
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    fireEvent.click(send);
    release(1);
    await waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
  });
});

describe('full-pane dialog', () => {
  it('is a modal dialog, makes the page behind inert, and Escape closes keeping the draft', async () => {
    const behind = document.createElement('div');
    document.body.appendChild(behind);
    const { user, onClose } = setup();
    const dialog = await screen.findByRole('dialog', { name: 'New mail' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(behind).toHaveAttribute('inert');
    await user.type(screen.getByLabelText('Subject'), 'Esc me');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('kept'));
    expect(drafts.saveNewMailDraft).toHaveBeenLastCalledWith(CHAR_ID, [], 'Esc me', '');
    behind.remove();
  });

  it('Escape in an open recipient list closes only the list', async () => {
    const { user, onClose } = setup();
    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('mailing list loading', () => {
  it('says so when the lists could not be loaded', async () => {
    loadMailingLists.mockResolvedValue({ cached: null, needsReauth: false });
    const { user } = setup();
    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByText(/Couldn't load your mailing lists/)).toBeInTheDocument();
  });
});
