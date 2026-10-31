import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { JumpClone } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import type { CloneRow } from '@/engine/clone/cloneVerdict';
import { sumImplantValue } from '@/engine/implantValue';
import { cloneOwnName, type CloneNicknamesValue } from './cloneNicknames';
import type { ImplantDetail } from './clones';
import { WORN_CLONE_ID } from './cloneTraining';

/**
 * One exported clone: a jump clone, or the clone the Character is wearing now
 * (`clone` null, no id and no ESI location of its own).
 */
export interface CloneCsvRow {
  clone: JumpClone | null;
  implants: readonly number[];
}

/** The worn clone first, then the jump clones in the order the list shows them. */
export function cloneCsvRows(
  worn: readonly number[] | null,
  jumpClones: readonly JumpClone[]
): CloneCsvRow[] {
  return [
    ...(worn === null ? [] : [{ clone: null, implants: worn }]),
    ...jumpClones.map((clone) => ({ clone, implants: clone.implants })),
  ];
}

/**
 * Export columns for the clone list: the cards' facts, one clone per row. A card
 * heads a named clone with its name beside its location; the file splits them
 * so each sorts on its own. Implants come three ways: the names joined, per
 * slot ("1: Name"), and their market value with the count it could not price.
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
    securityOf,
    jumpsOf,
    trainingOf,
    bestCloneId,
  }: {
    locationNames: ReadonlyMap<number, string>;
    implantNames: ReadonlyMap<number, string>;
    implantDetails: ReadonlyMap<number, ImplantDetail>;
    nicknames: CloneNicknamesValue;
    /** Undefined until the price read settles. */
    prices: ReadonlyMap<number, number | null> | undefined;
    /** The worn clone sits in the Character's current system. */
    wornPlaceName: string | null;
    securityOf: (row: CloneCsvRow) => number | undefined;
    jumpsOf: (row: CloneCsvRow) => JumpsAwayResult | undefined;
    /** Undefined when there is no training verdict. */
    trainingOf: (row: CloneCsvRow) => CloneRow | undefined;
    bestCloneId: string | number | null;
  }
): CsvColumn<CloneCsvRow>[] {
  const nameOf = (id: number) => implantNames.get(id) ?? t('common.unknownType', { id });
  const slotOf = (id: number) => implantDetails.get(id)?.slot ?? Number.POSITIVE_INFINITY;
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
    { header: t('clones.csvSecurity'), value: (row) => securityOf(row) },
    {
      header: t('clones.csvJumpsAway'),
      value: (row) => {
        const jumps = jumpsOf(row);
        return jumps?.kind === 'known' ? jumps.jumps : undefined;
      },
    },
    {
      // Why the count is unknown, as the card's tooltip says it.
      header: t('clones.csvJumpsNote'),
      value: (row) => {
        const jumps = jumpsOf(row);
        return jumps?.kind === 'unknown'
          ? t(`assets.jumpsAway.unknownReason.${jumps.reason}`)
          : undefined;
      },
    },
    {
      header: t('clones.implants'),
      value: (row) => row.implants.map(nameOf).join('; '),
    },
    {
      header: t('clones.csvImplantsBySlot'),
      value: (row) =>
        [...row.implants]
          .sort((a, b) => slotOf(a) - slotOf(b))
          .map((id) => {
            const slot = implantDetails.get(id)?.slot;
            return slot === undefined ? nameOf(id) : `${slot}: ${nameOf(id)}`;
          })
          .join('; '),
    },
    {
      // Slot, name, what it adds and its price: the card's implant lines, joined.
      header: t('clones.csvImplantDetails'),
      value: (row) =>
        [...row.implants]
          .sort((a, b) => slotOf(a) - slotOf(b))
          .map((id) => {
            const detail = implantDetails.get(id);
            const bonuses = Object.entries(detail?.bonuses ?? {}).map(([attribute, value]) =>
              t('clones.implantBonus', {
                value,
                attribute: t(`clones.verdict.attribute.${attribute}`),
              })
            );
            const price = prices?.get(id);
            const parts = [
              ...(bonuses.length > 0 ? [bonuses.join(', ')] : []),
              ...(price == null ? [] : [t('clones.csvImplantPrice', { price })]),
            ];
            return `${nameOf(id)}${parts.length > 0 ? ` (${parts.join('; ')})` : ''}`;
          })
          .join('; '),
    },
    { header: t('clones.csvImplantValue'), value: (row) => value(row)?.total },
    { header: t('clones.csvImplantsUnpriced'), value: (row) => value(row)?.unpriced },
    {
      header: t('clones.csvQueueSeconds'),
      value: (row) => trainingOf(row)?.totalSeconds,
    },
    {
      header: t('clones.csvQueueDeltaSeconds'),
      value: (row) => trainingOf(row)?.deltaSeconds,
    },
    {
      header: t('clones.csvBestForTraining'),
      value: ({ clone }) => {
        const id = clone === null ? WORN_CLONE_ID : clone.jump_clone_id;
        return bestCloneId !== null && bestCloneId === id ? t('clones.verdict.badge') : undefined;
      },
    },
  ];
}
