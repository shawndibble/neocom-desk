/**
 * The quiet "on N% of PvE Drake fits" hints under Improve rows (issue #5581):
 * what the hull's community fits say about a row's target GROUP. Shown, never
 * scored; never about a specific variant. A group with no clean name (the
 * propulsion group is afterburners and MWDs both) gets no hint.
 */
import type { TFunction } from 'i18next';
import {
  HINT_SHARE,
  PROPULSION_GROUP,
  removedCommonGroups,
  type JobCommonality,
} from '@/engine/fittings/hullCommonality';
import type { ImproveJob } from '@/engine/fittings/improveJob';
import type { FittingModule } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';

/** What the hint lines need, built once when a search finishes. */
export interface CommunityHints {
  job: ImproveJob;
  hullName: string;
  /** Groups on at least half of the job's fits that have a name to show, with their share. */
  groups: ReadonlyMap<number, { share: number; label: string }>;
  groupOf: (typeId: number) => number | undefined;
  /** Groups the shown Makeover takes off the fit that most of the job's fits keep. */
  removed: readonly number[];
}

const SIZE_WORD = /^(small|medium|large|x-large|capital)\b/i;

/** A group's name for a hint: the market group of one of its listed types, one level up when that is a size tier. */
function groupLabel(catalogue: FittingCatalogue, group: number): string | null {
  // Afterburners and MWDs share a group: no honest single name.
  if (group === PROPULSION_GROUP) return null;
  const members = new Set(catalogue.typeIdsByGroup.get(group) ?? []);
  const entry = catalogue.marketTypes.find((type) => members.has(type.typeId));
  let node = entry ? catalogue.groupsById.get(entry.marketGroupId) : undefined;
  if (node && SIZE_WORD.test(node.name) && node.parentId !== null)
    node = catalogue.groupsById.get(node.parentId) ?? node;
  return node?.name ?? null;
}

export function communityHintsOf(
  commonality: JobCommonality,
  job: ImproveJob,
  catalogue: FittingCatalogue,
  hullTypeId: number,
  modules: readonly FittingModule[],
  makeoverRows: readonly { fromTypeId: number | null; toTypeId: number; at: readonly unknown[] }[]
): CommunityHints {
  const groupOf = (typeId: number) => catalogue.types[String(typeId)]?.groupID;
  const groups = new Map<number, { share: number; label: string }>();
  for (const [group, share] of commonality.groupShare) {
    if (share < HINT_SHARE) continue;
    const label = groupLabel(catalogue, group);
    if (label) groups.set(group, { share, label });
  }
  return {
    job,
    hullName: catalogue.types[String(hullTypeId)]?.name ?? '',
    groups,
    groupOf,
    removed: removedCommonGroups(modules, makeoverRows, groupOf, commonality),
  };
}

const percentOf = (share: number) => Math.round(share * 100);

/** "Ballistic Control Systems on 98% of PvE Drake fits"; null when the target's group is not that common. */
export function hintLine(
  t: TFunction,
  hints: CommunityHints | undefined,
  candidate: { toTypeId: number }
): string | null {
  const group = hints?.groupOf(candidate.toTypeId);
  const found = group === undefined ? undefined : hints?.groups.get(group);
  if (!hints || !found) return null;
  return t('fittings.improve.community.hint', {
    group: found.label,
    percent: percentOf(found.share),
    job: t(`fittings.improve.job.${hints.job}`),
    hull: hints.hullName,
  });
}

/** One quiet caution per group the Makeover removes that most fits keep. */
export function cautionLines(t: TFunction, hints: CommunityHints | undefined): string[] {
  if (!hints) return [];
  return hints.removed.flatMap((group) => {
    const found = hints.groups.get(group);
    return found
      ? [
          t('fittings.improve.community.caution', {
            group: found.label,
            percent: percentOf(found.share),
            job: t(`fittings.improve.job.${hints.job}`),
            hull: hints.hullName,
          }),
        ]
      : [];
  });
}
