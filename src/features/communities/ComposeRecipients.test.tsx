import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';
import type { CommunityMember } from './communityStore';

const store = vi.hoisted(() => ({
  postRequest: vi.fn(),
  editRequest: vi.fn(),
  loadRequestMailsToday: vi.fn(),
  reserveRequestMail: vi.fn(),
  confirmRequestMail: vi.fn(),
  releaseRequestMail: vi.fn(),
}));
vi.mock('./requestStore', () => store);
vi.mock('./requestMailStore', () => store);
const communities = vi.hoisted(() => ({ loadMemberLibraries: vi.fn() }));
vi.mock('./communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./communityStore')>()),
  ...communities,
}));
const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('@/features/character/mail', () => mail);
vi.mock('@/features/market/appraisalData', () => ({
  loadAppraisalCatalogue: () => Promise.resolve(new Map()),
}));
vi.mock('@/app/grantAction', () => ({ beginGrant: vi.fn() }));

import { ComposeRequestDialog, POST_TIMEOUT_MS } from './ComposeRequestDialog';

const member = (id: number, name: string): CommunityMember => ({
  uid: `char:${id}`,
  characterName: name,
  joinedAt: 1,
  libraryAsOf: null,
});
const MEMBERS = [
  member(1, 'Kestrel Vane'),
  member(2, 'Bo Tanner'),
  member(3, 'Cael Ito'),
  member(4, 'Dana Reyes'),
];
const LINES = [
  { typeId: 34, name: 'Tritanium', quantity: 1000, kind: 'item' as const },
  { typeId: 99, name: 'Ishtar Blueprint', quantity: 2, kind: 'bpc' as const, runs: 10 },
];

function renderDialog(over: Partial<React.ComponentProps<typeof ComposeRequestDialog>> = {}) {
  const onClose = vi.fn();
  const onPosted = vi.fn();
  render(
    <ComposeRequestDialog
      characterId={1}
      communityId="c1"
      myUid="char:1"
      members={MEMBERS}
      prefill={{ lines: LINES }}
      onClose={onClose}
      onPosted={onPosted}
      {...over}
    />
  );
  return { onClose, onPosted };
}

/** The chips of who will be mailed, once the day's count and the libraries are read. */
async function chips() {
  return screen.findByRole('list', { name: 'Characters to mail' });
}
const chipNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace('×', ''));
const mailField = () => screen.findByRole('combobox', { name: 'Mail to (optional)' });

async function seedToken(scopes: string[]) {
  await db.tokens.clear();
  await db.tokens.put({
    characterId: 1,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 0,
    scopes,
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await seedToken(['esi-mail.send_mail.v1']);
  store.postRequest.mockResolvedValue({ requestId: 'r1' });
  store.loadRequestMailsToday.mockResolvedValue(3);
  store.reserveRequestMail.mockResolvedValue({
    communityName: 'Pals',
    requesterName: 'Kestrel Vane',
    remaining: 96,
  });
  store.confirmRequestMail.mockResolvedValue(undefined);
  store.releaseRequestMail.mockResolvedValue(undefined);
  mail.sendMail.mockResolvedValue(7);
  communities.loadMemberLibraries.mockResolvedValue([
    { uid: 'char:2', items: [{ typeId: 99, runs: -1 }] },
    { uid: 'char:3', items: [{ typeId: 5, runs: 1 }] },
  ]);
});

describe('Compose: who to mail', () => {
  it('starts with my own character and the Members sharing a matching blueprint as chips', async () => {
    renderDialog();
    const list = await chips();
    expect(screen.getByText(/3 of 100 mails sent today/)).toBeInTheDocument();
    expect(chipNames(list)).toEqual(['Kestrel Vane (you)', 'Bo Tanner']);
    expect(screen.getByRole('button', { name: 'Post request and mail 2 Members' })).toBeEnabled();
  });

  it('adds another Member by typing their name, and removes a chip with its ×', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await chips();
    await user.type(await mailField(), 'cael');
    await user.click(await screen.findByRole('option', { name: 'Cael Ito' }));
    expect(chipNames(list)).toEqual(['Kestrel Vane (you)', 'Bo Tanner', 'Cael Ito']);
    // Already-chosen Members are not offered again.
    await user.type(await mailField(), 'Bo Tanner');
    expect(screen.queryByRole('option', { name: /Bo Tanner/ })).not.toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: "Don't mail Bo Tanner" }));
    expect(chipNames(list)).toEqual(['Kestrel Vane (you)', 'Cael Ito']);
  });

  it('adds the highlighted Member on Enter', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await chips();
    await user.type(await mailField(), 'dana{Enter}');
    expect(chipNames(list)).toContain('Dana Reyes');
  });

  it('never posts on Enter in the Mail to field, and Escape closes only the suggestions', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await chips();
    await user.type(await mailField(), 'zzz{Enter}');
    expect(store.postRequest).not.toHaveBeenCalled();
    await user.clear(await mailField());
    await user.type(await mailField(), 'cael');
    await screen.findByRole('option', { name: 'Cael Ito' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('posts first, then sends one mail covering every line to each chip, me included', async () => {
    const user = userEvent.setup();
    const { onPosted, onClose } = renderDialog();
    await user.type(screen.getByLabelText('Location (optional)'), 'Efa');
    await chips();
    await user.type(await mailField(), 'cael{Enter}');
    await user.click(screen.getByRole('button', { name: 'Post request and mail 3 Members' }));
    await screen.findByText('Request posted. Mailed 3 of 3 Members.');
    expect(store.postRequest).toHaveBeenCalledTimes(1);
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(store.reserveRequestMail).toHaveBeenCalledTimes(3);
    expect(mail.sendMail).toHaveBeenCalledTimes(3);
    const sent = mail.sendMail.mock.calls.map((c) => c[1][0].recipient_id).sort();
    expect(sent).toEqual([1, 2, 3]);
    const [characterId, , subject, body] = mail.sendMail.mock.calls[0];
    expect(characterId).toBe(1);
    expect(subject).toContain('Kestrel Vane');
    expect(body).toContain('1,000 × Tritanium');
    expect(body).toContain('2 × Ishtar Blueprint (blueprint copy, runs 10)');
    expect(body).toContain('Location: Efa');
    expect(body).toContain('tab=requests');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('posts without mail once every chip is removed', async () => {
    const user = userEvent.setup();
    const { onPosted, onClose } = renderDialog();
    const list = await chips();
    for (const name of ['Kestrel Vane', 'Bo Tanner']) {
      await user.click(within(list).getByRole('button', { name: `Don't mail ${name}` }));
    }
    await user.click(screen.getByRole('button', { name: 'Post request' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(store.reserveRequestMail).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('keeps the Request when mail fails, and says what happened to each Member', async () => {
    const user = userEvent.setup();
    mail.sendMail.mockRejectedValue(new EsiError(403, 'no'));
    const { onPosted } = renderDialog();
    await chips();
    await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
    const results = await screen.findByRole('list', { name: 'Mail results' });
    await waitFor(() =>
      expect(within(results).getAllByText(/EVE refused the mail/)).toHaveLength(2)
    );
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(store.releaseRequestMail).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Request posted. Mailed 0 of 2 Members.')).toBeInTheDocument();
  });

  it('reports the daily cap per Member and warns before posting when chips exceed what is left', async () => {
    const user = userEvent.setup();
    store.loadRequestMailsToday.mockResolvedValue(99);
    store.reserveRequestMail
      .mockResolvedValueOnce({ communityName: 'Pals', requesterName: 'Kestrel Vane', remaining: 0 })
      .mockRejectedValueOnce({ details: { reason: 'daily-cap' } });
    renderDialog();
    await chips();
    expect(screen.getByText(/You can send 1 more mail today/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
    await screen.findByText('Request posted. Mailed 1 of 2 Members.');
    expect(screen.getByText(/Not mailed. You have used/)).toBeInTheDocument();
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('adds the Members a caller names, on top of the matches', async () => {
    renderDialog({ prefill: { lines: LINES, tickedUids: ['char:4'] } });
    const list = await chips();
    expect(chipNames(list)).toContain('Dana Reyes');
    expect(screen.getByRole('button', { name: 'Post request and mail 3 Members' })).toBeEnabled();
  });

  it('stays on the one page, lines intact, when the post fails', async () => {
    const user = userEvent.setup();
    store.postRequest.mockRejectedValue(new Error('down'));
    renderDialog();
    await chips();
    await user.click(screen.getByRole('button', { name: /Post request and mail/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't post/);
    expect(screen.getByLabelText('Tritanium quantity')).toHaveValue('1000');
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('turns mailing off, and says why, while the Character cannot send mail', async () => {
    await seedToken([]);
    renderDialog();
    expect(await screen.findByText('Permission to send mail')).toBeInTheDocument();
    const none = await chips();
    await waitFor(() => expect(within(none).queryAllByRole('listitem')).toHaveLength(0));
    expect(await mailField()).toBeDisabled();
    // Posting without mail is still possible.
    expect(screen.getByRole('button', { name: 'Post request' })).toBeEnabled();
  });

  it('stays open while the post is in flight, so the mails cannot send invisibly', async () => {
    const user = userEvent.setup();
    let finish: (value: { requestId: string }) => void = () => undefined;
    store.postRequest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onClose } = renderDialog();
    await chips();
    await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    finish({ requestId: 'r1' });
    await screen.findByText('Request posted. Mailed 2 of 2 Members.');
  });

  it('says so, and adds only me, when the shared libraries cannot be read', async () => {
    communities.loadMemberLibraries.mockRejectedValue(new Error('offline'));
    renderDialog();
    const list = await chips();
    expect(communities.loadMemberLibraries).toHaveBeenCalledWith(1, 'c1', expect.any(Array), {
      strict: true,
    });
    expect(await screen.findByText(/Couldn't read what Members share/)).toBeInTheDocument();
    expect(chipNames(list)).toEqual(['Kestrel Vane (you)']);
  });

  it('shows the mail count as unknown, not zero, when it cannot be read', async () => {
    store.loadRequestMailsToday.mockRejectedValue(new Error('offline'));
    renderDialog();
    expect(
      await screen.findByText(/Couldn't read how many mails you have sent/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 of 100 mails sent today/)).not.toBeInTheDocument();
  });

  it('says nothing can be mailed when the day’s mails are used up', async () => {
    store.loadRequestMailsToday.mockResolvedValue(100);
    renderDialog();
    expect(await screen.findByText(/You have sent today's mails/)).toBeInTheDocument();
  });

  it('lets go when the post never answers, and warns it may still have gone through', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      store.postRequest.mockReturnValue(new Promise(() => undefined));
      const { onClose } = renderDialog();
      await chips();
      await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
      await user.keyboard('{Escape}');
      expect(onClose).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(POST_TIMEOUT_MS + 100);
      expect(await screen.findByRole('alert')).toHaveTextContent(/may still have been posted/);
      expect(mail.sendMail).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Compose: editing a Request', () => {
  const existing = {
    id: 'r9',
    ownerUid: 'char:1',
    ownerName: 'Kestrel Vane',
    location: 'Efa',
    terms: '90% JBV',
    lines: LINES,
    createdAt: 1,
    lastActivityAt: 1,
    expiresAt: 9e12,
    closed: false,
  };

  it('prefills the Request, has no mail field, and saves the changes', async () => {
    const user = userEvent.setup();
    store.editRequest.mockResolvedValue(undefined);
    const { onPosted, onClose } = renderDialog({
      prefill: undefined,
      editing: { request: existing, linesLocked: false },
    });
    expect(screen.getByRole('dialog', { name: 'Edit request' })).toBeInTheDocument();
    expect(screen.getByLabelText('Location (optional)')).toHaveValue('Efa');
    expect(screen.queryByRole('combobox', { name: 'Mail to (optional)' })).toBeNull();
    const quantity = screen.getByLabelText('Tritanium quantity');
    await user.clear(quantity);
    await user.type(quantity, '2500');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.editRequest).toHaveBeenCalledWith(1, 'c1', 'r9', {
      location: 'Efa',
      terms: '90% JBV',
      lines: [{ ...LINES[0], quantity: 2500 }, LINES[1]],
    });
    expect(onPosted).toHaveBeenCalled();
    expect(store.reserveRequestMail).not.toHaveBeenCalled();
  });

  it('keeps the items fixed once Members have Pledged, but quantities stay editable', () => {
    renderDialog({ prefill: undefined, editing: { request: existing, linesLocked: true } });
    expect(screen.getByText(/Members have Pledged on this Request/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(screen.queryByLabelText(/Paste a list/)).toBeNull();
    expect(screen.queryByRole('searchbox', { name: 'Add an item' })).toBeNull();
    expect(screen.getByLabelText('Tritanium quantity')).toBeEnabled();
  });

  it('says so when the server refuses an edit', async () => {
    const user = userEvent.setup();
    store.editRequest.mockRejectedValue({ details: { reason: 'lines-locked' } });
    renderDialog({ prefill: undefined, editing: { request: existing, linesLocked: false } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Members have Pledged/);
  });
});
