/**
 * Route Safety's Avoid preview (issue #2472): the route with one more system
 * avoided, drawn from the local stargate graph before anything is saved.
 *
 * The rules are passed in, never read from the stores here
 * (`features/route/localRoute.ts` says why); only `avoid` is swapped for the
 * candidate list, so the page's Route Preference and penalty still apply.
 */
import {
  avoidPreviewOutcome,
  candidateAvoid,
  type AvoidPreviewOutcome,
} from '@/engine/route/avoidPreview';
import { buildRouteSafetyRows, summarizeRouteSafety } from '@/engine/route/routeSafety';
import { findLocalRoute } from '@/features/route/localRoute';
import type { RouteRules } from '@/features/route/routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export type AvoidPreviewResult =
  ({ kind: 'preview' } & AvoidPreviewOutcome) | { kind: 'no-route' } | { kind: 'unknown' };

export interface AvoidPreviewRequest {
  fromId: number;
  toId: number;
  /** The rules the page's route is drawn with now. */
  rules: RouteRules;
  systemId: number;
  /** The page's route now, for the change. */
  currentJumps: number;
  /** The stored Avoided Systems; only read with the switch off. */
  avoidList: readonly number[];
  /** The Avoided Systems switch; off previews it turned on along with the add. */
  avoidListEnabled: boolean;
}

export async function previewAvoid(request: AvoidPreviewRequest): Promise<AvoidPreviewResult> {
  const avoid = candidateAvoid({
    effective: request.rules.avoid,
    systemId: request.systemId,
    avoidList: request.avoidList,
    avoidListEnabled: request.avoidListEnabled,
  });
  const [result, systems] = await Promise.all([
    findLocalRoute(request.fromId, request.toId, { ...request.rules, avoid }),
    loadSolarSystemsById().catch(() => null),
  ]);
  if (result.kind !== 'route') return { kind: result.kind };
  // The summary's own rounding, so the preview's "lowest" matches the line above the table.
  const rows = buildRouteSafetyRows(result.systems, {
    systems: systems ?? new Map(),
    regionNames: new Map(),
    kills: null,
    jumps: null,
  });
  return {
    kind: 'preview',
    ...avoidPreviewOutcome({
      currentJumps: request.currentJumps,
      route: result.systems,
      systemId: request.systemId,
      lowestSecurity: summarizeRouteSafety(rows).lowestSecurity,
    }),
  };
}
