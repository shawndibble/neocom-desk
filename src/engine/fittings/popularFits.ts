/**
 * Popular fits (issue #2327): how people actually fly a hull, read from its
 * recent zKillboard losses. Each loss's victim becomes a Fitting the way a
 * killmail Load does (`killmailVictimToLoadResult`), and losses group by the
 * multiset of fitted modules — charges, drones, cargo and which slot index a
 * module sat in don't split a group. Pure: the caller fetches the losses.
 */
import type { EftSlotLookup } from './eftLoader';
import { killmailVictimToLoadResult, type KillmailVictim } from './linkLoader';
import type { LoadedFitting, LoadParts } from './load';

/** A fit this thin is a pod-and-a-prayer, not a fit worth showing. */
const MIN_FITTED_MODULES = 3;

/** One loss of the hull, its victim already resolved. */
export interface HullLoss {
  killmailId: number;
  /** When it died (ISO); null when unknown. */
  time: string | null;
  /** zKillboard's ISK estimate; null when absent. */
  value: number | null;
  victim: KillmailVictim;
}

type ResolvedParts = Extract<LoadParts, { hullTypeId: number }>;

export interface PopularFit {
  /** The group's identity: its fitted module typeIds, sorted. */
  key: string;
  count: number;
  /** The group's most recent loss time; null when none carried one. */
  lastSeen: string | null;
  /** Mean value over the group's losses that carried one; null when none did. */
  value: number | null;
  /** Newest first. */
  killmailIds: number[];
  /** The group's most recent loss as a Fitting's parts, cargo left out. */
  parts: ResolvedParts;
}

function timeMs(loss: HullLoss): number {
  const ms = loss.time === null ? Number.NaN : Date.parse(loss.time);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Newest first: by time, then by killmail id (ids rise with time). */
function byRecency(a: HullLoss, b: HullLoss): number {
  return timeMs(b) - timeMs(a) || b.killmailId - a.killmailId;
}

/** Groups a hull's losses into distinct fits, most flown first, ties to the most recent. */
export function groupPopularFits(
  losses: readonly HullLoss[],
  slotByTypeId: EftSlotLookup
): PopularFit[] {
  const groups = new Map<string, { losses: HullLoss[]; parts: ResolvedParts }>();
  for (const loss of [...losses].sort(byRecency)) {
    const parts = killmailVictimToLoadResult(loss.victim, slotByTypeId);
    if (parts.hullTypeId === null || parts.modules.length < MIN_FITTED_MODULES) continue;
    const key = parts.modules
      .map((module) => module.typeId)
      .sort((a, b) => a - b)
      .join(',');
    const group = groups.get(key);
    if (group) group.losses.push(loss);
    else groups.set(key, { losses: [loss], parts: { ...parts, cargo: [] } });
  }

  const fits = [...groups].map(([key, group]): PopularFit => {
    const values = group.losses.flatMap((loss) => (loss.value === null ? [] : [loss.value]));
    return {
      key,
      count: group.losses.length,
      lastSeen: group.losses.find((loss) => loss.time !== null)?.time ?? null,
      value: values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length,
      killmailIds: group.losses.map((loss) => loss.killmailId),
      parts: group.parts,
    };
  });
  // Groups were built newest-first, so a stable sort by count keeps ties in recency order.
  return fits.sort((a, b) => b.count - a.count);
}

/** A Popular fit as a Load, for the editor to open. */
export function popularFitLoad(fit: PopularFit, name: string): LoadedFitting {
  const { parts } = fit;
  return {
    kind: 'fitting',
    source: 'text',
    fitting: {
      name,
      shipTypeId: parts.hullTypeId,
      modules: parts.modules.map((module) => ({ ...module })),
      drones: parts.drones.map((drone) => ({ ...drone })),
      cargo: [],
      ...(parts.fighters?.length ? { fighters: parts.fighters } : {}),
    },
    unresolved: [],
  };
}
