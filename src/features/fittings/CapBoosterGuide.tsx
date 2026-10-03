import { Fragment, useMemo, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatSeconds } from '@/lib/duration';
import {
  capQuickPicks,
  capStrictlyWorseThan,
  iskPerGj,
  sortCapChoices,
} from '@/engine/fittings/capBoosterChoice';
import type { ChargeChoice } from '@/engine/fittings/chargeChoice';
import type { CapacitorStatus } from '@/engine/fittings/types';
import { formatIsk } from './chargeFormat';
import type { WeaponChargeGroup } from './useChargeChoices';

interface Props {
  group: WeaponChargeGroup;
  /** Loads the charge into every fitted booster of the group. */
  onLoad?: (chargeTypeId: number) => void;
  /** Wraps a loadable row in the Add panel's drag and right-click menu. */
  wrapRow?: (chargeTypeId: number, row: ReactNode) => ReactNode;
  pricesLoading: boolean;
}

const COLUMNS = 'grid-cols-[minmax(0,1fr)_3.4rem_2.4rem_1.8rem_2.6rem_2.4rem]';

/** "Navy 800": the table's name for a charge, its size and version. */
function shortName(name: string): string {
  return name.replace(/\s*Cap Booster\s*/, ' ').trim();
}

/** "62%" stable, "1m 35s" to empty: the two read apart without colour. */
function capShort(capacitor: CapacitorStatus): string {
  return capacitor.stable
    ? `${Math.round(capacitor.stablePercentage)}%`
    : formatSeconds(capacitor.depletesInSeconds);
}

function capText(t: TFunction, capacitor: CapacitorStatus): string {
  return capacitor.stable
    ? t('fittings.capGuide.stableAt', { pct: Math.round(capacitor.stablePercentage) })
    : t('fittings.capGuide.emptyIn', { time: formatSeconds(capacitor.depletesInSeconds) });
}

const gjText = (gj: number) =>
  gj.toLocaleString('en-US', { maximumFractionDigits: gj < 10 ? 1 : 0 });
const iskGjText = (isk: number) => isk.toLocaleString('en-US', { maximumSignificantDigits: 2 });

function rowLabel(t: TFunction, c: ChargeChoice): string {
  const cap = c.cap!;
  const perGj = iskPerGj(c);
  return [
    c.name,
    capText(t, cap.capacitor).toLowerCase(),
    t('fittings.capGuide.gjPerSecond', { value: gjText(cap.gjPerSecond) }),
    t('fittings.capGuide.perLoad', { count: cap.boostsPerLoad }),
    c.price === null
      ? t('fittings.capGuide.noPrice')
      : t('fittings.chargePicker.isk', { isk: formatIsk(c.price) }),
    ...(perGj === null ? [] : [t('fittings.capGuide.iskPerGj', { value: iskGjText(perGj) })]),
  ].join(', ');
}

/**
 * A cap booster group's Charge Picker: what's loaded and how the capacitor
 * fares on it, three quick picks (the smallest charge that holds the
 * capacitor, the most GJ/s, the cheapest GJ that holds it), then every
 * charge from smallest to biggest — each worked out with the whole Fitting
 * loaded (`engine/fittings/capBoosterChoice.ts`).
 */
export function CapBoosterGuide({ group, onLoad, wrapRow, pricesLoading }: Props) {
  const { t } = useTranslation();
  const choices = useMemo(
    () => sortCapChoices(group.choices.filter((c) => c.cap !== undefined)),
    [group.choices]
  );
  const picks = useMemo(() => capQuickPicks(choices), [choices]);
  const loaded = choices.find((c) => group.loaded.has(c.typeId)) ?? null;
  const wrap = (typeId: number, row: ReactNode) => (wrapRow ? wrapRow(typeId, row) : row);

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2 bg-panel-2 px-2 py-1.5 text-xs">
        {loaded?.cap ? (
          <>
            <TypeIcon typeId={loaded.typeId} size={32} width={20} height={20} />
            <span className="min-w-0 truncate">
              {t('fittings.chargePicker.loaded')}{' '}
              <span className="font-semibold text-accent">{loaded.name}</span>
            </span>
            <span
              className={cx(
                'ml-auto shrink-0 tabular-nums',
                loaded.cap.capacitor.stable ? 'text-text-dim' : 'text-warning'
              )}
            >
              {capText(t, loaded.cap.capacitor)}
            </span>
          </>
        ) : (
          <span className="text-text-dim">{t('fittings.chargePicker.nothingLoaded')}</span>
        )}
      </div>

      {picks && (
        <div
          className="bg-panel-2 py-0.5"
          role="group"
          aria-label={t('fittings.chargePicker.picks')}
        >
          {(
            [
              ['smallestStable', picks.smallestStable],
              ['mostGjPerSecond', picks.mostGjPerSecond],
              ['bestValue', picks.bestValue],
            ] as const
          ).map(([key, choice]) =>
            choice?.cap ? (
              <button
                key={key}
                type="button"
                disabled={!onLoad}
                onClick={() => onLoad?.(choice.typeId)}
                className={cx(
                  'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-2 border-l-2 px-2 py-1 text-left hover:bg-panel',
                  group.loaded.has(choice.typeId) ? 'border-accent' : 'border-transparent'
                )}
              >
                <span className="text-[0.6875rem] text-text-dim">
                  {t(`fittings.capGuide.${key}`)}
                </span>
                <span
                  className={cx(
                    'truncate text-xs font-semibold',
                    group.loaded.has(choice.typeId) && 'text-accent'
                  )}
                >
                  {choice.name}
                </span>
                <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
                  {key === 'smallestStable'
                    ? capText(t, choice.cap.capacitor)
                    : key === 'mostGjPerSecond'
                      ? t('fittings.capGuide.gjPerSecond', {
                          value: gjText(choice.cap.gjPerSecond),
                        })
                      : t('fittings.capGuide.iskPerGj', { value: iskGjText(iskPerGj(choice)!) })}
                </span>
              </button>
            ) : null
          )}
          {picks.smallestStable === null && (
            <p className="px-2 py-1 text-[0.6875rem] text-warning">
              {t('fittings.capGuide.noneStable')}
            </p>
          )}
        </div>
      )}

      <div className="text-[0.6875rem]">
        <div className={cx('grid gap-1 px-1 pb-1 text-text-dim', COLUMNS)}>
          <span>{t('fittings.capGuide.colCharge')}</span>
          <span className="text-right">{t('fittings.capGuide.colCap')}</span>
          <span className="text-right">{t('fittings.capGuide.colGj')}</span>
          <span className="text-right" title={t('fittings.capGuide.colLoadTitle')}>
            {t('fittings.capGuide.colLoad')}
          </span>
          <span className="text-right">{t('fittings.capGuide.colIsk')}</span>
          <span className="text-right">{t('fittings.capGuide.colIskGj')}</span>
        </div>
        {choices.map((c) => {
          const cap = c.cap!;
          const worse = capStrictlyWorseThan(c, choices);
          const perGj = iskPerGj(c);
          const isLoaded = group.loaded.has(c.typeId);
          return (
            <Fragment key={c.typeId}>
              {wrap(
                c.typeId,
                <button
                  type="button"
                  disabled={!onLoad || c.skillMissing}
                  onClick={() => onLoad?.(c.typeId)}
                  aria-pressed={isLoaded}
                  aria-label={rowLabel(t, c)}
                  className={cx(
                    'grid w-full gap-1 border-t border-line px-1 py-1 text-left tabular-nums hover:bg-panel-2 disabled:cursor-not-allowed',
                    COLUMNS,
                    (worse || c.skillMissing) && 'opacity-50'
                  )}
                >
                  <span className={cx('truncate', isLoaded && 'text-accent')}>
                    {isLoaded && '● '}
                    {shortName(c.name)}
                  </span>
                  <span className={cx('text-right', !cap.capacitor.stable && 'text-warning')}>
                    {capShort(cap.capacitor)}
                  </span>
                  <span className="text-right">{gjText(cap.gjPerSecond)}</span>
                  <span className="text-right">{cap.boostsPerLoad}</span>
                  <span className="text-right">{c.price === null ? '—' : formatIsk(c.price)}</span>
                  <span className="text-right">{perGj === null ? '—' : iskGjText(perGj)}</span>
                  {(worse || c.skillMissing) && (
                    <span className="col-span-full text-text-dim">
                      {c.skillMissing
                        ? t('fittings.chargePicker.needsSkill')
                        : t('fittings.capGuide.worseThan', { name: worse!.name })}
                    </span>
                  )}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>

      <p className="text-[0.6875rem] text-text-dim">
        {t('fittings.capGuide.hint', { count: group.count })}
        {pricesLoading && ` ${t('fittings.chargePicker.pricesLoading')}`}
      </p>
    </div>
  );
}
