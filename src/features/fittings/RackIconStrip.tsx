import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import { cx } from '@/lib/cx';
import { FITTING_SLOT_KINDS, type FittingSlotKind, type RackModule } from '@/engine/fittings/types';

function modulesByRack(
  modules: readonly RackModule[]
): { rack: FittingSlotKind; typeIds: number[] }[] {
  return FITTING_SLOT_KINDS.map((rack) => ({
    rack,
    typeIds: modules.filter((module) => module.slot === rack).map((m) => m.typeId),
  })).filter((group) => group.typeIds.length > 0);
}

export function RackIconStrip({
  modules,
  names,
  unusable,
}: {
  modules: readonly RackModule[];
  names: ReadonlyMap<number, string>;
  unusable?: ReadonlySet<number>;
}) {
  const { t } = useTranslation();
  const racks = modulesByRack(modules);
  if (racks.length === 0) return null;
  return (
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
            <span
              aria-hidden
              className="w-3 self-center text-[0.6875rem] font-semibold text-text-dim"
            >
              {t(`fittings.list.rackShort.${rack}`)}
            </span>
            {typeIds.map((typeId, slotIndex) => {
              const known = names.get(typeId) ?? `#${typeId}`;
              const cantUse = unusable?.has(typeId) ?? false;
              const name = cantUse ? `${known}\n${t('fittings.ring.tooltipCantUse')}` : known;
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
