/**
 * Turns a Widget Kind's raw reads into the one shape the widget shell draws
 * (`KindView`): status inputs, a headline number, list rows and the clocks it
 * offers the header chip.
 *
 * Pure: no React, Dexie or fetch. The judgements all live in the modules the
 * old board already used (`boardSeverity`, `boardSummary`, `corpCards`,
 * `incursionsBoard`, the industry/orders/calendar engines); this only picks
 * which figure leads and how each row reads. Derived at render time, never
 * inside a source's effect, so time-dependent text stays true as the clock
 * ticks and a build never invents a new object per render of a source.
 */
import { blank, failedBuilders, type Builder, type KindDef } from './builderKit';
import { ACCOUNT_DEFS } from './accountModels';
import { comingUp, sp, training } from './characterBuilders';
import { KIND_DEFS } from './kindModels';
import { WORLD_DEFS } from './worldModels';
import type { BuildContext, FeedId, Feeds, KindView } from './types';
import { settingsContext, type ViewSettings } from './viewSettings';
import type { EsiEndpointId } from '@/esi/registry';
import { getKind } from '../kinds';

// --- The kind registry --------------------------------------------------------
//
// One `KindDef` per kind (see `builderKit.ts`) is the whole declaration: feeds,
// cross-Character scope, builder and lazy builder. Everything else asks here:
// the provider for feeds, `scope.ts` and the menu for scope, `useWidgetView` for
// builders. The settings that change a view come from the catalogue
// (`viewSettings.ts`); each feed's source from `feedSources.tsx`; the invariants
// tying the tables together are `kindRegistry.test.ts`.

/**
 * Every widget kind. The Corp overview's kinds join later through `registerKindDefs`,
 * keeping their builders and copy off the Overview's startup graph; Skyhook raids'
 * builder arrives through its own `loadBuild`.
 */
const KINDS: Record<string, KindDef> = {
  ...ACCOUNT_DEFS,
  training: { feeds: ['skills'], scope: 'character', build: training },
  sp: { feeds: ['skills', 'spExtras'], scope: 'character', build: sp },
  comingUp: { feeds: ['calendar'], scope: 'character', build: comingUp },
  ...WORLD_DEFS,
  ...KIND_DEFS,
};

/** Adds or replaces kinds that load later; idempotent. */
export function registerKindDefs(defs: Readonly<Record<string, KindDef>>): void {
  Object.assign(KINDS, defs);
}

export const kindDef = (kind: string): KindDef | undefined => KINDS[kind];

export const allKindIds = (): string[] => Object.keys(KINDS);

/** A kind's feeds and scope for one widget's settings; the kind's own without settings. */
function resolved(kind: string, settings?: ViewSettings) {
  const def = KINDS[kind];
  if (!def) return undefined;
  return def.bySettings && settings ? def.bySettings(settingsContext(kind, settings)) : def;
}

/**
 * Kind -> the feeds it reads, or with a widget's settings the feeds that widget reads.
 * Undefined for a kind with no declaration (coming soon, or from a newer build).
 */
export const feedsOf = (kind: string, settings?: ViewSettings): readonly FeedId[] | undefined =>
  resolved(kind, settings)?.feeds;

/** What wants a feed: a kind, or one widget of it with its settings (`ViewSettings`). */
export type FeedReader = string | ({ kind: string } & ViewSettings);

/** The distinct feeds needed by `readers`; only these are ever fetched. */
export function feedsFor(readers: readonly FeedReader[]): FeedId[] {
  const out = new Set<FeedId>();
  for (const reader of readers) {
    const feeds = typeof reader === 'string' ? feedsOf(reader) : feedsOf(reader.kind, reader);
    for (const feed of feeds ?? []) out.add(feed);
  }
  return [...out];
}

/** The ESI endpoints a widget of `kind` needs under `settings`, for its "needs permission" state. */
export function endpointsOf(kind: string, settings?: ViewSettings): readonly EsiEndpointId[] {
  const reads = resolved(kind, settings);
  return reads && 'endpoints' in reads ? reads.endpoints : (getKind(kind)?.endpoints ?? []);
}

/** Whether the kind's read covers every Character; a widget scoped to the header Character still narrows to it in the builder. */
export function kindSumsAcrossCharacters(kind: string, settings?: ViewSettings): boolean {
  return resolved(kind, settings)?.scope === 'account';
}

// --- Lazy builders -----------------------------------------------------------

const lazyBuilders = new Map<string, Builder>();
const lazyLoads = new Map<string, Promise<void>>();
const lazyListeners = new Set<() => void>();
let lazyEpoch = 0;

/** Moves each time a lazy builder lands; a view built before then is stale. */
export const builderEpoch = (): number => lazyEpoch;

export function subscribeBuilders(listener: () => void): () => void {
  lazyListeners.add(listener);
  return () => {
    lazyListeners.delete(listener);
  };
}

/**
 * Loads the real builder of each kind that declares `loadBuild`, once. Until it
 * lands `buildView` uses the declared stand-in; views rebuild on `builderEpoch`.
 * A failed load is forgotten so the next call retries, and flagged so the stand-in shows failed meanwhile.
 */
export function ensureBuilders(kinds: readonly string[]): Promise<void> {
  const loads = kinds.flatMap((kind) => {
    const def = KINDS[kind];
    if (!def?.loadBuild || lazyBuilders.has(kind)) return [];
    let load = lazyLoads.get(kind);
    if (!load) {
      load = def.loadBuild().then(
        (build) => {
          lazyBuilders.set(kind, build);
          failedBuilders.delete(kind);
          lazyLoads.delete(kind);
          lazyEpoch += 1;
          for (const listener of lazyListeners) listener();
        },
        (error: unknown) => {
          lazyLoads.delete(kind);
          failedBuilders.add(kind);
          // Views built over the stand-in as loading are stale: they now read failed.
          lazyEpoch += 1;
          for (const listener of lazyListeners) listener();
          throw error;
        }
      );
      lazyLoads.set(kind, load);
    }
    return [load];
  });
  return Promise.all(loads).then(() => undefined);
}

/**
 * Kinds still marked coming soon in the catalogue, and kinds a newer build
 * wrote that this one has never heard of. Both read as "nothing to show yet": a
 * loading-free empty state the pilot can remove, never a spinner that would
 * not end.
 */
function placeholder(kind: string): KindView {
  return {
    ...blank(null, {
      loading: false,
      needsPermission: false,
      error: false,
      hasData: true,
      isEmpty: true,
    }),
    summary: kind,
  };
}

/** One widget kind's view of the feeds; the single seam the shell and the header read. */
export function buildView(kind: string, feeds: Feeds, ctx: BuildContext): KindView {
  const def = KINDS[kind];
  if (!def) return placeholder(kind);
  const lazy = lazyBuilders.get(kind);
  if (lazy) return zeroIsClear(lazy(feeds, ctx));
  const standIn = def.build(feeds, ctx);
  // The real builder failed to load: the stand-in's loading would never end, so it shows failed (Retry reloads it).
  if (failedBuilders.has(kind)) {
    return zeroIsClear({ ...standIn, status: { ...standIn.status, loading: false, error: true } });
  }
  return zeroIsClear(standIn);
}

/**
 * A count of zero is never a warning: "⚠ 0 Timers" contradicts itself. The
 * tone follows the figure, so a zero headline draws plain whatever a builder's
 * severity ladder said about the rest of the domain.
 */
function zeroIsClear(view: KindView): KindView {
  const { number } = view;
  if (number.value !== '0' || number.tone === 'clear') return view;
  return { ...view, number: { ...number, tone: 'clear' } };
}
