/**
 * Registry invariants: facts that used to live in separate hand-kept lists
 * (catalogue, scope set, source switch, view key) must agree because they are
 * read from one declaration each. A drift here fails a test, not a widget.
 */
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { WIDGET_KINDS, getKind, isAddable, type WidgetKindDef } from '../kinds';
import { sampleView } from '../gallerySamples';
import { OPENS_ON_ALL, seedKind } from '../layout';
import { BASE_KINDS, ROLES } from '../roles';
import { CORP_DEFS } from './corpModels';
import { FEED_SOURCES } from './feedSources';
import {
  allKindIds,
  ensureBuilders,
  feedsOf,
  kindDef,
  kindSumsAcrossCharacters,
  registerKindDefs,
  buildView,
} from './models';
import { VIEW_SETTINGS, settingsContext, viewKey, type ViewRequest } from './viewSettings';
import type { FeedId } from './types';

registerKindDefs(CORP_DEFS);

const FEED_IDS = Object.keys(FEED_SOURCES) as FeedId[];

describe('feeds and sources', () => {
  it('gives every feed a source, and every source is read by some kind', () => {
    const read = new Set<FeedId>();
    for (const kind of allKindIds()) for (const feed of feedsOf(kind) ?? []) read.add(feed);
    for (const feed of read) expect(FEED_IDS, feed).toContain(feed);
    for (const feed of FEED_IDS) expect(read, `${feed} is never read`).toContain(feed);
  });

  it('declares a loader and a cache key on every snapshot source', () => {
    for (const feed of FEED_IDS) {
      const source = FEED_SOURCES[feed];
      if (source.type === 'snapshot') {
        expect(typeof source.load, feed).toBe('function');
        expect(source.cacheKey, feed).toMatch(/^(overview|corp):/);
      }
    }
  });

  it('keeps cache keys unique, so no two reads share a restored row', () => {
    const keys = FEED_IDS.flatMap((feed) => {
      const source = FEED_SOURCES[feed];
      return source.type === 'snapshot' ? [source.cacheKey] : [];
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('kind declarations', () => {
  it('declares a scope on every kind, and gives every kind but the clock a feed', () => {
    for (const kind of allKindIds()) {
      const def = kindDef(kind)!;
      expect(['character', 'account'], kind).toContain(def.scope);
      if (kind !== 'eveTime') expect(def.feeds.length, kind).toBeGreaterThan(0);
    }
  });

  it('has a declaration for every built kind and a catalogue entry for every declaration', () => {
    for (const k of WIDGET_KINDS) {
      if (k.availability === 'available') expect(kindDef(k.id), k.id).toBeDefined();
    }
    for (const kind of allKindIds()) expect(getKind(kind), kind).toBeDefined();
  });

  it('sums across Characters exactly where the declaration says so', () => {
    for (const kind of allKindIds()) {
      expect(kindSumsAcrossCharacters(kind), kind).toBe(kindDef(kind)!.scope === 'account');
    }
    expect(kindSumsAcrossCharacters('fromTheFuture')).toBe(false);
  });

  it('never opens a new widget on All unless its kind can sum', () => {
    for (const kind of OPENS_ON_ALL) expect(kindSumsAcrossCharacters(kind), kind).toBe(true);
  });

  it('draws every kind a role or the base set brings, and each has a gallery preview', () => {
    const t = ((key: string) => key) as unknown as TFunction;
    const kinds = new Set([...BASE_KINDS, ...Object.values(ROLES).flat().map(seedKind)]);
    for (const kind of kinds) {
      expect(isAddable(kind), kind).toBe(true);
      expect(kindDef(kind), kind).toBeDefined();
    }
    for (const k of WIDGET_KINDS) {
      if (k.availability === 'available' && k.boards.overview) {
        expect(sampleView(k.id, t), `${k.id} has no Gallery preview`).toBeDefined();
      }
    }
  });

  it('answers an unknown kind with an empty placeholder, never a throw', () => {
    const view = buildView(
      'fromTheFuture',
      {},
      {
        t: (k) => k,
        now: 0,
        activeCharacterId: null,
        scopeAll: false,
        notTrainingAlert: false,
        range: 30,
      }
    );
    expect(view.status.isEmpty).toBe(true);
  });

  it('loads a lazy builder through the registry, never from a loader', async () => {
    expect(kindDef('sovRaids')!.loadBuild).toBeTypeOf('function');
    const ctx = {
      t: (k: string) => k,
      now: 0,
      activeCharacterId: null,
      scopeAll: false,
      notTrainingAlert: false,
      range: 30 as const,
    };
    const before = buildView('sovRaids', {}, ctx);
    await ensureBuilders(['sovRaids', 'wallet']);
    expect(buildView('sovRaids', {}, ctx)).not.toBe(before);
  });
});

type Variant = ViewRequest | ((kind: WidgetKindDef) => ViewRequest);
const ALT: Record<keyof typeof VIEW_SETTINGS, Variant[]> = {
  range: [
    { kind: '', scopeAll: false, range: 7 },
    { kind: '', scopeAll: false, range: 90 },
  ],
  plexPlan: [{ kind: '', scopeAll: false, plexPer30Days: 1000 }],
  calendarEvents: [{ kind: '', scopeAll: false, calendarEvents: 'all' }],
  raids: [
    { kind: '', scopeAll: false, raidsWhere: 'near' },
    { kind: '', scopeAll: false, raidsWhere: 'near', raidsRadius: 15 },
  ],
  profitSource: [
    { kind: '', scopeAll: false, profitSource: 'trading' },
    { kind: '', scopeAll: false, profitSource: 'both' },
  ],
  // Each kind's own second Show: the options differ by kind.
  show: [(k) => ({ kind: '', scopeAll: false, show: k.shows[1] })],
  trend: [
    { kind: '', scopeAll: false, trendItems: [34] },
    { kind: '', scopeAll: false, trendHubs: ['amarr'] },
  ],
};

describe('view key', () => {
  it('changes with every setting a kind declares, so two widgets never share a view', () => {
    for (const [setting, variants] of Object.entries(ALT)) {
      const spec = VIEW_SETTINGS[setting as keyof typeof VIEW_SETTINGS];
      const kinds = WIDGET_KINDS.filter((k) => spec.enabledFor(k));
      expect(kinds.length, setting).toBeGreaterThan(0);
      for (const k of kinds) {
        const base = viewKey({ kind: k.id, scopeAll: false });
        for (const variant of variants) {
          const request = typeof variant === 'function' ? variant(k) : variant;
          expect(viewKey({ ...request, kind: k.id }), `${k.id} ${setting}`).not.toBe(base);
        }
      }
    }
  });

  it('ignores a setting the kind does not declare', () => {
    const plain = WIDGET_KINDS.find(
      (k) =>
        !k.hasRange &&
        !k.hasPlexPlan &&
        !k.hasCalendarEvents &&
        !k.hasRaidsWhere &&
        !k.hasProfitSource &&
        !k.hasTrendSources &&
        k.shows.length === 0
    )!;
    const base = viewKey({ kind: plain.id, scopeAll: false });
    for (const variants of Object.values(ALT)) {
      for (const v of variants) {
        const request = typeof v === 'function' ? v(plain) : v;
        expect(viewKey({ ...request, kind: plain.id })).toBe(base);
      }
    }
  });

  it('treats the default value and an absent one as the same view', () => {
    expect(viewKey({ kind: 'wallet', scopeAll: false })).toBe(
      viewKey({ kind: 'wallet', scopeAll: false, range: 30 })
    );
    expect(viewKey({ kind: 'sovRaids', scopeAll: false })).toBe(
      viewKey({ kind: 'sovRaids', scopeAll: false, raidsRadius: 15 })
    );
    // A Profit widget saved before the Source setting is a Builds one.
    expect(viewKey({ kind: 'profit', scopeAll: false })).toBe(
      viewKey({ kind: 'profit', scopeAll: false, profitSource: 'builds' })
    );
  });

  it("hands the builder the kind's default Show for a missing or unknown one", () => {
    expect(settingsContext('wallet', {}).show).toBe('balance');
    expect(settingsContext('wallet', { show: 'flow' }).show).toBe('flow');
    expect(settingsContext('wallet', { show: 'sources' }).show).toBe('balance');
    expect(settingsContext('corpWallet', {}).show).toBe('divisions');
    expect(settingsContext('orders', { show: 'flow' }).show).toBeUndefined();
    expect(viewKey({ kind: 'wallet', scopeAll: false, show: 'balance' })).toBe(
      viewKey({ kind: 'wallet', scopeAll: false })
    );
  });

  it('separates a scope-all widget from a header one', () => {
    expect(viewKey({ kind: 'orders', scopeAll: true })).not.toBe(
      viewKey({ kind: 'orders', scopeAll: false })
    );
  });
});
