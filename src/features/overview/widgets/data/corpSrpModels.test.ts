import { describe, expect, it } from 'vitest';
import type { SrpClaimRow } from '@/features/corp/srpClaims';
import { corpSrp } from './corpSrpModels';
import type { CorpSrpFeed } from './corpFeeds';
import type { BuildContext, FeedState, Feeds } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = { t, now: 0, range: 30, activeCharacterId: 1 } as unknown as BuildContext;
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const claim = (id: number, over: Partial<SrpClaimRow> = {}): SrpClaimRow => ({
  killmailId: id,
  state: 'pending',
  amount: 1_000_000,
  characterName: `Pilot ${id}`,
  hullTypeId: 587,
  solarSystemId: 30000142,
  filedAt: id,
  ...over,
});

const feeds = (claims: SrpClaimRow[], over: Partial<CorpSrpFeed> = {}): Feeds => ({
  corpSrp: ok<CorpSrpFeed>({
    readable: true,
    needsReauth: false,
    fetchedAt: new Date(0),
    fromCache: false,
    enabled: true,
    canSetUp: false,
    claims,
    typeNames: new Map([[587, 'Rifter']]),
    systemNames: new Map([[30000142, 'Jita']]),
    ...over,
  }),
});

describe('corpSrp builder', () => {
  it('counts Pending claims and sums Approved ISK as owed', () => {
    const v = corpSrp(
      feeds([
        claim(1),
        claim(2),
        claim(3, { state: 'approved', amount: 5_000_000 }),
        claim(4, { state: 'approved', amount: null }),
      ]),
      ctx
    );
    expect(v.number.value).toBe('2');
    expect(v.number.secondary?.text).toContain('"amount":"5,000,000 overview.isk"');
    expect(v.number.link).toEqual({ label: 'overview.widgets.corpSrp.review', to: '/corp/srp' });
    expect(v.to).toBe('/corp/srp');
  });

  it('lists Pending first, oldest first, then Approved; rows lead to the SRP page', () => {
    const v = corpSrp(
      feeds([claim(5, { state: 'approved' }), claim(2), claim(1, { filedAt: 9 })]),
      ctx
    );
    expect(v.table!.rows.map((r) => r.key)).toEqual(['2', '1', '5']);
    expect(v.table!.rows.every((r) => r.to === '/corp/srp')).toBe(true);
    expect(v.table!.columns.map((c) => c.key)).toEqual(['pilot', 'kill', 'amount', 'status']);
    expect(v.table!.footer).toContain('overview.widgets.corpSrp.footer');
  });

  it('reads an ISK cell as the exact amount, and a missing amount as unknown', () => {
    const v = corpSrp(feeds([claim(1), claim(2, { amount: null })]), ctx);
    const [a, b] = v.table!.rows.map((r) => r.cells[2]);
    expect(a).toMatchObject({ iskAmount: 1_000_000 });
    expect(b).toBe('—');
  });

  it('names the killmail by hull and system, falling back to its id', () => {
    const v = corpSrp(feeds([claim(1), claim(2, { hullTypeId: null, solarSystemId: null })]), ctx);
    expect(v.table!.rows[0]!.cells[1]).toBe('Rifter, Jita');
    expect(v.table!.rows[1]!.cells[1]).toBe('#2');
  });

  it('tones Pending as caution and leaves Approved plain', () => {
    const v = corpSrp(feeds([claim(1), claim(2, { state: 'approved' })]), ctx);
    expect(v.table!.rows[0]!.cells[3]).toMatchObject({ tone: 'caution' });
    expect(v.table!.rows[1]!.cells[3]).toBe('overview.widgets.corpSrp.status.approved');
  });

  it('is the empty state with Open SRP when SRP is on and nothing is open', () => {
    const v = corpSrp(feeds([]), ctx);
    expect(v.status.isEmpty).toBe(true);
    expect(v.emptyLinkLabel).toBe('overview.widgets.corpSrp.open');
    expect(v.to).toBe('/corp/srp');
  });

  it('offers Set up SRP to a Director when SRP is off, and nothing to link for others', () => {
    const dir = corpSrp(feeds([], { enabled: false, canSetUp: true }), ctx);
    expect(dir.status.isEmpty).toBe(true);
    expect(dir.emptyMessage).toBe('overview.widgets.corpSrp.off');
    expect(dir.emptyLinkLabel).toBe('overview.widgets.corpSrp.setUp');
    expect(dir.to).toBe('/corp/srp');
    const other = corpSrp(feeds([], { enabled: false, canSetUp: false }), ctx);
    expect(other.emptyLinkLabel).toBeUndefined();
    expect(other.emptyHint).toBe('overview.widgets.corpSrp.offHintOfficer');
    expect(other.to).toBeNull();
  });

  it('is blank while loading and unreadable without access', () => {
    expect(
      corpSrp({ corpSrp: { data: null, error: false, loading: true } }, ctx).status.loading
    ).toBe(true);
    const v = corpSrp(feeds([], { readable: false }), ctx);
    expect(v.emptyMessage).toBe('overview.board.corpUnreadable');
  });
});
