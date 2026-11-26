import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { CorpOverlapNotice } from './CorpOverlapNotice';
import { readOverlapAcks } from './overlapAck';
import { disputeCorpTaxBookConflict } from './corpBookStore';
import { sendTaxQuestionMail } from './sendTaxQuestionMail';

vi.mock('./sendTaxQuestionMail', () => ({
  sendTaxQuestionMail: vi.fn(async () => ({ status: 'no-scope' })),
}));

// #6206: what reaches the corporation is a router action; stubbed here.
vi.mock('./corpBookStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./corpBookStore')>()),
  declareCorpTaxBookPayment: vi.fn(async () => ({ declarationId: 'x1' })),
  disputeCorpTaxBookConflict: vi.fn(async () => ({ disputeId: 'd1' })),
}));

// Releasing ore re-prices what is left; the market read is stubbed.
vi.mock('../pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pricing')>()),
  loadUnitPricesOnDate: vi.fn(async () => ({
    prices: new Map([[45490, 1]]),
    unpriced: new Set<number>(),
  })),
}));

const ZEO = 45490;
const ME = 1;

const assignment: MiningTaxAssignmentRecord = {
  id: 'a1',
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  payeeId: 'p1',
  oreLines: [{ typeId: ZEO, quantity: 50_000 }],
  taxPct: 10,
  estimatedValue: 5_000,
  taxOwed: 500,
  status: 'outstanding',
  updatedAt: 1,
};
const payee = { id: 'p1', characterId: ME, name: 'Ashfall' } as PayeeRecord;

const view = {
  id: 'v',
  corporationId: 98000001,
  corpName: 'Brass Meridian',
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  overlap: { payeeIds: ['p1'], ore: [{ typeId: ZEO, quantity: 43_050 }], paid: false },
} as BookRowView;

const renderNotice = (v: BookRowView = view, onChanged = () => {}) =>
  render(
    <CorpOverlapNotice
      view={v}
      corpName="Brass Meridian"
      recordedAt="Efa"
      everyAssignment={[assignment]}
      payeeById={new Map([['p1', payee]])}
      typeNames={new Map([[ZEO, 'Zeolites']])}
      onChanged={onChanged}
    />
  );

beforeEach(async () => {
  await db.miningTaxAssignments.clear();
  await db.settings.clear();
  await db.miningTaxAssignments.put(assignment);
});

describe('CorpOverlapNotice', () => {
  it('renders nothing without an overlap', () => {
    const { container } = renderNotice({ ...view, overlap: undefined });
    expect(container.textContent).toBe('');
  });

  it('removes only the overlapping ore from the miner entry', async () => {
    let changed = 0;
    renderNotice(view, () => changed++);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Let the corporation bill it' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 6_950 },
    ]);
  });

  it('remembers "I paid it another way" and stops asking', async () => {
    renderNotice();
    await userEvent.click(await screen.findByRole('button', { name: 'I paid it another way' }));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect([...(await readOverlapAcks())]).toEqual(['98000001:1:2026-10-17:30003838']);
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toHaveLength(1);
  });
});

describe('CorpOverlapNotice on a Conflict day', () => {
  const conflict = {
    ...view,
    state: 'conflict',
    conflictCause: 'otherPayee',
    billed: 319_000,
    resolvesAt: '2026-11-12T11:00:00.000Z',
  } as BookRowView;
  const renderConflict = (
    entry: MiningTaxAssignmentRecord = assignment,
    v: BookRowView = conflict,
    onChanged = () => {}
  ) =>
    render(
      <CorpOverlapNotice
        view={v}
        corpName="Brass Meridian"
        recordedAt="Efa - Ore Works"
        everyAssignment={[entry]}
        payeeById={new Map([['p1', payee]])}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onChanged={onChanged}
      />
    );

  it('names the clashing entry and where the book recorded it', () => {
    renderConflict();
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent('Your entry gives this ore to another Payee');
    expect(region).toHaveTextContent('Your entry: Ashfall · 500 ISK · owed');
    expect(region).toHaveTextContent("Brass Meridian's book: recorded it at Efa - Ore Works");
    expect(region).toHaveTextContent(
      'If your entry is right: tell Brass Meridian, and its officers correct the book or keep the bill and say what to do next.'
    );
  });

  it('takes the ore off an owed entry when the book is right', async () => {
    let changed = 0;
    renderConflict(assignment, conflict, () => changed++);
    await userEvent.click(screen.getByRole('button', { name: 'Let the corporation bill it' }));
    expect(screen.getByText(/Ashfall: 50,000 Zeolites → 6,950 Zeolites/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 6_950 },
    ]);
  });

  it("lets the book take a paid entry's ore too: what was paid becomes credit there", () => {
    const paid = { ...assignment, status: 'paid' } as MiningTaxAssignmentRecord;
    renderConflict(paid, { ...conflict, overlap: { ...view.overlap!, paid: true } });
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent('Your entry: Ashfall · 500 ISK · paid');
    expect(region).toHaveTextContent('If the book is right: take this ore off your entry.');
    expect(screen.getByRole('button', { name: 'Let the corporation bill it' })).toBeInTheDocument();
  });

  it('still explains the conflict after "I paid it another way" was said for the day', async () => {
    renderNotice();
    await userEvent.click(await screen.findByRole('button', { name: 'I paid it another way' }));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    renderConflict();
    expect(screen.getByRole('region', { name: 'Conflict' })).toBeInTheDocument();
  });

  it('names an own entry for the corporation that needs review, not another Payee', () => {
    renderConflict(assignment, { ...conflict, conflictCause: 'ownNeedsReview' });
    expect(screen.getByRole('region', { name: 'Conflict' })).toHaveTextContent(
      'Your own entry for Brass Meridian needs review'
    );
  });

  it("says a Collector now collects for the moon owner the miner's entry names", () => {
    renderConflict(assignment, {
      ...conflict,
      conflictCause: 'ownerCollected',
      ownerPayeeId: 'p1',
    });
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent("Brass Meridian now collects tax for Ashfall's moon");
    expect(region).toHaveTextContent(
      'If you already paid Ashfall, Resolve it: it tells Brass Meridian where the ore went.'
    );
  });

  it('takes what each corporation recorded off the entry in one go when several books contest the day', async () => {
    const second = {
      ...conflict,
      corporationId: 98000002,
      corpName: 'Ashfall Prospecting',
      billed: 120_000,
      overlap: { payeeIds: ['p1'], ore: [{ typeId: ZEO, quantity: 5_000 }], paid: false },
    } as BookRowView;
    let changed = 0;
    render(
      <CorpOverlapNotice
        view={conflict}
        corpName="Brass Meridian"
        recordedAt="Efa"
        siblings={[second]}
        everyAssignment={[assignment]}
        payeeById={new Map([['p1', payee]])}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onChanged={() => changed++}
      />
    );
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent(
      'Also in conflict on this day: Ashfall Prospecting (120,000 ISK).'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Let each corp bill its share' }));
    // 43,050 for this book and 5,000 for the other come off the 50,000 entry.
    expect(screen.getByText(/Ashfall: 50,000 Zeolites → 1,950 Zeolites/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 1_950 },
    ]);
  });

  it("takes each corporation's share off the Payee its line names, not whichever comes first", async () => {
    const other = { ...assignment, id: 'a2', payeeId: 'p2' } as MiningTaxAssignmentRecord;
    await db.miningTaxAssignments.put(other);
    const first = {
      ...conflict,
      overlap: { payeeIds: ['p2'], ore: [{ typeId: ZEO, quantity: 10_000 }], paid: false },
    } as BookRowView;
    const second = {
      ...conflict,
      id: 'v2',
      corporationId: 98000002,
      corpName: 'Ashfall Prospecting',
      overlap: { payeeIds: ['p1'], ore: [{ typeId: ZEO, quantity: 5_000 }], paid: false },
    } as BookRowView;
    let changed = 0;
    render(
      <CorpOverlapNotice
        view={first}
        corpName="Brass Meridian"
        recordedAt="Efa"
        siblings={[second]}
        everyAssignment={[assignment, other]}
        payeeById={
          new Map([
            ['p1', payee],
            ['p2', { ...payee, id: 'p2', name: 'Cinder' }],
          ])
        }
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onChanged={() => changed++}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Let each corp bill its share' }));
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a2'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 40_000 },
    ]);
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 45_000 },
    ]);
  });

  it('says another Payee holds the ore when no entry of yours matches', () => {
    renderConflict(assignment, { ...conflict, overlap: undefined });
    expect(screen.getByRole('region', { name: 'Conflict' })).toHaveTextContent(
      'Your entry: gives this ore to another Payee'
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('CorpOverlapNotice: what reaches the corporation (#6206)', () => {
  const renderWith = (v: BookRowView, onBookChanged = () => {}, onResolve?: () => void) =>
    render(
      <CorpOverlapNotice
        mail={{
          characterId: ME,
          memberName: 'Pilot',
          corporationId: 98000001,
          corpName: 'Brass Meridian',
          contact: undefined,
        }}
        view={v}
        corpName="Brass Meridian"
        recordedAt="Efa"
        everyAssignment={[assignment]}
        payeeById={new Map([['p1', payee]])}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onChanged={() => {}}
        onBookChanged={onBookChanged}
        onResolve={onResolve}
      />
    );
  const conflict = {
    ...view,
    state: 'conflict',
    conflictCause: 'otherPayee',
    recordKey: `${ME}:1000:2026-10-17`,
    oreLines: [{ typeId: ZEO, quantity: 43_050 }],
    billed: 319_000,
  } as BookRowView;

  it('sends a Conflict day to the corporation, naming the Payee', async () => {
    let changed = 0;
    renderWith(conflict, () => changed++);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tell Brass Meridian it went to Ashfall' })
    );
    await waitFor(() => expect(changed).toBe(1));
    expect(disputeCorpTaxBookConflict).toHaveBeenCalledWith(ME, {
      corporationId: 98000001,
      date: '2026-10-17',
      lines: [
        { recordKey: `${ME}:1000:2026-10-17`, typeId: ZEO, quantity: 43_050, payeeName: 'Ashfall' },
      ],
    });
  });

  it('also mails whoever answers the corporation tax questions', async () => {
    let changed = 0;
    renderWith(conflict, () => changed++);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tell Brass Meridian it went to Ashfall' })
    );
    await waitFor(() => expect(changed).toBe(1));
    expect(sendTaxQuestionMail).toHaveBeenCalledWith(
      expect.objectContaining({
        characterId: ME,
        corporationId: 98000001,
        input: expect.objectContaining({ kind: 'notOwed', days: '2026-10-17' }),
      })
    );
  });

  it('says it was sent, or why an officer rejected it, instead of offering it again', () => {
    const { unmount } = renderWith({
      ...conflict,
      flagged: { kind: 'payee', state: 'sent', at: '2026-10-18T10:00:00.000Z' },
    });
    expect(screen.getByText(/Sent to Brass Meridian on 2026-10-18/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tell / })).toBeNull();
    unmount();
    renderWith({
      ...conflict,
      flagged: {
        kind: 'payee',
        state: 'rejected',
        at: '2026-10-19T10:00:00.000Z',
        reason: 'Our ore',
      },
    });
    expect(screen.getByText('Brass Meridian kept the bill: Our ore')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Tell / })).toBeNull();
  });

  it('says an officer waived the tax on that ore, with the reason (#6206)', () => {
    renderWith({
      ...conflict,
      flagged: {
        kind: 'payee',
        state: 'dismissed',
        at: '2026-10-19T10:00:00.000Z',
        reason: 'Their ore',
      },
    });
    expect(
      screen.getByText('Brass Meridian waived the tax on that ore: Their ore')
    ).toBeInTheDocument();
  });

  it('on a day a Late notice asked for, Resolve opens its Late notice problem', async () => {
    const onResolve = vi.fn();
    render(
      <CorpOverlapNotice
        view={{ ...view, state: 'billed', noticeId: 's1' } as BookRowView}
        corpName="Brass Meridian"
        recordedAt="Efa"
        everyAssignment={[assignment]}
        payeeById={new Map([['p1', payee]])}
        typeNames={new Map([[ZEO, 'Zeolites']])}
        onChanged={() => {}}
        onResolve={onResolve}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    expect(onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        problem: expect.objectContaining({ kind: 'overdue', noticeId: 's1' }),
      })
    );
  });

  it('shows a waiting declaration instead of the button', async () => {
    renderWith(
      {
        ...view,
        state: 'billed',
        noticeId: 's1',
        declaration: { state: 'waiting', at: '2026-10-18T10:00:00.000Z' },
      } as BookRowView,
      () => {},
      vi.fn()
    );
    expect(await screen.findByText('Declared — waiting for Brass Meridian')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
  });
});
