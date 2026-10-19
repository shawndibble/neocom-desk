import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import * as Icon from '@/components/ui/icons';
import { Fragment, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, TypeIcon } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  chargeLabel,
  chargeScore,
  groupByFaction,
  groupByType,
  iskPerMinute,
  PRICEY_RATIO,
  rangesDiffer,
  sortChoices,
  sortGroups,
  strictlyWorseThan,
  type ChargeChoice,
  type ChargeFactionGroup,
  type ChargeTypeGroup,
} from '@/engine/fittings/chargeChoice';
import type { WeaponChargeGroup } from '../useChargeChoices';
import { formatIskExact } from '../chargeFormat';
import { chargeRowClassName } from '../chargeRowStyle';
import { pickerDistance, type ChargePickerSettings } from '../chargePickerSettings';

import { DamageText, RangeBar } from './chargeRowParts';
import { rangeText, rowLabel, signedPct, tierLabel } from './chargeRowText';

export interface ListProps {
  choices: ChargeChoice[];
  group: WeaponChargeGroup;
  settings: ChargePickerSettings;
  maxReach: number;
  onLoad?: (chargeTypeId: number) => void;
  wrap: (typeId: number, row: ReactNode) => ReactNode;
}

export function TypeList({
  choices,
  group,
  settings,
  maxReach,
  loaded,
  onLoad,
  wrap,
}: ListProps & { loaded: ChargeChoice | null }) {
  const { t } = useTranslation();
  const distance = pickerDistance(settings);
  const all = groupByType(choices);
  const base = sortGroups(
    all.filter((g) => g.tier === 'tech1'),
    settings.sort,
    distance
  );
  const tech2 = sortGroups(
    all.filter((g) => g.tier === 'tech2'),
    settings.sort,
    distance
  );
  const [open, setOpen] = useState<number | null>(loaded?.baseTypeId ?? null);
  const usableReps = [...base, ...tech2]
    .map((g) => g.representative)
    .filter((c) => !c.skillMissing);
  const best =
    distance === null ? 0 : Math.max(0, ...usableReps.map((c) => chargeScore(c, distance)));
  const showRank = settings.sort === 'range' && rangesDiffer(base);

  const row = (g: ChargeTypeGroup, index: number, count: number) => {
    const rep = g.representative;
    const score = chargeScore(rep, distance);
    const isOpen = open === g.baseTypeId;
    const hasLoaded = g.choices.some((c) => group.loaded.has(c.typeId));
    const cargo = g.choices.reduce((n, c) => n + c.cargo, 0);
    const prices = g.choices.map((c) => c.price).filter((p): p is number => p !== null);
    const isBest = distance !== null && best > 0 && !rep.skillMissing && score === best;
    const rank =
      showRank && g.tier === 'tech1'
        ? index === 0
          ? t('fittings.chargePicker.rankLongest')
          : index === count - 1
            ? t('fittings.chargePicker.rankMostDamage')
            : null
        : null;
    return (
      <div key={g.baseTypeId} className={'border-b border-line'}>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={[
            t('fittings.chargePicker.typeRowLabel', {
              name: chargeLabel(g.name),
              dps: Math.round(score),
              range: rangeText(t, rep),
            }),
            cargo > 0
              ? t('fittings.chargePicker.inCargo', { count: formatCompactNumber(cargo) })
              : null,
            rep.skillMissing ? t('fittings.chargePicker.needsSkill') : null,
          ]
            .filter(Boolean)
            .join(', ')}
          onClick={() => setOpen(isOpen ? null : g.baseTypeId)}
          className={chargeRowClassName(
            hasLoaded,
            'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-1.5 py-1.5 text-left'
          )}
        >
          <span className="row-span-2 flex items-center gap-1 self-start">
            <Caret expanded={isOpen} />
            <TypeIcon typeId={rep.typeId} size={32} width={20} height={20} />
          </span>
          <span className="flex min-w-0 items-baseline gap-1.5 text-xs font-semibold">
            <span className="shrink-0">{chargeLabel(g.name)}</span>
            {rank && (
              <span className="min-w-0 truncate text-[0.6875rem] font-normal text-text-dim">
                {rank}
              </span>
            )}
            {isBest && (
              <span className="shrink-0 text-[0.6875rem] text-success">
                {t('fittings.chargePicker.bestAt', { km: settings.distanceKm })}
              </span>
            )}
            {cargo > 0 && (
              <span className="shrink-0 text-[0.6875rem] font-normal text-text-dim">
                {t('fittings.chargePicker.inCargo', { count: formatCompactNumber(cargo) })}
              </span>
            )}
            {rep.skillMissing && (
              <span className="shrink-0 text-[0.6875rem] text-warning">
                {t('fittings.chargePicker.skillTag')}
              </span>
            )}
          </span>
          <span className="text-right text-xs whitespace-nowrap tabular-nums">
            {Math.round(score)}
            <span className="ml-0.5 text-[0.6875rem] text-text-dim">
              {t(
                distance === null
                  ? 'fittings.chargePicker.dpsUnit'
                  : 'fittings.chargePicker.dpsHitUnit'
              )}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <RangeBar choice={rep} maxReach={maxReach} distance={distance} />
            <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
              {rangeText(t, rep)}
            </span>
          </span>
          <span className="text-right text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
            {prices.length === 0
              ? t('fittings.chargePicker.noPrice')
              : t(
                  g.choices.length > 1
                    ? 'fittings.chargePicker.fromIsk'
                    : 'fittings.chargePicker.isk',
                  {
                    isk: formatIskExact(Math.min(...prices)),
                  }
                )}
          </span>
        </button>
        {isOpen && (
          <TypeDetail
            group={g}
            all={choices}
            loaded={loaded}
            loadedIds={group.loaded}
            distance={distance}
            onLoad={onLoad}
            wrap={wrap}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      {base.map((g, i) => row(g, i, base.length))}
      {tech2.length > 0 && (
        <>
          <div className={cx(eyebrowClassName, 'px-1.5 pt-2.5 pb-1')}>
            {t('fittings.chargePicker.tech2')}
          </div>
          {tech2.map((g, i) => row(g, i, tech2.length))}
        </>
      )}
    </div>
  );
}

export function TypeDetail({
  group,
  all,
  loaded,
  loadedIds,
  distance,
  onLoad,
  wrap,
}: {
  group: ChargeTypeGroup;
  all: ChargeChoice[];
  loaded: ChargeChoice | null;
  loadedIds: ReadonlySet<number>;
  distance: number | null;
  onLoad?: (chargeTypeId: number) => void;
  wrap: (typeId: number, row: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const rep = group.representative;
  const tech1 = group.choices.find((c) => c.tier === 'tech1');
  const tech1PerMin = tech1 ? iskPerMinute(tech1) : null;
  return (
    <div className="space-y-2 pt-1 pr-1.5 pb-2.5 pl-8">
      <DamageText choice={rep} />
      <div className="flex flex-wrap gap-x-2.5 text-[0.6875rem] text-text-dim tabular-nums">
        {!loaded ? null : loaded.baseTypeId === group.baseTypeId ? (
          <span>{t('fittings.chargePicker.typeLoaded', { tier: tierLabel(t, loaded) })}</span>
        ) : (
          <>
            <span className={rep.dps >= loaded.dps ? 'text-success' : 'text-danger'}>
              {t('fittings.chargePicker.deltaDps', {
                value: signedPct(rep.dps / Math.max(1, loaded.dps) - 1),
              })}
            </span>
            <span className={rep.optimal >= loaded.optimal ? 'text-success' : 'text-danger'}>
              {t('fittings.chargePicker.deltaOptimal', {
                value: signedPct(rep.optimal / Math.max(1, loaded.optimal) - 1),
              })}
            </span>
            <span>{t('fittings.chargePicker.vsLoaded')}</span>
          </>
        )}
      </div>
      <div className="text-[0.6875rem]">
        <div className="grid grid-cols-[minmax(0,1fr)_2.4rem_3.6rem_4rem] gap-0.5 pb-1 text-text-dim">
          <span>{t('fittings.chargePicker.colTier')}</span>
          <span className="text-right">{t('fittings.chargePicker.dpsUnit')}</span>
          <span className="text-right">{t('fittings.chargePicker.colIsk')}</span>
          <span className="text-right">{t('fittings.chargePicker.colIskMinute')}</span>
        </div>
        {group.choices.map((c) => {
          const worse = strictlyWorseThan(c, all);
          const perMin = iskPerMinute(c);
          const pricey =
            tech1PerMin !== null && perMin !== null && perMin > tech1PerMin * PRICEY_RATIO;
          const isLoaded = loadedIds.has(c.typeId);
          return (
            <Fragment key={c.typeId}>
              {wrap(
                c.typeId,
                <button
                  type="button"
                  disabled={!onLoad || c.skillMissing}
                  onClick={() => onLoad?.(c.typeId)}
                  aria-pressed={isLoaded}
                  aria-label={rowLabel(t, c, distance, { pricey, worse })}
                  className={chargeRowClassName(
                    isLoaded,
                    cx(
                      'grid w-full grid-cols-[minmax(0,1fr)_2.4rem_3.6rem_4rem] gap-0.5 border-t border-line py-1 text-left tabular-nums',
                      c.skillMissing && 'opacity-50'
                    )
                  )}
                >
                  <span className="truncate">
                    {tierLabel(t, c)}
                    {isLoaded && ` · ${t('fittings.add.loaded')}`}
                    {c.cargo > 0 &&
                      ` · ${t('fittings.chargePicker.inCargo', { count: formatCompactNumber(c.cargo) })}`}
                  </span>
                  <span className="text-right">{Math.round(chargeScore(c, distance))}</span>
                  <span className="text-right">
                    {c.price === null ? '—' : formatIskExact(c.price)}
                  </span>
                  <span className={cx('text-right', pricey && 'text-warning')}>
                    {perMin === null ? '—' : formatIskExact(perMin)}
                    {/* Colour is never the only signal (DESIGN.md §7). */}
                    {pricey && (
                      <Icon.PriceHigh
                        size={Icon.ICON_SIZE.sm}
                        className="ml-1 inline"
                        aria-hidden
                      />
                    )}
                  </span>
                  {(worse || c.skillMissing) && (
                    <span className="col-span-full text-text-dim">
                      {!c.skillMissing && (
                        <Icon.Descending
                          size={Icon.ICON_SIZE.sm}
                          className="mr-1 inline"
                          aria-hidden
                        />
                      )}
                      {c.skillMissing
                        ? t('fittings.chargePicker.needsSkill')
                        : t('fittings.chargePicker.worseThan', { name: tierLabel(t, worse!) })}
                    </span>
                  )}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function FactionList({ choices, group, settings, maxReach, onLoad, wrap }: ListProps) {
  const { t } = useTranslation();
  const distance = pickerDistance(settings);
  const groups = groupByFaction(choices);
  const loadedKey = groups.find((g) => g.choices.some((c) => group.loaded.has(c.typeId)))?.key;
  const [open, setOpen] = useState<string | null>(loadedKey ?? groups[0]?.key ?? null);

  const meta = (g: ChargeFactionGroup) => {
    if (g.tier === 'tech1') return t('fittings.chargePicker.tech1Meta');
    if (g.tier === 'tech2') return t('fittings.chargePicker.tech2Meta');
    if (g.damageGain === null) return null;
    return g.priceRatio === null
      ? t('fittings.chargePicker.factionMetaNoPrice', { gain: Math.round(g.damageGain * 100) })
      : t('fittings.chargePicker.factionMeta', {
          gain: Math.round(g.damageGain * 100),
          ratio: Math.round(g.priceRatio),
        });
  };

  return (
    <div>
      {groups.map((g) => {
        const isOpen = open === g.key;
        const rows = sortChoices(g.choices, settings.sort, distance);
        const worse = rows.map((c) => strictlyWorseThan(c, choices));
        const allWorse = worse.length > 0 && worse.every((w) => w !== null);
        const hasLoaded = g.choices.some((c) => group.loaded.has(c.typeId));
        const name =
          g.tier === 'faction' ? (g.faction ?? '') : t(`fittings.chargePicker.${g.tier}`);
        return (
          <div key={g.key} className={'border-b border-line'}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.key)}
              className={cx(
                'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 px-1.5 py-1.5 text-left',
                rowInteractiveClassName,
                focusRingInsetClassName
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                <Caret expanded={isOpen} />
                <span className="truncate">{name}</span>
                {hasLoaded && (
                  <span className="shrink-0 text-[0.6875rem] text-success">
                    {t('fittings.chargePicker.loadedTag')}
                  </span>
                )}
              </span>
              <span className="text-[0.6875rem] text-text-dim">
                {t('fittings.chargePicker.types', { count: g.choices.length })}
              </span>
              <span className="col-span-full text-[0.6875rem] text-text-dim">
                {meta(g)}
                {allWorse && (
                  <>
                    {' · '}
                    <Icon.Descending size={Icon.ICON_SIZE.sm} className="mr-1 inline" aria-hidden />
                    {t('fittings.chargePicker.worseThan', { name: tierLabel(t, worse[0]!) })}
                  </>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="pb-1">
                <div className="grid grid-cols-[5.6rem_minmax(0,1fr)_2.2rem_3.8rem] gap-1.5 py-0.5 pr-1.5 pl-3.5 text-[0.6875rem] text-text-dim">
                  <span>
                    <Icon.InCargo size={Icon.ICON_SIZE.sm} className="mr-1 inline" aria-hidden />
                    {t('fittings.chargePicker.colCargo')}
                  </span>
                  <span>{t('fittings.chargePicker.colRange')}</span>
                  <span className="text-right">{t('fittings.chargePicker.dpsUnit')}</span>
                  <span className="text-right">{t('fittings.chargePicker.colIsk')}</span>
                </div>
                {rows.map((c, i) => {
                  const score = chargeScore(c, distance);
                  const isLoaded = group.loaded.has(c.typeId);
                  const tech1 = choices.find(
                    (x) => x.tier === 'tech1' && x.baseTypeId === c.baseTypeId
                  );
                  const perMin = iskPerMinute(c);
                  const tech1PerMin = tech1 ? iskPerMinute(tech1) : null;
                  const pricey =
                    c.tier === 'faction' &&
                    perMin !== null &&
                    tech1PerMin !== null &&
                    perMin > tech1PerMin * PRICEY_RATIO;
                  return (
                    <Fragment key={c.typeId}>
                      {wrap(
                        c.typeId,
                        <button
                          type="button"
                          disabled={!onLoad || c.skillMissing}
                          onClick={() => onLoad?.(c.typeId)}
                          aria-pressed={isLoaded}
                          aria-label={rowLabel(t, c, distance, { pricey, worse: worse[i] })}
                          className={chargeRowClassName(
                            isLoaded,
                            cx(
                              'grid w-full grid-cols-[5.6rem_minmax(0,1fr)_2.2rem_3.8rem] items-center gap-1.5 py-1.5 pr-1.5 pl-3 text-left text-[0.6875rem] tabular-nums',
                              c.skillMissing && 'opacity-50'
                            )
                          )}
                        >
                          <span className="truncate">
                            {chargeLabel(c.baseName)}
                            {isLoaded && ` · ${t('fittings.add.loaded')}`}
                            {c.cargo > 0 && (
                              <Icon.InCargo
                                size={Icon.ICON_SIZE.sm}
                                className="ml-1 inline text-text-dim"
                                aria-hidden
                              />
                            )}
                          </span>
                          <RangeBar choice={c} maxReach={maxReach} distance={distance} />
                          <span className="text-right">{Math.round(score)}</span>
                          <span className={cx('text-right', pricey && 'text-warning')}>
                            {c.price === null ? '—' : formatIskExact(c.price)}
                            {pricey && (
                              <Icon.PriceHigh
                                size={Icon.ICON_SIZE.sm}
                                className="ml-1 inline"
                                aria-hidden
                              />
                            )}
                          </span>
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
