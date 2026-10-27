import type { TFunction } from 'i18next';
import type { HaulerOption, MoveHull } from '@/engine/assets/movePlan';

/** Visible words for an owned hull: "Owned", with jumps from the nearest character when placed. */
export function ownedText(t: TFunction, hull: MoveHull): string | null {
  if (!hull.owned) return null;
  if (!hull.ownedAt) return t('assets.movePlan.ownedHull');
  return hull.ownedAt.jumps === null
    ? t('assets.movePlan.ownedJumpsUnknown')
    : t('assets.movePlan.ownedJumps', { count: hull.ownedAt.jumps });
}

/** The same for a screen reader, which also hears whose Current System the count is from. */
export function ownedAria(t: TFunction, hull: MoveHull): string | undefined {
  const at = hull.ownedAt;
  if (!hull.owned || !at) return undefined;
  return at.jumps === null
    ? t('assets.movePlan.ownedJumpsUnknownAria', { character: at.characterName })
    : t('assets.movePlan.ownedJumpsAria', { count: at.jumps, character: at.characterName });
}

/** Owned hulls first, each group in the planner's ranking; the ranking itself is untouched. */
export function ownedFirstOrder(comparison: readonly HaulerOption[], on: boolean): HaulerOption[] {
  if (!on) return [...comparison];
  return [...comparison.filter((o) => o.hull.owned), ...comparison.filter((o) => !o.hull.owned)];
}
