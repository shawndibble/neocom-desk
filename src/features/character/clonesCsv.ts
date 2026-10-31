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

/** What the card says about one clone beside its own data: where it is and how it trains. */
export interface CloneCsvFacts {
  security?: number;
  jumps?: JumpsAwayResult;
  /** Undefined when there is no training verdict. */
  training?: CloneRow;
  best: boolean;
}

/**
 * One exported clone: a jump clone, or the clone the Character is wearing now
 * (`clone` null, no id and no ESI location of its own).
 */
export interface CloneCsvRow extends CloneCsvFacts {
  clone: JumpClone | null;
  implants: readonly number[];
}

/** The worn clone first, then the jump clones in the order the list shows them. */
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

/**
 * Export columns for the clone list: the cards' facts, one clone per row. A card
 * heads a named clone with its name beside its location; the file splits them
 * so each sorts on its own. Implants come four ways: names, per slot, with
 * bonus and price, and their total market value with the count it could not price.
 */
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
    /** Undefined until the price read settles. */
    prices: ReadonlyMap<number, number | null> | undefined;
    /** The worn clone sits in the Character's current system. */
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
      // Why the count is unknown, as the card's tooltip says it.
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
      // Slot order, each implant with what it adds and its price: the card's implant lines.
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
