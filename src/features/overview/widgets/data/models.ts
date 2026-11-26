import { blank, failedBuilders, type Builder, type KindDef } from './builderKit';
import { ACCOUNT_DEFS } from './accountModels';
import { comingUp, sp, training } from './characterBuilders';
import { KIND_DEFS } from './kindModels';
import { WORLD_DEFS } from './worldModels';
import type { BuildContext, FeedId, Feeds, KindView } from './types';
import { settingsContext, type ViewSettings } from './viewSettings';
import type { EsiEndpointId } from '@/esi/registry';
import { getKind } from '../kinds';
import type { WidgetScope } from '../layout';

const KINDS: Record<string, KindDef> = {
  ...ACCOUNT_DEFS,
  training: { feeds: ['skills', 'accelerator'], scope: 'character', build: training },
  sp: { feeds: ['skills', 'spExtras'], scope: 'character', build: sp },
  comingUp: {
    feeds: ['calendar'],
    allFeeds: ['calendarAll'],
    scope: 'account',
    build: (feeds, ctx) =>
      comingUp(ctx.scopeAll ? { ...feeds, calendar: feeds.calendarAll } : feeds, ctx),
  },
  ...WORLD_DEFS,
  ...KIND_DEFS,
};

export function registerKindDefs(defs: Readonly<Record<string, KindDef>>): void {
  Object.assign(KINDS, defs);
}

export const kindDef = (kind: string): KindDef | undefined => KINDS[kind];

export const allKindIds = (): string[] => Object.keys(KINDS);

function resolved(kind: string, settings?: ViewSettings) {
  const def = KINDS[kind];
  if (!def) return undefined;
  return def.bySettings && settings ? def.bySettings(settingsContext(kind, settings)) : def;
}

export function feedsOf(
  kind: string,
  settings?: ViewSettings,
  scopeAll = false
): readonly FeedId[] | undefined {
  const reads = resolved(kind, settings);
  if (scopeAll && reads?.scope === 'account') {
    const all = reads.allFeeds ?? KINDS[kind]?.allFeeds;
    if (all) return all;
  }
  return reads?.feeds;
}

export const kindHasAllFeeds = (kind: string): boolean => KINDS[kind]?.allFeeds !== undefined;

export type FeedReader = string | ({ kind: string; scope?: WidgetScope } & ViewSettings);

export function feedsFor(readers: readonly FeedReader[]): FeedId[] {
  const out = new Set<FeedId>();
  for (const reader of readers) {
    const feeds =
      typeof reader === 'string'
        ? feedsOf(reader)
        : feedsOf(reader.kind, reader, reader.scope !== undefined && reader.scope !== 'header');
    for (const feed of feeds ?? []) out.add(feed);
  }
  return [...out];
}

export function endpointsOf(kind: string, settings?: ViewSettings): readonly EsiEndpointId[] {
  const reads = resolved(kind, settings);
  return reads && 'endpoints' in reads ? reads.endpoints : (getKind(kind)?.endpoints ?? []);
}

export function kindSumsAcrossCharacters(kind: string, settings?: ViewSettings): boolean {
  return resolved(kind, settings)?.scope === 'account';
}

const lazyBuilders = new Map<string, Builder>();
const lazyLoads = new Map<string, Promise<void>>();
const lazyListeners = new Set<() => void>();
let lazyEpoch = 0;

export const builderEpoch = (): number => lazyEpoch;

export function subscribeBuilders(listener: () => void): () => void {
  lazyListeners.add(listener);
  return () => {
    lazyListeners.delete(listener);
  };
}

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

export function buildView(kind: string, feeds: Feeds, ctx: BuildContext): KindView {
  const def = KINDS[kind];
  if (!def) return placeholder(kind);
  const lazy = lazyBuilders.get(kind);
  if (lazy) return zeroIsClear(lazy(feeds, ctx));
  const standIn = def.build(feeds, ctx);
  if (failedBuilders.has(kind)) {
    return zeroIsClear({ ...standIn, status: { ...standIn.status, loading: false, error: true } });
  }
  return zeroIsClear(standIn);
}

function zeroIsClear(view: KindView): KindView {
  const { number } = view;
  if (number.value !== '0' || number.tone === 'clear') return view;
  return { ...view, number: { ...number, tone: 'clear' } };
}
