import type { TFunction } from 'i18next';
import {
  HINT_SHARE,
  PROPULSION_GROUP,
  removedCommonGroups,
  type JobCommonality,
} from '@/engine/fittings/hullCommonality';
import type { ImproveJob } from '@/engine/fittings/improve';
import type { FittingModule } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';

export interface CommunityHints {
  job: ImproveJob;
  hullName: string;
  groups: ReadonlyMap<number, { share: number; label: string }>;
  groupOf: (typeId: number) => number | undefined;
  removed: readonly number[];
}

const SIZE_WORD = /^(small|medium|large|x-large|capital)\b/i;

function groupLabel(catalogue: FittingCatalogue, group: number): string | null {
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
