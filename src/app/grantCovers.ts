/**
 * The scope gate every speculative ESI read shares — the boot warm-up
 * (`prefetch.ts`) and the hover warm (`routeWarm.ts`). Its own module so the
 * shell can reach it without also loading `prefetch.ts`'s task table, which
 * imports a loader from nearly every feature.
 */
import { ESI_REGISTRY, isScopeRequired, type EsiEndpointId } from '@/esi/registry';

/**
 * Whether `held` satisfies every scope `endpoints` requires — the single
 * definition of "may this Character be asked for this", shared by
 * `prefetch.ts` and `routeWarm.ts`.
 *
 * Exported because the answer is **not** a route's `ScopeGate`. A route can be
 * `UNGATED` and still compose scope-gated reads: `/calendar` is ungated because
 * the page has something to show without any one grant, yet `loadCalendarBoard`
 * pulls calendar, skill-queue, industry-job, planet, contract and order
 * endpoints. Gating a speculative read on the route's own lock therefore asks
 * the wrong question, and asking ESI without the grant answers 403, which
 * `esi/cache.ts` turns into the shell-wide re-auth notice. Every speculative
 * read has to ask this instead.
 */
export function grantCovers(
  held: ReadonlySet<string>,
  endpoints: readonly EsiEndpointId[]
): boolean {
  return endpoints.every((endpoint) => {
    const { scope } = ESI_REGISTRY[endpoint];
    return !isScopeRequired(scope) || held.has(scope);
  });
}
