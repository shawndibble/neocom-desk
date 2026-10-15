import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';
import type { CommunityMember } from './communityStore';

const store = vi.hoisted(() => ({
  postRequest: vi.fn(),
  loadRequestMailsToday: vi.fn(),
  reserveRequestMail: vi.fn(),
  confirmRequestMail: vi.fn(),
  releaseRequestMail: vi.fn(),
}));
vi.mock('./requestStore', () => store);
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

import { ComposeRequestDialog } from './ComposeRequestDialog';

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

async function toStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Next: who to mail' }));
  return screen.findByRole('list', { name: 'Members to mail' });
}

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

describe('Compose step 2: who to mail', () => {
  it('pre-ticks Members sharing a matching blueprint, with the day’s mail count', async () => {
    const user = userEvent.setup();
    renderDialog();
    const list = await toStep2(user);
    expect(screen.getByText(/3 of 100 mails sent today/)).toBeInTheDocument();
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Bo TannerShares 1 of these blueprints',
      'Cael Ito',
      'Dana Reyes',
    ]);
    expect(within(list).getByRole('checkbox', { name: /Bo Tanner/ })).toBeChecked();
    expect(within(list).getByRole('checkbox', { name: /Cael Ito/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Post request and mail 1 Member' })).toBeEnabled();
    // The requester is not offered.
    expect(within(list).queryByText('Kestrel Vane')).not.toBeInTheDocument();
  });

  it('posts first, then sends one mail covering every line to each ticked Member', async () => {
    const user = userEvent.setup();
    const { onPosted, onClose } = renderDialog();
    await user.type(screen.getByLabelText('Location (optional)'), 'Efa');
    const list = await toStep2(user);
    await user.click(within(list).getByRole('checkbox', { name: /Cael Ito/ }));
    await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
    await screen.findByText('Request posted. Mailed 2 of 2 Members.');
    expect(store.postRequest).toHaveBeenCalledTimes(1);
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(store.reserveRequestMail).toHaveBeenCalledTimes(2);
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    const [characterId, recipients, subject, body] = mail.sendMail.mock.calls[0];
    expect(characterId).toBe(1);
    expect(recipients).toEqual([{ recipient_id: 2, recipient_type: 'character' }]);
    expect(subject).toContain('Kestrel Vane');
    expect(body).toContain('1,000 × Tritanium');
    expect(body).toContain('2 × Ishtar Blueprint (blueprint copy, runs 10)');
    expect(body).toContain('Location: Efa');
    expect(body).toContain('tab=requests');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('posts with nobody ticked and sends no mail', async () => {
    const user = userEvent.setup();
    communities.loadMemberLibraries.mockResolvedValue([]);
    const { onPosted, onClose } = renderDialog();
    await toStep2(user);
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
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Post request and mail 1 Member' }));
    const results = await screen.findByRole('list', { name: 'Mail results' });
    await waitFor(() =>
      expect(within(results).getByText(/EVE refused the mail/)).toBeInTheDocument()
    );
    expect(onPosted).toHaveBeenCalledTimes(1);
    expect(store.releaseRequestMail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Request posted. Mailed 0 of 1 Members.')).toBeInTheDocument();
  });

  it('reports the daily cap per Member and warns before posting when ticks exceed what is left', async () => {
    const user = userEvent.setup();
    store.loadRequestMailsToday.mockResolvedValue(99);
    store.reserveRequestMail
      .mockResolvedValueOnce({ communityName: 'Pals', requesterName: 'Kestrel Vane', remaining: 0 })
      .mockRejectedValueOnce({ details: { reason: 'daily-cap' } });
    renderDialog();
    const list = await toStep2(user);
    await user.click(within(list).getByRole('checkbox', { name: /Cael Ito/ }));
    expect(screen.getByText(/You can send 1 more mail today/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post request and mail 2 Members' }));
    await screen.findByText('Request posted. Mailed 1 of 2 Members.');
    expect(
      screen.getByText(/You have used today’s Request mails|Not mailed. You have used/)
    ).toBeInTheDocument();
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('ticks the Members a caller names, on top of the matches', async () => {
    const user = userEvent.setup();
    renderDialog({ prefill: { lines: LINES, tickedUids: ['char:4'] } });
    const list = await toStep2(user);
    expect(within(list).getByRole('checkbox', { name: /Dana Reyes/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Post request and mail 2 Members' })).toBeEnabled();
  });

  it('goes back to the lines without losing them, and stays on step 2 when the post fails', async () => {
    const user = userEvent.setup();
    store.postRequest.mockRejectedValue(new Error('down'));
    renderDialog();
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Tritanium quantity')).toHaveValue('1000');
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: /Post request and mail/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't post/);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('turns mailing off, and says why, while the Character cannot send mail', async () => {
    const user = userEvent.setup();
    await seedToken([]);
    renderDialog();
    const list = await toStep2(user);
    await waitFor(() =>
      expect(within(list).getByRole('checkbox', { name: /Bo Tanner/ })).toBeDisabled()
    );
    expect(await screen.findByText('Permission to send mail')).toBeInTheDocument();
    // Posting without mail is still possible.
    expect(screen.getByRole('button', { name: 'Post request' })).toBeEnabled();
  });

  it('stays open while the post is in flight, so the mails cannot send invisibly', async () => {
    const user = userEvent.setup();
    let finish: (value: { requestId: string }) => void = () => undefined;
    store.postRequest.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onClose } = renderDialog();
    await toStep2(user);
    await user.click(screen.getByRole('button', { name: 'Post request and mail 1 Member' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    finish({ requestId: 'r1' });
    await screen.findByText('Request posted. Mailed 1 of 1 Members.');
  });

  it('says so, and pre-ticks nobody, when the shared libraries cannot be read', async () => {
    const user = userEvent.setup();
    communities.loadMemberLibraries.mockRejectedValue(new Error('offline'));
    renderDialog();
    const list = await toStep2(user);
    expect(communities.loadMemberLibraries).toHaveBeenCalledWith(1, 'c1', expect.any(Array), {
      strict: true,
    });
    expect(await screen.findByText(/Couldn't read what Members share/)).toBeInTheDocument();
    expect(within(list).getByRole('checkbox', { name: /Bo Tanner/ })).not.toBeChecked();
  });

  it('shows the mail count as unknown, not zero, when it cannot be read', async () => {
    const user = userEvent.setup();
    store.loadRequestMailsToday.mockRejectedValue(new Error('offline'));
    renderDialog();
    await toStep2(user);
    expect(
      await screen.findByText(/Couldn't read how many mails you have sent/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 of 100 mails sent today/)).not.toBeInTheDocument();
  });

  it('says nothing can be mailed when the day’s mails are used up', async () => {
    const user = userEvent.setup();
    store.loadRequestMailsToday.mockResolvedValue(100);
    renderDialog();
    await toStep2(user);
    expect(await screen.findByText(/You have sent today's mails/)).toBeInTheDocument();
  });

  it('warns and offers the full count when more are ticked than are left', async () => {
    const user = userEvent.setup();
    store.loadRequestMailsToday.mockResolvedValue(99);
    renderDialog({ prefill: { lines: LINES, tickedUids: ['char:3', 'char:4'] } });
    await toStep2(user);
    expect(screen.getByText(/You can send 1 more mail today/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post request and mail 3 Members' })).toBeEnabled();
  });
});
