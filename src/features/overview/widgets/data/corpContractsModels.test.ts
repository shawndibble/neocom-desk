import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { withAcceptedCourierInProgress } from '@/engine/contracts/contractStatus';
import { corpContracts } from './corpContractsModels';
import type { CorpContractsFeed } from './corpFeeds';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ctx = { t, now: NOW, range: 30, activeCharacterId: 1 } as unknown as BuildContext;
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const contract = (id: number, over: Partial<Contract> = {}): Contract => ({
  contract_id: id,
  issuer_id: 1,
  issuer_corporation_id: 9,
  assignee_id: 9,
  acceptor_id: 0,
  type: 'courier',
  status: 'outstanding',
  for_corporation: true,
  availability: 'personal',
  date_issued: iso(NOW - 24 * HOUR),
  date_expired: iso(NOW + 72 * HOUR),
  ...over,
});

/** An accepted courier as ESI sends it: still `outstanding`, with an acceptor, read once as the loader does. */
const accepted = (id: number, over: Partial<Contract> = {}): Contract =>
  withAcceptedCourierInProgress(
    contract(id, { acceptor_id: 555, date_accepted: iso(NOW), ...over })
  );

const feed = (contracts: Contract[], over: Partial<CorpContractsFeed> = {}): Feeds => ({
  corpContracts: ok<CorpContractsFeed>({
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(NOW),
    fromCache: false,
    contracts,
    names: new Map([
      [1, 'Efa Astrahus'],
      [9, 'Efa Corp'],
    ]),
    ...over,
  }),
});

describe('corpContracts', () => {
  it('is blank while the feed is missing, and unreadable keeps its own message', () => {
    expect(corpContracts({}, ctx).status.hasData).toBe(false);
    const view = corpContracts(feed([], { readable: false, needsReauth: true }), ctx);
    expect(view.status.needsPermission).toBe(true);
    expect(view.emptyMessage).toBe('overview.board.corpUnreadable');
  });

  it('links its title to the Contracts page Corp view', () => {
    expect(corpContracts(feed([contract(1)]), ctx).to).toBe('/contracts/history?scope=corp');
    expect(corpContracts(feed([], { readable: false }), ctx).to).toBe(
      '/contracts/history?scope=corp'
    );
  });

  it('counts outstanding, flags expiring soon and totals courier collateral', () => {
    const view = corpContracts(
      feed([
        contract(1, { collateral: 2_000_000, date_expired: iso(NOW + 5 * HOUR) }),
        contract(2, { type: 'item_exchange', price: 10 }),
        contract(3, { status: 'finished' }),
      ]),
      ctx
    );
    expect(view.number.value).toBe('2');
    expect(view.number.tone).toBe('warning');
    expect(view.number.secondary?.text).toBe(
      'overview.widgets.corpContracts.expiringSoon{"count":1}'
    );
    expect(view.number.notes?.[0]).toContain('2M');
    expect(view.status.isEmpty).toBe(false);
  });

  it('lists soonest first with issuer, assignee, collateral and a clock', () => {
    const view = corpContracts(
      feed([
        contract(2, { title: 'Stock' }),
        contract(1, { collateral: 5_000_000, date_expired: iso(NOW + 5 * HOUR) }),
      ]),
      ctx
    );
    const rows = view.table!.rows;
    expect(rows.map((r) => r.key)).toEqual(['1', '2']);
    expect(rows[0]!.cells[0]).toContain('"id":1');
    expect(rows[0]!.cells[1]).toBe('5h 0m');
    expect(rows[0]!.cells.slice(3, 5)).toEqual(['Efa Astrahus', 'Efa Corp']);
    expect(rows[0]!.cells[5]).toMatchObject({ iskAmount: 5_000_000 });
    expect(rows[1]!.cells[0]).toBe('Stock');
    expect(rows[1]!.cells[5]).toBe('—');
  });

  it('draws no countdown finer than the 300 s cache window, and marks an overdue haul', () => {
    const view = corpContracts(
      feed([
        contract(1, { date_expired: iso(NOW + 120_000) }),
        accepted(2, {
          days_to_complete: 1,
          date_accepted: iso(NOW - 48 * HOUR),
        }),
      ]),
      ctx
    );
    const cells = view.table!.rows.map((r) => r.cells[1]);
    expect(cells).toEqual([
      'overview.widgets.corpContracts.overdue',
      'overview.widgets.corpContracts.underCache',
    ]);
    expect(view.number.tone).toBe('critical');
  });

  it('is empty when nothing is outstanding', () => {
    const view = corpContracts(feed([contract(1, { status: 'finished' })]), ctx);
    expect(view.status.isEmpty).toBe(true);
    expect(view.number.value).toBe('0');
  });
});
