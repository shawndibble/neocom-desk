import type { EftSlotLookup } from './eftLoader';
import { killmailVictimToLoadResult, type KillmailVictim } from './linkLoader';
import type { LoadedFitting, LoadParts } from './load';
import { parseInstant } from '../esiInstant';

const MIN_FITTED_MODULES = 3;

export interface HullLoss {
  killmailId: number;
  time: string | null;
  value: number | null;
  victim: KillmailVictim;
}

type ResolvedParts = Extract<LoadParts, { hullTypeId: number }>;

export interface PopularFit {
  key: string;
  count: number;
  lastSeen: string | null;
  value: number | null;
  killmailIds: number[];
  parts: ResolvedParts;
}

function timeMs(loss: HullLoss): number {
  return parseInstant(loss.time ?? undefined) ?? Number.NEGATIVE_INFINITY;
}

function byRecency(a: HullLoss, b: HullLoss): number {
  return timeMs(b) - timeMs(a) || b.killmailId - a.killmailId;
}

export function popularFitKey(modules: readonly { typeId: number }[]): string {
  return modules
    .map((module) => module.typeId)
    .sort((a, b) => a - b)
    .join(',');
}

export function groupPopularFits(
  losses: readonly HullLoss[],
  slotByTypeId: EftSlotLookup
): PopularFit[] {
  const groups = new Map<string, { losses: HullLoss[]; parts: ResolvedParts }>();
  for (const loss of [...losses].sort(byRecency)) {
    const parts = killmailVictimToLoadResult(loss.victim, slotByTypeId);
    if (parts.hullTypeId === null || parts.modules.length < MIN_FITTED_MODULES) continue;
    const key = popularFitKey(parts.modules);
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
  return fits.sort((a, b) => b.count - a.count);
}

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
    unresolved: parts.unresolved,
  };
}
