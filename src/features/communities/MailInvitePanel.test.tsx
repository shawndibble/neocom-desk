import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import en from '@/i18n/locales/en.json';
import { db } from '@/db';
import { EsiError } from '@/esi/errors';
import { MailInvitePanel } from './MailInvitePanel';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';

const store = vi.hoisted(() => ({
  reserveMailInvite: vi.fn(),
  confirmMailInvite: vi.fn(),
  releaseMailInvite: vi.fn(),
  loadMailInviteStatus: vi.fn(),
}));
vi.mock('./communityStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./communityStore')>()),
  ...store,
}));
const lookup = vi.hoisted(() => ({ resolvePilotByName: vi.fn() }));
vi.mock('@/features/travel/pilotLookup', () => lookup);
const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('@/features/character/mail', () => mail);
vi.mock('@/sync/syncAuth', () => ({ ensureSignedIn: vi.fn() }));
vi.mock('@/app/grantAction', () => ({ beginGrant: vi.fn() }));

const m = en.communities.mailInvite;
const ME = 91;
const community = {
  id: 'c1',
  name: 'Pals',
  adminUid: `char:${ME}`,
  inviteCode: 'CODE1',
  memberCount: 2,
};
const SEND_SCOPE = 'esi-mail.send_mail.v1';

async function seedToken(scopes: string[]) {
  await db.tokens.clear();
  await db.tokens.put({
    characterId: ME,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: 0,
    scopes,
  });
}

async function typeName(name = 'Bob') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(m.nameLabel), name);
  return user;
}

// The worker's first render of the panel pays the cold module load once, here.
beforeAll(async () => {
  store.loadMailInviteStatus.mockResolvedValue({ remaining: 20, sent: [] });
  await seedToken([SEND_SCOPE]);
  render(<MailInvitePanel community={community} characterId={ME} />).unmount();
}, 30_000);

beforeEach(async () => {
  Object.values(store).forEach((fn) => fn.mockReset());
  lookup.resolvePilotByName.mockReset().mockResolvedValue({ characterId: 42, name: 'Bob' });
  mail.sendMail.mockReset().mockResolvedValue(7);
  store.loadMailInviteStatus.mockResolvedValue({ remaining: 20, sent: [] });
  store.reserveMailInvite.mockResolvedValue({
    inviteCode: 'CODE1',
    communityName: 'Pals',
    adminName: 'Boss',
    remaining: 19,
  });
  store.confirmMailInvite.mockResolvedValue(undefined);
  store.releaseMailInvite.mockResolvedValue(undefined);
  await seedToken([SEND_SCOPE]);
});

describe('Invite by mail panel', () => {
  it('looks the name up, reserves a slot, mails the fixed template and records it', async () => {
    store.loadMailInviteStatus
      .mockResolvedValueOnce({ remaining: 20, sent: [] })
      .mockResolvedValue({ remaining: 19, sent: [] });
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName(' Bob ');
    await user.click(screen.getByRole('button', { name: m.send }));
    await waitFor(() => expect(mail.sendMail).toHaveBeenCalled());
    expect(lookup.resolvePilotByName).toHaveBeenCalledWith('Bob');
    expect(store.reserveMailInvite).toHaveBeenCalledWith(ME, 'c1', 42, 'Bob');
    const [from, recipients, subject, body] = mail.sendMail.mock.calls[0];
    expect(from).toBe(ME);
    expect(recipients).toEqual([{ recipient_id: 42, recipient_type: 'character' }]);
    expect(subject).toBe('Invitation to join Pals');
    expect(body).toContain('Boss');
    expect(body).toMatch(/<a href="[^"]*\/communities\/join\/CODE1">[^<]*<\/a>/);
    await waitFor(() => expect(store.confirmMailInvite).toHaveBeenCalledWith(ME, 'c1', 42, 'Bob'));
    expect(await screen.findByText('19 mail invites left today')).toBeInTheDocument();
  });

  it('sends nothing when the name matches no Character', async () => {
    lookup.resolvePilotByName.mockResolvedValue(null);
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName('Nobody');
    await user.click(screen.getByRole('button', { name: m.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(m.problem.notFound);
    expect(store.reserveMailInvite).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('refuses to invite the admin Character itself', async () => {
    lookup.resolvePilotByName.mockResolvedValue({ characterId: ME, name: 'Me' });
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName('Me');
    await user.click(screen.getByRole('button', { name: m.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(m.problem.self);
    expect(store.reserveMailInvite).not.toHaveBeenCalled();
  });

  it.each([
    ['already-invited', m.problem.alreadyInvited],
    ['daily-cap', m.problem.dailyCap],
  ])('shows the server’s %s refusal and sends no mail', async (reason, text) => {
    store.reserveMailInvite.mockRejectedValue({
      code: 'functions/resource-exhausted',
      details: { reason },
    });
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName();
    await user.click(screen.getByRole('button', { name: m.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('keeps the slot spent when the mail may have gone out (a timeout)', async () => {
    mail.sendMail.mockRejectedValue(new EsiError(0, 'timeout'));
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName();
    await user.click(screen.getByRole('button', { name: m.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(m.problem.sendUnsure);
    expect(store.releaseMailInvite).not.toHaveBeenCalled();
    expect(store.confirmMailInvite).not.toHaveBeenCalled();
  });

  it('retries the Sent stamp when confirming fails once', async () => {
    store.confirmMailInvite
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName();
    await user.click(screen.getByRole('button', { name: m.send }));
    await waitFor(() => expect(store.confirmMailInvite).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Invite sent to Bob.')).toBeInTheDocument();
  });

  it('strips markup from names before they go into the mail', async () => {
    store.reserveMailInvite.mockResolvedValue({
      inviteCode: 'CODE1',
      communityName: 'Pals<font color="red">',
      adminName: '<b>Boss',
      remaining: 19,
    });
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName();
    await user.click(screen.getByRole('button', { name: m.send }));
    await waitFor(() => expect(mail.sendMail).toHaveBeenCalled());
    const [, , subject, body] = mail.sendMail.mock.calls[0];
    expect(subject).not.toMatch(/[<>]/);
    expect(body.replace(/<a href="[^"]*">[^<]*<\/a>/, '')).not.toMatch(/[<>]/);
  });

  it('gives the slot back when ESI refuses the mail', async () => {
    mail.sendMail.mockRejectedValue(new EsiError(400, 'CSPA'));
    render(<MailInvitePanel community={community} characterId={ME} />);
    const user = await typeName();
    await user.click(screen.getByRole('button', { name: m.send }));
    expect(await screen.findByRole('alert')).toHaveTextContent(m.problem.sendFailed);
    expect(store.releaseMailInvite).toHaveBeenCalledWith(ME, 'c1', 42, 'Bob');
    expect(store.confirmMailInvite).not.toHaveBeenCalled();
  });

  it('disables sending and asks for the permission when the grant lacks the mail scope', async () => {
    await seedToken([]);
    render(<MailInvitePanel community={community} characterId={ME} />);
    expect(await screen.findByText(m.grantTitle)).toBeInTheDocument();
    // The note and the panel read the grant through separate live queries.
    await waitFor(() => expect(screen.getByLabelText(m.nameLabel)).toBeDisabled());
    expect(screen.getByRole('button', { name: m.send })).toBeDisabled();
  });

  it('disables sending once the day’s invites are used', async () => {
    store.loadMailInviteStatus.mockResolvedValue({ remaining: 0, sent: [] });
    render(<MailInvitePanel community={community} characterId={ME} />);
    expect(await screen.findByText('0 mail invites left today')).toBeInTheDocument();
    expect(screen.getByLabelText(m.nameLabel)).toBeDisabled();
  });

  it('shows the sent time in EVE time when the Time format says so', async () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    useTimeFormat.setState({ value: 'eve', hydrated: true });
    try {
      const sentAt = Date.UTC(2026, 9, 12, 12);
      store.loadMailInviteStatus.mockResolvedValue({
        remaining: 18,
        sent: [{ targetCharacterId: 42, targetName: 'Bob', sentAt }],
      });
      render(<MailInvitePanel community={community} characterId={ME} />);
      expect(await screen.findByText('Bob')).toBeInTheDocument();
      expect(
        screen.getByText(`Sent ${formatTimestamp(new Date(sentAt), 'UTC')}`)
      ).toBeInTheDocument();
    } finally {
      process.env.TZ = originalTz;
      useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: true });
    }
  });

  it('lists the invites already sent with their time', async () => {
    store.loadMailInviteStatus.mockResolvedValue({
      remaining: 18,
      sent: [{ targetCharacterId: 42, targetName: 'Bob', sentAt: Date.UTC(2026, 9, 12, 12) }],
    });
    render(<MailInvitePanel community={community} characterId={ME} />);
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/^Sent /)).toBeInTheDocument();
  });
});
