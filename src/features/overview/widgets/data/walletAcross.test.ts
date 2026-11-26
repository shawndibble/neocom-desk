import { describe, expect, it } from 'vitest';
import { feedsOf, kindSumsAcrossCharacters } from './models';
import { buildView } from './models';
import type { BuildContext, FeedState } from './types';
import type { WalletAllData } from './kindLoaders';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const character = (id: number, balance: number | null, needsReauth = false) => ({
  characterId: id,
  name: `Pilot ${id}`,
  balance,
  needsReauth,
  fetchedAt: balance === null ? null : NOW - id,
  fromCache: false,
});

describe('Wallet across every Character', () => {
  it('sums across Characters and reads its own feeds when scoped to All', () => {
    expect(kindSumsAcrossCharacters('wallet')).toBe(true);
    expect(feedsOf('wallet', undefined, true)).toEqual(['walletAll', 'journalAll']);
    expect(feedsOf('wallet')).toEqual(['wallet', 'journal']);
    expect(feedsOf('wallet', { show: 'balance' }, true)).toEqual(['walletAll']);
    expect(feedsOf('wallet', { show: 'flow' }, true)).toEqual(['journalAll']);
  });

  it('adds the balances, largest first, and counts the Characters it could not read', () => {
    const data: WalletAllData = {
      characters: [character(1, 100), character(2, 300), character(3, null, true)],
      skippedCount: 1,
    };
    const view = buildView('wallet', { walletAll: ok(data) }, ctx());
    expect(view.number.iskAmount).toBe(400);
    expect(view.rows.map((r) => r.title)).toEqual(['Pilot 2', 'Pilot 1']);
    expect(view.number.notes).toEqual(['overview.widgets.wallet.across.missing{"count":2}']);
    expect(view.table?.rows).toHaveLength(2);
    expect(view.fetchedAt).toEqual(new Date(NOW - 2));
  });

  it('asks for permission when no Character could be read and one lapsed', () => {
    const data: WalletAllData = { characters: [character(1, null, true)], skippedCount: 0 };
    const view = buildView('wallet', { walletAll: ok(data) }, ctx());
    expect(view.status.needsPermission).toBe(true);
  });

  it("keeps the header Character's read when the widget is not on All", () => {
    const view = buildView(
      'wallet',
      {
        wallet: ok({
          result: { data: 50, fetchedAt: new Date(NOW), fromCache: false, truncated: false },
          needsReauth: false,
        }),
      },
      ctx({ scopeAll: false })
    );
    expect(view.number.iskAmount).toBe(50);
  });

  it('draws Flow from the merged journal when on All', () => {
    const entry = (id: number, amount: number) => ({
      id,
      amount,
      balance: 0,
      date: '2026-10-10T00:00:00Z',
      ref_type: 'bounty_prize',
    });
    const journalAll = ok({
      result: {
        data: [entry(1, 100), entry(2, 50)],
        fetchedAt: new Date(NOW),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    const view = buildView('wallet', { journalAll } as never, ctx({ show: 'flow' }));
    expect(view.number.iskAmount).toBe(150);
  });
});
