import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { CorpOverlapNotice } from './CorpOverlapNotice';
import { readOverlapAcks } from './overlapAck';

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

  it('names the clashing entry, where the book recorded it, and when it resolves', () => {
    renderConflict();
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent('Your entry: Ashfall · 500 ISK · owed');
    expect(region).toHaveTextContent("Brass Meridian's book: recorded it at Efa - Ore Works");
    expect(region).toHaveTextContent('Left alone, it goes to Brass Meridian on 2026-11-12.');
    expect(region).toHaveTextContent(
      "The ore was Ashfall's: ask a Brass Meridian officer to correct the book."
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

  it('asks to unmark a paid entry first, and unmarks it', async () => {
    const paid = { ...assignment, status: 'paid' } as MiningTaxAssignmentRecord;
    await db.miningTaxAssignments.put(paid);
    let changed = 0;
    renderConflict(
      paid,
      { ...conflict, overlap: { ...view.overlap!, paid: true } },
      () => changed++
    );
    const region = screen.getByRole('region', { name: 'Conflict' });
    expect(region).toHaveTextContent('Your entry: Ashfall · 500 ISK · marked paid');
    expect(region).toHaveTextContent(
      "The ore was Brass Meridian's: unmark your payment, then take it off your entry."
    );
    expect(screen.queryByRole('button', { name: 'Let the corporation bill it' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /mark as unpaid/i }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a1'))?.status).toBe('outstanding');
  });

  it('still explains the conflict after "I paid it another way" was said for the day', async () => {
    renderNotice();
    await userEvent.click(await screen.findByRole('button', { name: 'I paid it another way' }));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    renderConflict();
    expect(screen.getByRole('region', { name: 'Conflict' })).toBeInTheDocument();
  });

  it('says another Payee holds the ore when no entry of yours matches', () => {
    renderConflict(assignment, { ...conflict, overlap: undefined });
    expect(screen.getByRole('region', { name: 'Conflict' })).toHaveTextContent(
      'Your entry: gives this ore to another Payee'
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
