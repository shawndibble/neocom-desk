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
import { blank, type KindDef } from './builderKit';
import { ACCOUNT_DEFS } from './accountModels';
import { comingUp, sp, training } from './characterBuilders';
import { CORP_DEFS } from './corpModels';
import { KIND_DEFS } from './kindModels';
import { WORLD_DEFS } from './worldModels';
import type { BuildContext, FeedId, Feeds, KindView } from './types';

// --- Which reads a kind needs ------------------------------------------------

/** The distinct feeds needed by `kinds`; only these are ever fetched. */
export function feedsFor(kinds: readonly string[]): FeedId[] {
  const out = new Set<FeedId>();
  for (const kind of kinds) for (const feed of KIND_FEEDS[kind] ?? []) out.add(feed);
  return [...out];
}

/** Kinds whose read covers every Character; a widget scoped to the header Character still narrows to it in the builder. */
const SUMS_ACROSS = new Set([
  'miningTax',
  'stock',
  'priceWatch',
  'incursions',
  'orders',
  'netWorth',
  'miningYield',
  // One route on this device, whichever Character is the header's.
  'routeSafety',
  // Reads every tracked Character's killboard; the builder narrows to the header Character.
  'kills',
  // Every Character's journal, classified together; the builder narrows to the header Character.
  'omega',
  // Every Character's fills and journal, pooled or narrowed to the header Character in the builder.
  'tradingProfit',
  // Every Character's jobs and job slots; the builder narrows to the header Character.
  'industry',
]);

export function kindSumsAcrossCharacters(kind: string): boolean {
  return SUMS_ACROSS.has(kind);
}

/** Every widget kind: the feeds it reads and the builder that draws it. */
const KINDS: Readonly<Record<string, KindDef>> = {
  ...ACCOUNT_DEFS,
  training: { feeds: ['skills'], build: training },
  sp: { feeds: ['skills', 'spExtras'], build: sp },
  comingUp: { feeds: ['calendar'], build: comingUp },
  ...WORLD_DEFS,
  ...KIND_DEFS,
  ...CORP_DEFS,
};

/** Kind -> the feeds it reads. A kind absent here reads no feed and draws without data. */
export const KIND_FEEDS: Readonly<Record<string, readonly FeedId[]>> = Object.fromEntries(
  Object.entries(KINDS).map(([kind, def]) => [kind, def.feeds])
);

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
  return zeroIsClear(def.build(feeds, ctx));
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
