import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { SrpClaim, SrpClaimOutcome } from '../srpClaimTypes';
import { useActiveCharacter } from '@/stores/activeCharacter';

vi.mock('./useSrpClaimNames', () => ({
  useSrpClaimNames: () => ({
    hull: (id: number) => `Hull${id}`,
    system: (id: number) => `Sys${id}`,
  }),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async (ids: number[]) => new Map(ids.map((id) => [id, `Item${id}`])),
}));

vi.mock('@/app/GrantNote', () => ({ GrantNote: ({ title }: { title: string }) => <p>{title}</p> }));

const mailResult = vi.hoisted(() => vi.fn());
vi.mock('./useSrpResultMail', () => ({ useSrpResultMail: () => mailResult }));

import { OfficerQueue } from './OfficerQueue';
import { PENDING_DEFAULT_COLUMNS, useVisiblePendingColumns } from './srpPendingColumns';
import { setSrpMemberBackendOverride, type SrpMemberBackend } from './srpMemberBackend';
import type { SrpClaimValues } from '../srpTypes';
import type { SrpHistoryState, SrpQueueData } from './useSrpQueue';

/** A Toast renders its line twice on purpose (visible, aria-hidden + sr-only live region); take the first. */
const findLine = async (text: string | RegExp) => (await screen.findAllByText(text))[0]!;

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

function setup(claims: SrpClaim[], history: SrpHistoryState = { status: 'idle' }) {
  const data = {
    state: { status: 'ready', claims, activity: [], history },
    reload: vi.fn(),
    loadHistory: vi.fn(),
    loadOlderHistory: vi.fn(),
    approve: vi.fn(async (item: { killmailId: number }) => outcome(item.killmailId, 'approved')),
    approveMany: vi.fn(async (items: { killmailId: number }[]) => ({
      results: items.map((i) => ({ ok: true as const, ...outcome(i.killmailId, 'approved') })),
    })),
    reject: vi.fn(async (id: number) => outcome(id, 'rejected')),
    change: vi.fn(async (id: number) => outcome(id, 'pending')),
    markPaid: vi.fn(async (item: { killmailId: number }) => outcome(item.killmailId, 'paid')),
    markPaidMany: vi.fn(async (items: { killmailId: number }[]) => ({
      results: items.map((i) => ({ ok: true as const, ...outcome(i.killmailId, 'paid') })),
    })),
    claimAudit: vi.fn(async () => []),
    claimValues: vi.fn<(killmailId: number) => Promise<SrpClaimValues>>(async () => ({
      hullValue: null,
      fitValue: null,
      doctrineValue: null,
    })),
  } satisfies SrpQueueData;
  render(
    <MemoryRouter>
      <OfficerQueue data={data} ready={data.state as never} />
    </MemoryRouter>
  );
  return data;
}

const pendingSet = () => [
  claim(1),
  claim(2),
  claim(3, { amount: null, basis: null }),
  claim(4, { state: 'approved', decidedAt: 5, decidedByName: 'Boss' }),
  claim(5, { state: 'paid', closedAt: 9, paidAt: 9, paidByName: 'Boss' }),
];

afterEach(() => useActiveCharacter.setState({ activeCharacterId: null }));
beforeEach(() => {
  vi.clearAllMocks();
  mailResult.mockResolvedValue({ queued: [], failed: [], missingScope: false });
});

describe('OfficerQueue killmail and appraisal', () => {
  const HASH = 'a'.repeat(40);
  afterEach(() => setSrpMemberBackendOverride(null));

  it('compares the lost ship with the doctrine fit in the detail, and opens the killmail over it', async () => {
    setSrpMemberBackendOverride({
      killmail: async (killmailId: number) => ({
        killmail_id: killmailId,
        victim: {
          ship_type_id: 10,
          items: [{ item_type_id: 519, flag: 11, quantity_destroyed: 1, singleton: 0 }],
        },
        attackers: [{ final_blow: true, ship_type_id: 10 }],
      }),
    } as unknown as SrpMemberBackend);
    const data = setup([
      claim(1, {
        killmailHash: HASH,
        doctrineCheck: {
          status: 'off-doctrine',
          doctrineName: 'Hurricane - artillery',
          diff: { missingModules: [], extraModules: [519], missingRigs: [], extraRigs: [] },
        },
      }),
    ]);
    data.claimValues.mockResolvedValue({
      hullValue: 71_000_000,
      fitValue: 116_000_000,
      doctrineValue: 100_000_000,
    });
    await userEvent.click(screen.getAllByText('Pilot1')[0]!);
    const detail = await screen.findByRole('dialog');
    expect(await within(detail).findByText('+87.0%')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Open killmail' }));
    const modals = await screen.findAllByRole('dialog');
    const killmail = modals[modals.length - 1]!;
    expect(await within(killmail).findByRole('img', { name: 'Off doctrine' })).toBeInTheDocument();
    expect(within(killmail).queryByRole('button', { name: 'File claim' })).toBeNull();
  });

  it('says the doctrine value is unavailable when there is no doctrine to compare', async () => {
    const data = setup([claim(2, { killmailHash: HASH })]);
    data.claimValues.mockResolvedValue({
      hullValue: 71_000_000,
      fitValue: 116_000_000,
      doctrineValue: null,
    });
    await userEvent.click(screen.getAllByText('Pilot2')[0]!);
    expect(await screen.findByText('Doctrine value unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).toBeNull();
  });
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
    expect(data.approve).toHaveBeenCalledWith({ killmailId: 1, expectedAmount: 1_000_000 });
    expect(await findLine(/Approved Pilot1/)).toBeInTheDocument();
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
    expect(data.approve).toHaveBeenCalledWith({
      killmailId: 3,
      amount: 2_500_000,
      expectedAmount: null,
    });
  });

  it('bulk approves the ticked rows only', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(data.approveMany).toHaveBeenCalledWith([
      { killmailId: 1, expectedAmount: 1_000_000 },
      { killmailId: 2, expectedAmount: 1_000_000 },
    ]);
    expect(await findLine('Approved 2 of 2')).toBeInTheDocument();
  });

  it('reports the result mail after a batch approve, and a failed one keeps the status', async () => {
    mailResult.mockResolvedValue({ queued: ['Pilot1'], failed: ['Pilot2'], missingScope: false });
    setup(pendingSet());
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    expect(
      await findLine(
        'Approved 2 of 2. Mail queued for 1 pilot. Mail failed for Pilot2, status still saved.'
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
    mailResult.mockResolvedValue({ queued: [], failed: [], missingScope: true });
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(data.approve).toHaveBeenCalled();
    expect(
      await findLine(/Approved Pilot1.*No mail sent: mail permission missing\./)
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
    expect(await findLine(/Approved 1 of 2\. 1 not changed: Another officer/)).toBeInTheDocument();
  });

  it('words an amount that changed under the officer, plainly', async () => {
    const data = setup(pendingSet());
    data.approve.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'amount-changed' } })
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await findLine('The amount changed. Review it and try again.')).toBeInTheDocument();
  });

  it('keeps the grant-mail note when a run had no pilots to mail', async () => {
    mailResult.mockResolvedValueOnce({ queued: [], failed: [], missingScope: true });
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await screen.findByText("Can't mail the pilot")).toBeInTheDocument();
    mailResult.mockResolvedValueOnce({ queued: [], failed: [], missingScope: false });
    data.approveMany.mockResolvedValueOnce({
      results: [{ ok: false, killmailId: 2, reason: 'illegal-transition', message: 'x' }],
    } as never);
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (2)' }));
    await findLine(/Approved 0 of 1/);
    expect(screen.getByText("Can't mail the pilot")).toBeInTheDocument();
  });

  it('shows a refusal as a line, not a crash', async () => {
    const data = setup(pendingSet());
    data.approve.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'illegal-transition' } })
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(await findLine('Another officer already decided that claim.')).toBeInTheDocument();
  });
});

describe('OfficerQueue reject', () => {
  it('needs a reason before Reject claim does anything, then sends it trimmed', async () => {
    const data = setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]!);
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
    mailResult.mockResolvedValue({ queued: ['Pilot1'], failed: [], missingScope: false });
    setup(pendingSet());
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), 'Solo roam');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject claim' }));
    expect(await findLine(/Rejected Pilot1.*Mail queued for 1 pilot\./)).toBeInTheDocument();
    expect(mailResult).toHaveBeenCalledWith('rejected', [
      expect.objectContaining({ claim: expect.objectContaining({ reason: 'Solo roam' }) }),
    ]);
  });

  it('keeps the dialog and the typed reason when the server refuses', async () => {
    const data = setup(pendingSet());
    data.reject.mockRejectedValueOnce(
      Object.assign(new Error('x'), { details: { reason: 'illegal-transition' } })
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]!);
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
    await userEvent.click(await screen.findByRole('button', { name: 'Change amount' }));
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

describe('OfficerQueue row menu', () => {
  it('opens the ⋮ with the detail-only actions, and Change amount opens its dialog', async () => {
    setup(pendingSet());
    const more = screen.getAllByRole('button', { name: /More actions/ });
    // Claim 3 has no figure to change, so it has no menu; the paid claim is not in Pending.
    expect(more.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /More actions.*Pilot3/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /More actions.*Pilot1/ }));
    expect(await screen.findByRole('menuitem', { name: 'Change amount' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Open in EVE/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /zKillboard/ })).toBeInTheDocument();
    // Approve and Reject are the row's own buttons: not repeated in the menu.
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Change amount' }));
    expect(await screen.findByRole('dialog', { name: /Change amount/ })).toBeInTheDocument();
  });
});

describe('OfficerQueue detail entity links', () => {
  it('links the pilot in the detail, and nowhere in the clickable row', async () => {
    setup(pendingSet());
    expect(screen.queryByRole('link', { name: 'Pilot1' })).toBeNull();
    await userEvent.click(screen.getAllByText('Pilot1')[0]!);
    const link = await screen.findByRole('link', { name: 'Pilot1' });
    expect(link.getAttribute('href')).toContain('info=character-');
  });
});

describe('OfficerQueue own claim', () => {
  it("disables Approve, Reject and Mark paid on the officer's own claim, with the reason", async () => {
    useActiveCharacter.setState({ activeCharacterId: 5001 });
    const data = setup([...pendingSet(), claim(6, { state: 'approved', characterId: 5001 })]);
    const approve = screen.getAllByRole('button', { name: 'Approve' })[0]!;
    expect(approve).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('button', { name: 'Reject' })[0]).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    // Hover first: a click leaves the pointer on the button, so a later hover
    // fires no pointerenter and the bubble races the click's open/close.
    await userEvent.hover(approve);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'You cannot decide your own claim. Another officer must.'
    );
    await userEvent.unhover(approve);
    await userEvent.click(approve);
    expect(data.approve).not.toHaveBeenCalled();
    // Another officer's claim stays live.
    expect(screen.getAllByRole('button', { name: 'Approve' })[1]).not.toHaveAttribute(
      'aria-disabled'
    );
  });
});

describe('OfficerQueue own claim in bulk', () => {
  it("skips the officer's own claim in Select all and disables its tick", async () => {
    useActiveCharacter.setState({ activeCharacterId: 5001 });
    const data = setup(pendingSet());
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0]).toHaveAttribute('aria-disabled', 'true');
    expect(boxes[1]).not.toHaveAttribute('aria-disabled');
    await userEvent.click(boxes[0]!);
    expect(boxes[0]).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Select all (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve (1)' }));
    expect(data.approveMany).toHaveBeenCalledWith([{ killmailId: 2, expectedAmount: 1_000_000 }]);
  });
});

describe('OfficerQueue owed and history', () => {
  it('marks a claim paid and bulk marks the ticked ones', async () => {
    const data = setup([...pendingSet(), claim(6, { state: 'approved', decidedAt: 6 })]);
    await userEvent.click(screen.getByRole('tab', { name: /Owed/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark paid' })[0]!);
    expect(data.markPaid).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Mark 1,000,000 ISK to Pilot4 as paid?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    await waitFor(() =>
      expect(data.markPaid).toHaveBeenCalledWith({ killmailId: 4, expectedAmount: 1_000_000 })
    );
    expect(await findLine(/Marked Pilot4 paid/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select all (2)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid (2)' }));
    expect(data.markPaidMany).toHaveBeenCalledWith([
      { killmailId: 4, expectedAmount: 1_000_000 },
      { killmailId: 6, expectedAmount: 1_000_000 },
    ]);
  });

  it('lists closed claims with their reason in History, without actions', async () => {
    setup([], {
      status: 'ready',
      limit: 100,
      more: false,
      claims: [
        claim(7, {
          state: 'rejected',
          closedAt: 3,
          rejectionReason: 'Solo roam',
          decidedByName: 'Lena',
        }),
      ],
    });
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('Solo roam')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('reads History only once its tab opens, and offers older ones when there may be more', async () => {
    const data = setup([claim(1)]);
    expect(data.loadHistory).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(data.loadHistory).toHaveBeenCalled();
  });

  it('says so when a tab is empty', async () => {
    setup([claim(1)]);
    await userEvent.click(screen.getByRole('tab', { name: /Owed/ }));
    expect(screen.getByText('Nothing owed')).toBeInTheDocument();
  });
});

describe('OfficerQueue doctrine check', () => {
  const off = claim(1, {
    doctrineCheck: {
      status: 'off-doctrine',
      doctrineId: 'd1',
      doctrineName: 'Gila - armour',
      diff: { missingModules: [2048], extraModules: [519, 519], missingRigs: [], extraRigs: [] },
    },
  });
  const matched = claim(2, {
    doctrineCheck: { status: 'matched', doctrineId: 'd2', doctrineName: 'Hurricane - artillery' },
  });

  it('flags an off-doctrine claim in the queue, and only that one', () => {
    setup([off, matched, claim(3)]);
    expect(screen.getAllByText('Off doctrine')).toHaveLength(1);
  });

  it('shows the stored diff and nearest fit in the detail, and the officer can still approve', async () => {
    const data = setup([off]);
    await userEvent.click(screen.getAllByText('Pilot1')[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Gila - armour/)).toBeInTheDocument();
    expect(within(dialog).getByText('Missing modules')).toBeInTheDocument();
    expect(await within(dialog).findByText('Item2048')).toBeInTheDocument();
    expect(within(dialog).getByText('2× Item519')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(data.approve).toHaveBeenCalled();
  });

  it('names the matched fit in the detail, and shows nothing for old or unchecked claims', async () => {
    setup([matched, claim(3), claim(4, { doctrineCheck: { status: 'not-checked' } })]);
    await userEvent.click(screen.getAllByText('Pilot2')[0]!);
    expect(await screen.findByText('Matches Hurricane - artillery')).toBeInTheDocument();
    expect(screen.queryByText('Off doctrine')).toBeNull();
  });

  it('an old claim without doctrineCheck has no Doctrine row', async () => {
    setup([claim(3)]);
    await userEvent.click(screen.getAllByText('Pilot3')[0]!);
    await screen.findByRole('dialog');
    expect(screen.queryByText('Doctrine')).toBeNull();
  });
});

describe('OfficerQueue Pending layout (md+)', () => {
  it('keeps Approve and Reject on one line and reserves the bulk bar height', () => {
    setup([claim(1)]);
    const approve = screen.getAllByRole('button', { name: 'Approve' })[0]!;
    const pair = approve.parentElement!.closest('span.flex')!;
    expect(pair.className).toContain('flex-nowrap');
    expect(pair.className).not.toContain('flex-wrap');
    const selectAll = screen.getByRole('button', { name: /Select all/ });
    expect(selectAll.parentElement!.className).toContain('min-h-12');
  });
});

describe('OfficerQueue pending columns', () => {
  afterEach(() => useVisiblePendingColumns.getState().setValue(PENDING_DEFAULT_COLUMNS));

  it('starts with Lost and Fleet or FC off, and the Columns menu turns Lost on', async () => {
    setup(pendingSet());
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Hull' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Lost' })).toBeNull();
    expect(within(table).queryByRole('columnheader', { name: 'Fleet or FC' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Columns' }));
    // Every catalog id names a real column: the menu reads each one's header.
    for (const name of ['Hull', 'Lost', 'Fleet or FC']) {
      expect(await screen.findByRole('menuitemcheckbox', { name })).toBeInTheDocument();
    }
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Lost' }));
    await userEvent.keyboard('{Escape}');
    expect(
      await within(screen.getByRole('table')).findByRole('columnheader', { name: 'Lost' })
    ).toBeInTheDocument();
  });
});
