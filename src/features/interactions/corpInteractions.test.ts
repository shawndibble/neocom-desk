import { describe, expect, it } from 'vitest';
import type { Contract, WalletJournalEntry } from '@/esi/endpoints';
import type { KillInvolvement } from '@/lib/zkillboard';
import { bookInteractions, type BookFacts } from './corpBookInteractions';
import {
  classifyCorpKills,
  corpContractInteractions,
  corpKillInteractions,
  corpWalletInteractions,
  type CorpKill,
} from './corpOtherInteractions';
import { summarizeCorpInteractions } from './corpSummary';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key;

const book: BookFacts = {
  minerId: 'solo:7',
  standing: 'member',
  owed: 5_000_000,
  notices: [
    {
      id: 'n0',
      issuedAt: '2026-10-05T00:00:00Z',
      from: '2026-09-28',
      to: '2026-10-04',
      listed: 9_000_000,
      mailsSent: 2,
      settled: true,
    },
    {
      id: 'n1',
      issuedAt: '2026-11-02T00:00:00Z',
      from: '2026-10-26',
      to: '2026-11-01',
      listed: 5_000_000,
      mailsSent: 0,
      settled: false,
    },
  ],
  payments: [
    { id: 'j1_900', at: '2026-10-06T10:00:00Z', amount: 9_000_000, paidDays: true },
    { id: 'manual-1', at: '2026-10-08T10:00:00Z', amount: 1_000_000, paidDays: false },
  ],
  adjustments: [
    {
      id: 'a1',
      date: '2026-10-01',
      at: '2026-10-02T00:00:00Z',
      amount: -200_000,
      reason: 'refine yield',
    },
  ],
  days: [
    { date: '2026-10-01', tax: 1_000_000, settled: true },
    { date: '2026-10-01', tax: 500_000, settled: false },
    { date: '2026-10-02', tax: 0, settled: true },
  ],
};

describe('bookInteractions', () => {
  const rows = bookInteractions(book, t);
  const types = (type: string) => rows.filter((r) => r.type === type);

  it('adds a Miner-day up to one unpaid mining row', () => {
    const mining = types('interactions.type.mining');
    expect(mining).toHaveLength(1);
    expect(mining[0].state).toBe('interactions.state.unpaid');
    expect(mining[0].to).toBe('/corp/moons/miners/solo%3A7');
  });

  it('maps late notices, payments and adjustments', () => {
    expect(types('interactions.type.lateNotice').map((n) => n.state)).toEqual([
      'interactions.state.settled',
      'interactions.state.unpaid',
    ]);
    const payments = types('interactions.type.payment');
    expect(payments.map((p) => p.isk)).toEqual([9_000_000, 1_000_000]);
    expect(types('interactions.type.adjustment')).toHaveLength(1);
  });

  it('links a journal payment to the corp wallet and a hand-recorded one to the Miner page', () => {
    const [journal, manual] = types('interactions.type.payment');
    expect(journal.to).toBe('/corp/wallet?division=1&highlight=900');
    expect(manual.to).toBe('/corp/moons/miners/solo%3A7');
  });

  it('has unique ids', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe('corp wallet and contracts', () => {
  const entry = (over: Partial<WalletJournalEntry>): WalletJournalEntry => ({
    id: 1,
    date: '2026-10-10T00:00:00Z',
    ref_type: 'player_donation',
    description: '',
    amount: 100,
    first_party_id: 7,
    second_party_id: 99,
    ...over,
  });

  it('keeps rows with the player, skipping book payments and contract rows', () => {
    const out = corpWalletInteractions(
      [
        { division: 1, entry: entry({ id: 5 }) },
        { division: 1, entry: entry({ id: 900 }) },
        { division: 2, entry: entry({ id: 6, ref_type: 'contract_price' }) },
        { division: 2, entry: entry({ id: 7, first_party_id: 1, second_party_id: 2 }) },
      ],
      7,
      new Set(['j1_900']),
      t
    );
    expect(out.map((o) => o.id)).toEqual(['corp-wallet-1-5']);
    expect(out[0].to).toBe('/corp/wallet?division=1&highlight=5');
  });

  it('keeps corp contracts the player issued or accepted and opens them on corp History', () => {
    const c = (id: number, over: Partial<Contract>): Contract =>
      ({
        contract_id: id,
        issuer_id: 1,
        assignee_id: 2,
        acceptor_id: 0,
        type: 'item_exchange',
        status: 'finished',
        date_issued: '2026-10-01T00:00:00Z',
        price: 1000,
        ...over,
      }) as Contract;
    const out = corpContractInteractions(
      [c(1, { issuer_id: 7 }), c(2, {}), c(3, { acceptor_id: 7, status: 'outstanding' })],
      7,
      t
    );
    expect(out.map((o) => o.id)).toEqual(['corp-contract-1', 'corp-contract-3']);
    expect(out[0].to).toBe('/contracts/history?scope=corp&open=1');
    expect(out[1].state).toBe('interactions.state.outstanding');
  });
});

describe('corp killmails', () => {
  const inv = (id: number, victim: number | null, attackers: number[]): KillInvolvement => ({
    killmailId: id,
    timeMs: 1_000 * id,
    value: 10,
    victimCharacterId: victim,
    attackerCharacterIds: attackers,
  });
  const ours = new Set([1, 2]);

  it('splits corp losses (member died, player attacked) from corp kills (member attacked, player died)', () => {
    const out = classifyCorpKills(
      { kills: [inv(1, 1, [7]), inv(2, 50, [7])], losses: [inv(3, 7, [2, 60]), inv(4, 7, [60])] },
      (id) => ours.has(id),
      new Set([1])
    );
    expect(out.map((k) => [k.killmailId, k.side, k.srpPaid])).toEqual([
      [1, 'weLost', true],
      [3, 'weKilled', false],
    ]);
  });

  it('links to zKillboard and shows SRP paid', () => {
    const [row] = corpKillInteractions(
      [{ killmailId: 9, at: 1, side: 'weLost', value: 5, srpPaid: true }],
      t
    );
    expect(row.to).toBe('https://zkillboard.com/kill/9/');
    expect(row.state).toBe('interactions.state.srpPaid');
    expect(row.type).toBe('interactions.type.weLost');
  });
});

describe('summarizeCorpInteractions', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');
  const day = 86_400_000;
  const kill = (side: CorpKill['side'], ago: number, value: number | null): CorpKill => ({
    killmailId: ago,
    at: now - ago * day,
    side,
    value,
    srpPaid: false,
  });

  it('gives a member their book chips and no outsider chips', () => {
    const s = summarizeCorpInteractions({ book, kills: [], isMember: true, now });
    expect(s.outsider).toBeNull();
    expect(s.member).toEqual({
      owedNow: 5_000_000,
      taxPaid: 10_000_000,
      lateNotices: 2,
      memberSince: Date.parse('2026-10-01'),
    });
  });

  it('hides member chips with nothing to say', () => {
    const empty: BookFacts = { ...book, owed: 0, notices: [], payments: [], days: [] };
    expect(
      summarizeCorpInteractions({ book: empty, kills: [], isMember: true, now }).member
    ).toEqual({
      owedNow: null,
      taxPaid: null,
      lateNotices: null,
      memberSince: null,
    });
  });

  it('flags an outsider hostile only for a loss in the last 90 days', () => {
    const recent = summarizeCorpInteractions({
      book: null,
      kills: [kill('weLost', 10, 100), kill('weKilled', 5, 50)],
      isMember: false,
      now,
    });
    expect(recent.outsider).toEqual({
      hostile: true,
      ourLosses: { count: 1, isk: 100 },
      theirLosses: { count: 1, isk: 50 },
      lastHostile: now - 5 * day,
    });
    const old = summarizeCorpInteractions({
      book: null,
      kills: [kill('weLost', 200, null)],
      isMember: false,
      now,
    });
    expect(old.outsider?.hostile).toBe(false);
    expect(old.outsider?.ourLosses).toEqual({ count: 1, isk: 0 });
    expect(
      summarizeCorpInteractions({ book: null, kills: [], isMember: false, now }).outsider
    ).toEqual({
      hostile: false,
      ourLosses: null,
      theirLosses: null,
      lastHostile: null,
    });
  });
});
