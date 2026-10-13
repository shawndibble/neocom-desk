import type { BlueprintShare } from '@/engine/communities/shareMode';

/**
 * What the content tab's sharing line says about this Character's own shares
 * (scope decision
 * `20261013-072418-communities-my-sharing-slide-out-and-community-header`). Read from what is
 * already on hand: the blueprint choice on this device, the Fittings switch on
 * this device, and the Character's own rows in the Community's list, so the
 * line costs no read of its own.
 */
export type SharingSummary =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'some'; picked: number; places: number }
  | { kind: 'count'; count: number };

/** Blueprints: share-all, or the ones picked one by one plus the stations or structures shared whole. */
export function blueprintSharing(share: BlueprintShare): SharingSummary {
  if (share.choice.all) return { kind: 'all' };
  const picked = share.choice.allowed.size;
  const places = share.locations.size;
  return picked === 0 && places === 0 ? { kind: 'none' } : { kind: 'some', picked, places };
}

/** Fittings or Skill plans: share-all when its switch is on, else this Character's count; null until known. */
export function itemSharing(all: boolean, mine: number | null): SharingSummary | null {
  if (all) return { kind: 'all' };
  if (mine === null) return null;
  return mine === 0 ? { kind: 'none' } : { kind: 'count', count: mine };
}
