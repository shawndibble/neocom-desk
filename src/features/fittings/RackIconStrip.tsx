/**
 * A Popular fit row's modules as icons, rack by rack (issues #2327, #2493) —
 * shared by the zKillboard and EVE Workbench tabs so both draw modules the
 * same way.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import {
  FITTING_SLOT_KINDS,
  type FittingModule,
  type FittingSlotKind,
} from '@/engine/fittings/types';
import { cx } from '@/lib/cx';

/** A fitted module as the strip draws it: its rack and type. */
export type RackModule = Pick<FittingModule, 'slot' | 'typeId'>;

/** A row's fitted modules by rack, in rack order; empty racks left out. */
function modulesByRack(
  modules: readonly RackModule[]
): { rack: FittingSlotKind; typeIds: number[] }[] {
  return FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    typeIds: modules.filter((module) => module.slot === rack).map((m) => m.typeId),
  })).filter((group) => group.typeIds.length > 0);
}

/** The modules' icons grouped by rack, each named; nothing when there are none. */
export function RackIconStrip({
  modules,
  names,
}: {
  modules: readonly RackModule[];
  names: ReadonlyMap<number, string>;
}) {
  const { t } = useTranslation();
  const racks = modulesByRack(modules);
  if (racks.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-y-1">
      {racks.map(({ rack, typeIds }, rackIndex) => (
        <div
          key={rack}
          role="group"
          aria-label={t(`fittings.list.rack.${rack}`)}
          className={cx(
            'flex flex-wrap gap-0.5',
            rackIndex > 0 && 'ml-1.5 border-l border-line pl-1.5'
          )}
        >
          {typeIds.map((typeId, slotIndex) => {
            const name = names.get(typeId) ?? `#${typeId}`;
            // Not a tab stop: ~20 per fit would bury Open; the name reaches
            // screen readers as the icon's label, and touch reads it by tap.
            return (
              <Tooltip key={slotIndex} content={name} openOnTap>
                <span role="img" aria-label={name} className="inline-flex">
                  <TypeIcon typeId={typeId} size={32} width={20} height={20} />
                </span>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
