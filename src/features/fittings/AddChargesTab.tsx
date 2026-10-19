import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, RowMoreActions, TypeIcon } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { chargeRowClassName } from './chargeRowStyle';
import type { Fitting, FittingModuleResult } from '@/engine/fittings/types';
import { CapBoosterGuide } from './CapBoosterGuide';
import { MiningCrystalGuide } from './MiningCrystalGuide';
import { ChargePickerControls, ChargePickerGroup } from './ChargePicker';
import { DEFAULT_PICKER_SETTINGS, type ChargePickerSettings } from './chargePickerSettings';
import { useChargeChoices } from './useChargeChoices';
import { AddItemMenuItems, FittingItemMenu } from './FittingItemMenu';
import { endFittingDrag, startFittingDrag } from './fittingDrag';
import { useFittingItemActions } from './fittingItemActions';
import type { FittingContext } from './fittingContext';
import { ShipDataWaitingNote } from './FittingDataNotices';
import type { FittingCatalogue } from './useFittingCatalogue';

interface ChargesTabProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  context: FittingContext | null;
  moduleResults: FittingModuleResult[] | null;
  onLoadCharge?: (chargeTypeId: number) => void;
  /** A charge drags onto the modules that take it. */
  dragToFit: boolean;
}

/**
 * Per fitted module type that takes charges: for a weapon, the Charge
 * Picker (grouped by type or faction, with this Fitting's damage, range and
 * the hub's price); for a cap booster, its guide (how the capacitor fares on
 * each charge, GJ/s, ISK per GJ); for a mining laser, its crystal guide
 * (what A, B and C are for, each ore family's crystals side by side); for
 * anything else (scripts, paste), the
 * plain list of what it takes. Each module's section collapses under its
 * header, which then names the charge loaded in it.
 */
export function ChargesTab({
  fitting,
  catalogue,
  context,
  moduleResults,
  onLoadCharge,
  dragToFit,
}: ChargesTabProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const [settings, setSettings] = useState<ChargePickerSettings>(DEFAULT_PICKER_SETTINGS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
  const sectionId = useId();
  const toggleSection = (moduleTypeId: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(moduleTypeId)) next.add(moduleTypeId);
      return next;
    });
  const { groups, pricesLoading } = useChargeChoices({ fitting, context, moduleResults });

  const name = (typeId: number) => catalogue?.types[String(typeId)]?.name ?? `#${typeId}`;

  /** The Add panel's own row behaviour around any loadable charge: drag onto the modules that take it, right-click menu. */
  const wrapRow = (chargeTypeId: number, row: ReactNode) => {
    const draggable = dragToFit && actions !== null;
    const inner = (
      <div
        className="flex items-center"
        draggable={draggable}
        onDragStart={
          draggable
            ? (event) =>
                startFittingDrag(event, {
                  kind: 'charge',
                  typeId: chargeTypeId,
                  fromCargo: false,
                  targets: actions.charges.targetsFor(chargeTypeId),
                })
            : undefined
        }
        onDragEnd={draggable ? endFittingDrag : undefined}
      >
        <div className="min-w-0 flex-1">{row}</div>
        {actions && <RowMoreActions />}
      </div>
    );
    return actions ? (
      <FittingItemMenu name={name(chargeTypeId)} items={<AddItemMenuItems typeId={chargeTypeId} />}>
        {inner}
      </FittingItemMenu>
    ) : (
      inner
    );
  };

  if (groups === null) {
    return <ShipDataWaitingNote />;
  }
  if (groups.length === 0) {
    return <p className="text-xs text-text-dim">{t('fittings.add.noChargeTakers')}</p>;
  }
  const weaponChoices = groups.filter((g) => g.isWeapon).flatMap((g) => g.choices);
  // The shared View/Sort/distance controls go with the weapon sections they drive.
  const anyWeaponOpen = groups.some((g) => g.isWeapon && !collapsed.has(g.moduleTypeId));
  const maxKm = Math.ceil(
    (Math.max(0, ...weaponChoices.map((c) => c.optimal + c.falloff)) / 1000) * 1.2
  );
  return (
    <div className="space-y-3">
      {weaponChoices.length > 0 && anyWeaponOpen && (
        <ChargePickerControls settings={settings} onChange={setSettings} maxKm={maxKm} />
      )}
      {groups.map((group) => {
        const open = !collapsed.has(group.moduleTypeId);
        const bodyId = `${sectionId}-${group.moduleTypeId}`;
        const loadedNames = [...group.loaded].map(name).join(', ');
        return (
          <section key={group.moduleTypeId} className="space-y-1">
            <h3 className="text-xs font-semibold">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => toggleSection(group.moduleTypeId)}
                className={cx(
                  'flex min-h-11 w-full items-center gap-2 px-2 text-left md:min-h-9',
                  rowInteractiveClassName,
                  focusRingInsetClassName
                )}
              >
                <Caret expanded={open} />
                <TypeIcon typeId={group.moduleTypeId} size={32} width={20} height={20} />
                <span className="min-w-0 flex-1 truncate">
                  {t('fittings.add.chargeTaker', {
                    count: group.count,
                    name: name(group.moduleTypeId),
                  })}
                </span>
                {/* The name always carries what's loaded, so it reads the same open or shut. */}
                {loadedNames !== '' && (
                  <span className="sr-only">
                    {t('fittings.add.chargeTakerLoaded', { names: loadedNames })}
                  </span>
                )}
                {!open && loadedNames !== '' && (
                  <span
                    aria-hidden="true"
                    className="max-w-40 shrink-0 truncate font-normal text-text-dim"
                  >
                    {loadedNames}
                  </span>
                )}
              </button>
            </h3>
            {/* Hidden rather than unmounted, so a type opened inside stays open. */}
            <div id={bodyId} hidden={!open}>
              {group.isMiner ? (
                <MiningCrystalGuide
                  group={group}
                  onLoad={onLoadCharge}
                  wrapRow={wrapRow}
                  pricesLoading={pricesLoading}
                />
              ) : group.isCapBooster ? (
                <CapBoosterGuide
                  group={group}
                  onLoad={onLoadCharge}
                  wrapRow={wrapRow}
                  pricesLoading={pricesLoading}
                />
              ) : group.isWeapon ? (
                <ChargePickerGroup
                  group={group}
                  settings={settings}
                  onLoad={onLoadCharge}
                  wrapRow={wrapRow}
                  pricesLoading={pricesLoading}
                />
              ) : (
                <ul>
                  {group.choices.map((choice) => {
                    const loaded = group.loaded.has(choice.typeId);
                    return (
                      <li key={choice.typeId}>
                        {wrapRow(
                          choice.typeId,
                          <button
                            type="button"
                            aria-pressed={loaded}
                            disabled={!onLoadCharge}
                            onClick={() => onLoadCharge?.(choice.typeId)}
                            className={chargeRowClassName(
                              loaded,
                              'flex min-h-11 w-full items-center gap-2 px-2 text-left text-xs md:min-h-9'
                            )}
                          >
                            <TypeIcon typeId={choice.typeId} size={32} width={20} height={20} />
                            <span className="min-w-0 flex-1 truncate">{choice.name}</span>
                            {loaded && (
                              <span className="shrink-0 text-[0.6875rem]">
                                {t('fittings.add.loaded')}
                              </span>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
