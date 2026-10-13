import type { BlueprintShare } from '@/engine/communities/shareMode';

/**
 * What a content tab's sharing line says about this Character's own shares
 * (scope decision
 * `20261013-072418-communities-my-sharing-slide-out-and-community-header`).
 * Read from what is already on hand: the blueprint choice on this device, the
 * Fittings switch on this device, and the Character's own rows in the
 * Community's list, so the line costs no read of its own.
 */
export type BlueprintSharing =
  { kind: 'all' } | { kind: 'none' } | { kind: 'some'; picked: number; places: number };
export type FittingSharing = { kind: 'all' } | { kind: 'none' } | { kind: 'count'; count: number };
/** Skill plans are shared one at a time, never all at once. */
export type PlanSharing = Exclude<FittingSharing, { kind: 'all' }>;

/** One content tab's summary; null until it is known. */
export type TabSharing =
  | { tab: 'blueprints'; summary: BlueprintSharing }
  | { tab: 'fittings'; summary: FittingSharing }
  | { tab: 'plans'; summary: PlanSharing };

/** Blueprints: share-all, or the ones picked one by one plus the stations or structures shared whole. */
export function blueprintSharing(share: BlueprintShare): BlueprintSharing {
  if (share.choice.all) return { kind: 'all' };
  const picked = share.choice.allowed.size;
  const places = share.locations.size;
  return picked === 0 && places === 0 ? { kind: 'none' } : { kind: 'some', picked, places };
}

/** Skill plans: this Character's count; null until its list has loaded. */
export function planSharing(mine: number | null): PlanSharing | null {
  if (mine === null) return null;
  return mine === 0 ? { kind: 'none' } : { kind: 'count', count: mine };
}

/** Fittings: share-all while its switch is on, else this Character's count; null until known. */
export function fittingSharing(all: boolean, mine: number | null): FittingSharing | null {
  return all ? { kind: 'all' } : planSharing(mine);
}
