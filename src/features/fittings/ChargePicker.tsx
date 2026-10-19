import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import {
  chargeScore,
  chargeShortName,
  filterChoices,
  iskPerMinute,
  quickPicks,
  reach,
} from '@/engine/fittings/chargeChoice';
import type { WeaponChargeGroup } from './useChargeChoices';
import { ChargeChart } from './ChargeChart';
import { formatIskExact } from './chargeFormat';
import { chargeRowClassName } from './chargeRowStyle';
import { pickerDistance, type ChargePickerSettings } from './chargePickerSettings';
import { ChargePickerControls } from './chargePicker/ChargePickerControls';
import { FactionList, TypeList } from './chargePicker/ChargeLists';
import { rangeText, km } from './chargePicker/chargeRowText';

export { ChargePickerControls };

interface GroupProps {
  group: WeaponChargeGroup;
  settings: ChargePickerSettings;
  /** Loads the charge into every fitted module that takes it. */
  onLoad?: (chargeTypeId: number) => void;
  /** Wraps a loadable row in the Add panel's drag and right-click menu. */
  wrapRow?: (chargeTypeId: number, row: ReactNode) => ReactNode;
  pricesLoading: boolean;
}

/** One weapon group's picker: the loaded line, quick picks, then the chosen view. */
export function ChargePickerGroup({ group, settings, onLoad, wrapRow, pricesLoading }: GroupProps) {
  const { t } = useTranslation();
  const distance = pickerDistance(settings);
  const visible = useMemo(
    () => filterChoices(group.choices, settings.filters),
    [group.choices, settings.filters]
  );
  const loaded = group.choices.find((c) => group.loaded.has(c.typeId)) ?? null;
  const picks = useMemo(() => quickPicks(visible, distance), [visible, distance]);
  const maxReach = Math.max(1, ...group.choices.map(reach));
  const wrap = (typeId: number, row: ReactNode) => (wrapRow ? wrapRow(typeId, row) : row);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2 bg-panel-2 px-2 py-1.5 text-xs">
        {loaded ? (
          <>
            <TypeIcon typeId={loaded.typeId} size={32} width={20} height={20} />
            <span className="min-w-0 truncate">
              {t('fittings.chargePicker.loaded')}{' '}
              <span className="font-semibold">{chargeShortName(loaded)}</span>
            </span>
            <span className="ml-auto shrink-0 text-text-dim tabular-nums">
              {t('fittings.chargePicker.dps', { value: Math.round(loaded.dps) })} ·{' '}
              {rangeText(t, loaded)}
            </span>
          </>
        ) : (
          <span className="text-text-dim">{t('fittings.chargePicker.nothingLoaded')}</span>
        )}
      </div>

      {picks && (
        <div
          className="border-y border-line py-0.5"
          role="group"
          aria-label={t('fittings.chargePicker.picks')}
        >
          {(
            [
              ['maxDamage', picks.maxDamage],
              ['maxRange', picks.maxRange],
              ['bestValue', picks.bestValue],
            ] as const
          ).map(([key, choice]) =>
            choice ? (
              <button
                key={key}
                type="button"
                disabled={!onLoad}
                onClick={() => onLoad?.(choice.typeId)}
                aria-pressed={group.loaded.has(choice.typeId)}
                className={chargeRowClassName(
                  group.loaded.has(choice.typeId),
                  'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-2 px-2 py-1 text-left'
                )}
              >
                <span className="text-[0.6875rem] text-text-dim">
                  {t(`fittings.chargePicker.${key}`)}
                </span>
                <span className="truncate text-xs font-semibold">{chargeShortName(choice)}</span>
                <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
                  {key === 'maxDamage'
                    ? t(
                        distance === null
                          ? 'fittings.chargePicker.dps'
                          : 'fittings.chargePicker.dpsHit',
                        {
                          value: Math.round(chargeScore(choice, distance)),
                        }
                      )
                    : key === 'maxRange'
                      ? t('fittings.chargePicker.km', { km: km(reach(choice)) })
                      : iskPerMinute(choice) !== null
                        ? t('fittings.chargePicker.perMinute', {
                            isk: formatIskExact(iskPerMinute(choice)!),
                          })
                        : t('fittings.chargePicker.isk', {
                            isk: formatIskExact(choice.price ?? 0),
                          })}
                </span>
              </button>
            ) : null
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="px-2 text-[0.6875rem] text-text-dim">{t('fittings.chargePicker.noMatch')}</p>
      ) : settings.view === 'chart' ? (
        <ChargeChart
          choices={visible}
          distance={distance}
          loaded={group.loaded}
          onLoad={onLoad}
          gunCount={group.count}
        />
      ) : settings.view === 'faction' ? (
        <FactionList
          choices={visible}
          group={group}
          settings={settings}
          maxReach={maxReach}
          onLoad={onLoad}
          wrap={wrap}
        />
      ) : (
        <TypeList
          choices={visible}
          group={group}
          settings={settings}
          maxReach={maxReach}
          loaded={loaded}
          onLoad={onLoad}
          wrap={wrap}
        />
      )}

      {settings.view !== 'chart' && visible.length > 0 && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('fittings.chargePicker.barHint')}{' '}
          {t('fittings.chargePicker.perMinuteHint', { count: group.count })}
          {pricesLoading && ` ${t('fittings.chargePicker.pricesLoading')}`}
        </p>
      )}
    </div>
  );
}
