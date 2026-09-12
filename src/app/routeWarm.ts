/**
 * Intent warming: compose a route's snapshot while the pointer is still on its
 * nav link, so the click lands on rendered rows instead of a spinner.
 *
 * This is the *second* warm-up, and the two are not interchangeable.
 * `prefetch.ts` fills the Dexie `esiCache` at boot, which is what makes a
 * page's data local rather than network-bound; it warms **endpoints**. What a
 * view actually renders is a *composed* snapshot — those cached rows joined,
 * named, priced and sorted by the route's own loader — and that composition
 * only happens when the route mounts. `lib/routeSnapshotCache.ts` retains the
 * result, so the second visit in a session is instant while the first still
 * pays for it. Warming on hover moves that cost into the ~200-400ms before the
 * click.
 *
 * It is a thin orchestrator over the very loader the view calls, the same way
 * `prefetch.ts` is: no second composition path can drift from the real one.
 *
 * Two things it must not do, both inherited from `prefetch.ts`:
 * - **Warm what the Character never granted.** A blind call to a scope-gated
 *   endpoint answers 403, which `esi/cache.ts` reports to the shell-wide
 *   re-auth notice — so an unfiltered warm would paint that banner for merely
 *   sweeping the pointer down the rail. Each warmer therefore declares the
 *   endpoints its loader reaches and is filtered against the stored grant with
 *   `prefetch.ts`'s own `grantCovers`. Deliberately **not** the route's
 *   `locked` flag, which asks a different question: `/calendar` is `UNGATED`
 *   (the page has something to show without any one grant) yet composes six
 *   scope-gated reads, so a lock-based gate would have warmed it for everyone
 *   and been the very banner this guards against.
 * - **Burst.** Warming reads inside `STALE_AFTER`, so a warm normally costs
 *   Dexie reads and CPU, not requests. A lapsed row still revalidates behind
 *   the view exactly as it would have on mount — that is `esi/cache.ts`'s
 *   business, not this module's.
 */
import type { AppRoutePath } from './routeScopes';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { readRouteSnapshot, writeRouteSnapshot } from '@/lib/routeSnapshotCache';
import { onCachePurged } from '@/esi/cachePurge';
import type { EsiEndpointId } from '@/esi/registry';
import { grantCovers } from './prefetch';
import { loadCalendarBoard } from '@/features/character/calendarBoardData';

export interface RouteWarmer {
  /**
   * The `cacheKey` the route passes to `useRouteSnapshot`, character-scoped by
   * `routeSnapshotCache.ts` exactly as the hook does it. It has to match that
   * literal or the warm lands under a key nothing reads — a silent miss, which
   * `routeWarm.test.ts` guards by reading each route's own source.
   */
  readonly cacheKey: string;
  /**
   * Every ESI endpoint the loader reaches, the same declaration
   * `PrefetchTask` makes and read the same way — scope requirements come from
   * `ESI_REGISTRY`, so no scope string is copied here and an endpoint that
   * changes scope upstream re-gates this for free. Under-declaring is not a
   * slow page, it is a spurious "log in again" banner on hover.
   */
  readonly endpoints: readonly EsiEndpointId[];
  /** The route's own loader, imported rather than re-implemented. */
  readonly load: (characterId: number, signal: RouteSnapshotSignal) => Promise<unknown>;
}

/**
 * Partial over `AppRoutePath`, and currently far more partial than it wants to
 * be — `/calendar` is the only route whose loader this module can reach today.
 *
 * Some routes will never qualify: `/overview` holds six independent card keys
 * and is the landing route anyway, `/industry` and `/market` retain per-panel
 * snapshots (`industry:active-jobs`, `market:open-orders`, …) rather than one
 * for the route, and `/alerts` reads Dexie live through `useLiveQuery`.
 *
 * The other eight are **pending, not excluded**. Each keeps its loader as a
 * module-private function inside its own route component file, and exporting
 * one trips `react-refresh/only-export-components` — a warning CI fails on,
 * and fairly: a route file that exports a non-component loses Fast Refresh.
 * The fix is to move those loaders into `features/`, where `loadCalendarBoard`
 * already lives and which is where `docs/ARCHITECTURE.md` puts loading
 * anyway. That is a refactor of its own, so this ships as a pilot on the one
 * route that needs none of it. Adding an entry here is one line once its
 * loader has moved.
 *
 * Until then, warming is simply absent for those paths: `warmRoute` no-ops on
 * a path with no entry, so their rail links behave exactly as they do today.
 */
export const ROUTE_WARMERS = {
  '/calendar': {
    cacheKey: 'calendar',
    // Every read `loadCalendarBoard` fans out to; the board is a union of six
    // sources, not just the calendar itself.
    endpoints: [
      'getCharacterCalendar',
      'getCharacterSkillQueue',
      'getCharacterIndustryJobs',
      'getCharacterPlanets',
      'getCharacterContracts',
      'getCharacterOrders',
    ],
    load: loadCalendarBoard,
  },
} satisfies Partial<Record<AppRoutePath, RouteWarmer>>;

export type WarmablePath = keyof typeof ROUTE_WARMERS;

/**
 * In-flight warms, keyed by cache key and Character, since a rail hover fires
 * on every pointer entry.
 *
 * It does not deduplicate against the mount that follows the click:
 * `useRouteSnapshot` knows nothing of this set, so a click landing mid-warm
 * composes a second time. That costs CPU and Dexie reads but no extra ESI
 * traffic — `esi/cache.ts` collapses concurrent reads of a key itself — and
 * the alternative, having the hook wait on a speculative warm, would put a
 * hover on the critical path of a navigation.
 */
const inFlight = new Set<string>();

/**
 * Bumped by every cache purge, so a warm that started before one can tell and
 * drop its result instead of writing it back.
 *
 * A purge is how a scope revoke, an owner change or a corp change gets data off
 * the screen, and `routeSnapshotCache.ts` forgets bluntly for exactly that
 * reason: "over-forgetting costs one Dexie re-read, under-forgetting is a
 * privacy bug." A warm holds a composed snapshot across an await with nothing
 * watching it — `useRouteSnapshot`'s own load at least dies with the component
 * — so without this it would re-add rows the purge had just removed. Counted
 * rather than compared per character because the cache-wide tier purges
 * everything with `null`, and a warm must lose that race too.
 */
let purgeGeneration = 0;
onCachePurged(() => {
  purgeGeneration += 1;
});

/** Test seam: module state otherwise outlives a `beforeEach`. */
export function resetWarmState(): void {
  inFlight.clear();
}

function isWarmable(path: string): path is WarmablePath {
  return Object.prototype.hasOwnProperty.call(ROUTE_WARMERS, path);
}

/**
 * Composes `path`'s snapshot into `routeSnapshotCache` unless it is already
 * there, already being composed, or reaches a scope this Character has not
 * granted.
 *
 * `granted` is the Character's stored scopes, `undefined` while they are still
 * unknown — which is a refusal, not a permissive default. `useGrantedScopes`
 * reports `undefined` for the first frames of every cold load, and warming
 * through that window would issue exactly the blind calls the grant filter
 * exists to prevent.
 *
 * Never throws and never rejects, for the same reason `prefetchCharacterData`
 * doesn't: a warm is speculative, and the view will report a real failure when
 * the user actually opens it. Returns nothing — callers fire and forget.
 */
export async function warmRoute(
  path: string,
  characterId: number | null,
  granted: readonly string[] | undefined
): Promise<void> {
  if (characterId === null || granted === undefined || !isWarmable(path)) return;
  // Widened to the interface: `satisfies` keeps each entry's literal type, and
  // a loader that ignores the signal declares only its first parameter.
  const { cacheKey, endpoints, load }: RouteWarmer = ROUTE_WARMERS[path];
  if (!grantCovers(new Set(granted), endpoints)) return;
  // Already rendered once this session: the hook would read this same row on
  // mount, so recomposing it would spend the hover for nothing.
  if (readRouteSnapshot(cacheKey, characterId) !== null) return;

  const token = `${cacheKey}:${characterId}`;
  if (inFlight.has(token)) return;
  inFlight.add(token);
  const startedAt = purgeGeneration;
  try {
    // Never cancelled: unlike the hook's signal, nothing here is waiting on the
    // result, and a warm that abandons its own work halfway leaves the cache
    // empty for the click that prompted it.
    const data = await load(characterId, { cancelled: false });
    // Dropped rather than stored if a purge landed while this was composing —
    // see `purgeGeneration`. The next hover simply warms again.
    if (purgeGeneration !== startedAt) return;
    writeRouteSnapshot(cacheKey, characterId, data);
  } catch {
    // Swallowed by design; see the doc comment above.
  } finally {
    inFlight.delete(token);
  }
}
