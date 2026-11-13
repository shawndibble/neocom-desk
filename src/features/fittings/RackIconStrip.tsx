/**
 * A Popular fits panel row's modules as icons, rack by rack (issues #2327, #2493) —
 * shared by the zKillboard and EVE Workbench tabs so both draw modules the
 * same way.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import { cx } from '@/lib/cx';
import { FITTING_SLOT_KINDS, type FittingSlotKind, type RackModule } from '@/engine/fittings/types';

/** A row's fitted modules by rack, in rack order; empty racks left out. */
function modulesByRack(
  modules: readonly RackModule[]
): { rack: FittingSlotKind; typeIds: number[] }[] {
  return FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    typeIds: modules.filter((module) => module.slot === rack).map((m) => m.typeId),
  })).filter((group) => group.typeIds.length > 0);
}

/**
 * The modules' icons grouped by rack, each named; nothing when there are none.
 * A module the active Character can't use yet sits on a `danger` tint, as the
 * editor's own "Can't use" does.
 */
export function RackIconStrip({
  modules,
  names,
  unusable,
}: {
  modules: readonly RackModule[];
  names: ReadonlyMap<number, string>;
  /** Module types the pilot lacks skills for; absent with no verdict. */
  unusable?: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const racks = modulesByRack(modules);
  if (racks.length === 0) return null;
  return (
    // A group that wraps moves to the next line whole. Each group draws its
    // own separator in the gap to its left; the strip's negative margin pushes
    // that gap outside the clipped box, so a group starting a line has none.
    <div className="mt-1 overflow-hidden">
      <div className="-ml-3 flex flex-wrap gap-y-1">
        {racks.map(({ rack, typeIds }) => (
          <div
            key={rack}
            role="group"
            aria-label={t(`fittings.list.rack.${rack}`)}
            className="relative flex flex-wrap gap-0.5 pl-3"
          >
            <span aria-hidden className="absolute inset-y-0 left-1.5 border-l border-line" />
            {typeIds.map((typeId, slotIndex) => {
              const known = names.get(typeId) ?? `#${typeId}`;
              const cantUse = unusable?.has(typeId) ?? false;
              const name = cantUse ? `${known}\n${t('fittings.ring.tooltipCantUse')}` : known;
              // Not a tab stop: ~20 per fit would bury Open; the name reaches
              // screen readers as the icon's label, and touch reads it by tap.
              return (
                <Tooltip key={slotIndex} content={name} openOnTap>
                  <span
                    role="img"
                    aria-label={name}
                    data-cant-use={cantUse ? '' : undefined}
                    className={cx('inline-flex rounded-xs', cantUse && 'bg-danger/40')}
                  >
                    <TypeIcon typeId={typeId} size={64} width={40} height={40} />
                  </span>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
