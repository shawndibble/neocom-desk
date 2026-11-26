import type { BlueprintShare } from '@/engine/communities/shareMode';

export type BlueprintSharing =
  { kind: 'all' } | { kind: 'none' } | { kind: 'some'; picked: number; places: number };
export type FittingSharing = { kind: 'all' } | { kind: 'none' } | { kind: 'count'; count: number };
export type PlanSharing = Exclude<FittingSharing, { kind: 'all' }>;

export type TabSharing =
  | { tab: 'blueprints'; summary: BlueprintSharing }
  | { tab: 'fittings'; summary: FittingSharing }
  | { tab: 'plans'; summary: PlanSharing };

export function blueprintSharing(share: BlueprintShare): BlueprintSharing {
  if (share.choice.all) return { kind: 'all' };
  const picked = share.choice.allowed.size;
  const places = share.locations.size;
  return picked === 0 && places === 0 ? { kind: 'none' } : { kind: 'some', picked, places };
}

export function planSharing(mine: number | null): PlanSharing | null {
  if (mine === null) return null;
  return mine === 0 ? { kind: 'none' } : { kind: 'count', count: mine };
}

export function fittingSharing(all: boolean, mine: number | null): FittingSharing | null {
  return all ? { kind: 'all' } : planSharing(mine);
}
