import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { SrpClaim, SrpClaimOutcome } from '../srpClaimTypes';

vi.mock('./useSrpClaimNames', () => ({
  useSrpClaimNames: () => ({
    hull: (id: number) => `Hull${id}`,
    system: (id: number) => `Sys${id}`,
  }),
}));

const mailResult = vi.hoisted(() => vi.fn());
vi.mock('./useSrpResultMail', () => ({ useSrpResultMail: () => mailResult }));

import { OfficerQueue } from './OfficerQueue';
import type { SrpQueueData } from './useSrpQueue';

const claim = (killmailId: number, over: Partial<SrpClaim> = {}): SrpClaim => ({
  killmailId,
  corporationId: 98,
  characterId: 5000 + killmailId,
  characterName: `Pilot${killmailId}`,
  hullTypeId: 10,
  solarSystemId: 20,
  killedAt: Date.UTC(2026, 9, 22),
  filedAt: Date.UTC(2026, 9, 22) + killmailId,
  state: 'pending',
  amount: 1_000_000,
  basis: { step: 'hull-fixed' },
  suggested: null,
  fleetOrFc: null,
  note: null,
  refileCount: 0,
  ...over,
});

const outcome = (id: number, state: SrpClaim['state']): SrpClaimOutcome => ({
  killmailId: id,
  state,
  characterId: 5000 + id,
  characterName: `Pilot${id}`,
  amount: 1_000_000,
});

function setup(claims: SrpClaim[]) {
  const data = {
    state: { status: 'ready', claims, activity: [] },
    reload: vi.fn(),
    approve: vi.fn(async (item: { killmailId: number }) => outcome(item.killmailId, 'approved')),
    approveMany: vi.fn(async (items: { killmailId: number }[]) => ({
      results: items.map((i) => ({ ok: true as const, ...outcome(i.killmailId, 'approved') })),
    })),
    reject: vi.fn(async (id: number) => outcome(id, 'rejected')),
    change: vi.fn(async (id: number) => outcome(id, 'pending')),
    markPaid: vi.fn(async (id: number) => outcome(id, 'paid')),
    markPaidMany: vi.fn(async (ids: number[]) => ({
      results: ids.map((id) => ({ ok: true as const, ...outcome(id, 'paid') })),
    })),
    claimAudit: vi.fn(async () => []),
  } satisfies SrpQueueData;
  render(<OfficerQueue data={data} ready={data.state as never} />);
  return data;
}

const pendingSet = () => [
  claim(1),
  claim(2),
  claim(3, { amount: null, basis: null }),
  claim(4, { state: 'approved', decidedAt: 5, decidedByName: 'Boss' }),
  claim(5, { state: 'paid', closedAt: 9, paidAt: 9, paidByName: 'Boss' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mailResult.mockResolvedValue({ sent: [], failed: [], missingScope: false });
});

describe('OfficerQueue pending', () => {
  it('summarises the queue and offers a tick only where Approve can apply', () => {
    setup(pendingSet());
    expect(screen.getByText('3 pending')).toBeInTheDocument();
    expect(screen.getByText('1,000,000 ISK owed')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('approves a row at its own amount, sending no amount', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(data.approve).toHaveBeenCalledWith({ killmailId: 1 });
    expect(await screen.findByText(/Approved Pilot1/)).toBeInTheDocument();
  });

  it('keeps Approve inert for a claim with no amount until one is typed', async () => {
    const data = setup(pendingSet());
    const approve = screen.getAllByRole('button', { name: 'Approve' })[2]!;
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(approve);
    expect(data.approve).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Amount for Pilot3'), '2500000');
    expect(approve).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(approve);
    expect(data.approve).toHaveBeenCalledWith({ killmailId: 3, amount: 2_500_000 });
  });

  it('bulk approves the ticked rows only', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(data.approveMany).toHaveBeenCalledWith([{ killmailId: 1 }, { killmailId: 2 }]);
    expect(await screen.findByText('Approved 2 of 2')).toBeInTheDocument();
  });

  it('reports the result mail after a batch approve, and a failed one keeps the status', async () => {
    mailResult.mockResolvedValue({ sent: ['Pilot1'], failed: ['Pilot2'], missingScope: false });
    setup(pendingSet());
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(
      await screen.findByText(
        'Approved 2 of 2. Mail sent to 1 pilot. Mail failed for Pilot2, status still saved.'
      )
    ).toBeInTheDocument();
    expect(mailResult).toHaveBeenCalledWith('approved', [
      expect.objectContaining({
        characterId: 5001,
        claim: { killmailId: 1, hull: 'Hull10', amount: 1_000_000 },
      }),
      expect.objectContaining({ characterId: 5002 }),
    ]);
  });

  it('says so when the mail permission is missing, never blocking the approval', async () => {
    mailResult.mockResolvedValue({ sent: [], failed: [], missingScope: true });
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(data.approve).toHaveBeenCalled();
    expect(
      await screen.findByText(/Approved Pilot1.*No mail sent: mail permission missing\./)
    ).toBeInTheDocument();
  });

  it('says which claims a batch left alone', async () => {
    const data = setup(pendingSet());
    data.approveMany.mockResolvedValueOnce({
      results: [
        { ok: true, ...outcome(1, 'approved') },
        { ok: false, killmailId: 2, reason: 'illegal-transition', message: 'x' },
      ],
    } as never);
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(
      await screen.findByText(/Approved 1 of 2\. 1 not changed: Another officer/)
    ).toBeInTheDocument();
  });

  it('shows a refusal as a line, not a crash', async () => {
    const data = setup(pendingSet());
    data.approve.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'illegal-transition' } })
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(
      await screen.findByText('Another officer already decided that claim.')
    ).toBeInTheDocument();
  });
});

describe('OfficerQueue reject', () => {
  it('needs a reason before Reject claim does anything, then sends it trimmed', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject…' })[0]!);
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Reject claim' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(confirm);
    expect(data.reject).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByRole('textbox'), '  Solo roam ');
    await userEvent.click(confirm);
    await waitFor(() => expect(data.reject).toHaveBeenCalledWith(1, 'Solo roam'));
  });

  it('mails the pilot the reason and reports it', async () => {
    mailResult.mockResolvedValue({ sent: ['Pilot1'], failed: [], missingScope: false });
    setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject…' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Solo roam');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject claim' }));
    expect(await screen.findByText(/Rejected Pilot1.*Mail sent to 1 pilot\./)).toBeInTheDocument();
    expect(mailResult).toHaveBeenCalledWith('rejected', [
      expect.objectContaining({ claim: expect.objectContaining({ reason: 'Solo roam' }) }),
    ]);
  });

  it('keeps the dialog and the typed reason when the server refuses', async () => {
    const data = setup(pendingSet());
    data.reject.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'illegal-transition' } })
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject…' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'why');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject claim' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Another officer');
    expect(within(dialog).getByRole('textbox')).toHaveValue('why');
  });
});

describe('OfficerQueue detail and change amount', () => {
  it('opens the detail on a row click and changes the amount with a reason', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByText('Pilot1')[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Change amount…' }));
    const dialog = await screen.findByRole('dialog', { name: /Change amount/ });
    await userEvent.type(within(dialog).getByLabelText('New amount'), '700000');
    const save = within(dialog).getByRole('button', { name: 'Save amount' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(within(dialog).getAllByRole('textbox').at(-1)!, 'Missing mods');
    await userEvent.click(save);
    await waitFor(() => expect(data.change).toHaveBeenCalledWith(1, 700_000, 'Missing mods'));
    expect(data.claimAudit).toHaveBeenCalledWith(1);
  });
});

describe('OfficerQueue owed and history', () => {
  it('marks a claim paid and bulk marks the ticked ones', async () => {
    const data = setup([...pendingSet(), claim(6, { state: 'approved', decidedAt: 6 })]);
    await userEvent.click(screen.getByRole('tab', { name: /Owed/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark paid' })[0]!);
    expect(data.markPaid).toHaveBeenCalledWith(4);
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid (2)' }));
    expect(data.markPaidMany).toHaveBeenCalledWith([4, 6]);
  });

  it('lists closed claims with their reason in History, without actions', async () => {
    setup([
      claim(7, {
        state: 'rejected',
        closedAt: 3,
        rejectionReason: 'Solo roam',
        decidedByName: 'Lena',
      }),
    ]);
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('Solo roam')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('says so when a tab is empty', async () => {
    setup([claim(1)]);
    await userEvent.click(screen.getByRole('tab', { name: /Owed/ }));
    expect(screen.getByText('Nothing owed')).toBeInTheDocument();
  });
});
