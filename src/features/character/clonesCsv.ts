import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { JumpClone } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { CloneRow } from '@/engine/clone/cloneVerdict';
import type { AttributeName } from '@/engine/types';
import { sumImplantValue } from '@/engine/implantValue';
import { joined } from '@/lib/exportSheets';
import { cloneOwnName, type CloneNicknamesValue } from './cloneNicknames';
import { bySlot, implantBonusText } from './implantDisplay';
import type { ImplantDetail } from './clones';

export interface CloneCsvFacts {
  security?: number;
  jumps?: JumpsAwayResult;
  training?: CloneRow;
  best: boolean;
}

export interface CloneCsvRow extends CloneCsvFacts {
  clone: JumpClone | null;
  implants: readonly number[];
}

export function cloneCsvRows(
  worn: readonly number[] | null,
  jumpClones: readonly JumpClone[],
  factsFor: (clone: JumpClone | null) => CloneCsvFacts
): CloneCsvRow[] {
  return [
    ...(worn === null ? [] : [{ clone: null, implants: worn, ...factsFor(null) }]),
    ...jumpClones.map((clone) => ({ clone, implants: clone.implants, ...factsFor(clone) })),
  ];
}

export function clonesCsvColumns(
  t: CsvTranslate,
  {
    locationNames,
    implantNames,
    implantDetails,
    nicknames,
    prices,
    wornPlaceName,
  }: {
    locationNames: ReadonlyMap<number, string>;
    implantNames: ReadonlyMap<number, string>;
    implantDetails: ReadonlyMap<number, ImplantDetail>;
    nicknames: CloneNicknamesValue;
    prices: ReadonlyMap<number, number | null> | undefined;
    wornPlaceName: string | null;
  }
): CsvColumn<CloneCsvRow>[] {
  const nameOf = (id: number) => implantNames.get(id) ?? t('common.unknownType', { id });
  const inSlotOrder = (row: CloneCsvRow) => bySlot(row.implants, implantDetails);
  const value = (row: CloneCsvRow) => (prices ? sumImplantValue(row.implants, prices) : null);
  return [
    {
      header: t('clones.csvName'),
      value: ({ clone }) => (clone ? cloneOwnName(clone, nicknames) : undefined),
    },
    {
      header: t('clones.csvWorn'),
      value: ({ clone }) => (clone === null ? t('clones.wearingNow') : undefined),
    },
    {
      header: t('clones.location'),
      value: ({ clone }) =>
        clone === null
          ? wornPlaceName
          : (locationNames.get(clone.location_id) ??
            t(clone.location_type === 'station' ? 'clones.stationLabel' : 'clones.structureLabel', {
              id: clone.location_id,
            })),
    },
    { header: t('clones.csvSecurity'), value: (row) => row.security },
    {
      header: t('clones.csvJumpsAway'),
      value: ({ jumps }) => (jumps?.kind === 'known' ? jumps.jumps : undefined),
    },
    {
      header: t('clones.csvJumpsNote'),
      value: ({ jumps }) =>
        jumps?.kind === 'unknown' ? t(`assets.jumpsAway.unknownReason.${jumps.reason}`) : undefined,
    },
    { header: t('clones.implants'), value: (row) => joined(row.implants.map(nameOf)) },
    {
      header: t('clones.csvImplantsBySlot'),
      value: (row) =>
        joined(
          inSlotOrder(row).map((id) => {
            const slot = implantDetails.get(id)?.slot;
            return slot === undefined ? nameOf(id) : `${slot}: ${nameOf(id)}`;
          })
        ),
    },
    {
      header: t('clones.csvImplantDetails'),
      value: (row) =>
        joined(
          inSlotOrder(row).map((id) => {
            const bonuses = Object.entries(implantDetails.get(id)?.bonuses ?? {}).map(
              ([attribute, bonus]) => implantBonusText(t, attribute as AttributeName, bonus)
            );
            const price = prices?.get(id);
            const parts = [
              ...(bonuses.length > 0 ? [joined(bonuses)] : []),
              ...(price == null ? [] : [t('clones.csvImplantPrice', { price })]),
            ];
            return `${nameOf(id)}${parts.length > 0 ? ` (${joined(parts)})` : ''}`;
          })
        ),
    },
    { header: t('clones.csvImplantValue'), value: (row) => value(row)?.total },
    { header: t('clones.csvImplantsUnpriced'), value: (row) => value(row)?.unpriced },
    { header: t('clones.csvQueueSeconds'), value: (row) => row.training?.totalSeconds },
    { header: t('clones.csvQueueDeltaSeconds'), value: (row) => row.training?.deltaSeconds },
    {
      header: t('clones.csvBestForTraining'),
      value: (row) => (row.best ? t('clones.verdict.badge') : undefined),
    },
  ];
}
