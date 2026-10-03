import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TypeIcon,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  chargeLabel,
  chargeScore,
  chargeShortName,
  filterChoices,
  groupByFaction,
  groupByType,
  iskPerMinute,
  PRICEY_RATIO,
  quickPicks,
  rangesDiffer,
  reach,
  sortChoices,
  sortGroups,
  strictlyWorseThan,
  WEAK_SHARE,
  type ChargeChoice,
  type ChargeFactionGroup,
  type ChargeFilters,
  type ChargeSort,
  type ChargeTypeGroup,
} from '@/engine/fittings/chargeChoice';
import type { WeaponChargeGroup } from './useChargeChoices';
import { ChargeChart } from './ChargeChart';
import { formatIsk } from './chargeFormat';
import { pickerDistance, type ChargePickerSettings, type ChargeView } from './chargePickerSettings';

const km = (metres: number) => Math.round(metres / 1000);

interface ControlsProps {
  settings: ChargePickerSettings;
  onChange: (next: ChargePickerSettings) => void;
  /** The slider's top end, km. */
  maxKm: number;
}

/** View and Sort, the filter chips, and "Fighting at"'s distance slider (shown only while it's on). */
export function ChargePickerControls({ settings, onChange, maxKm }: ControlsProps) {
  const { t } = useTranslation();
  const set = (patch: Partial<ChargePickerSettings>) => onChange({ ...settings, ...patch });
  const setFilter = (key: keyof ChargeFilters) =>
    set({ filters: { ...settings.filters, [key]: !settings.filters[key] } });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[0.6875rem] text-text-dim">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span>{t('fittings.chargePicker.view')}</span>
          <Select value={settings.view} onValueChange={(view) => set({ view: view as ChargeView })}>
            <SelectTrigger
              size="sm"
              aria-label={t('fittings.chargePicker.view')}
              className="min-w-0 flex-1"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="type">{t('fittings.chargePicker.viewType')}</SelectItem>
              <SelectItem value="faction">{t('fittings.chargePicker.viewFaction')}</SelectItem>
              <SelectItem value="chart">{t('fittings.chargePicker.viewChart')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span>{t('fittings.chargePicker.sort')}</span>
          <Select value={settings.sort} onValueChange={(sort) => set({ sort: sort as ChargeSort })}>
            <SelectTrigger
              size="sm"
              aria-label={t('fittings.chargePicker.sort')}
              className="min-w-0 flex-1"
              disabled={settings.view === 'chart'}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="range">{t('fittings.chargePicker.sortRange')}</SelectItem>
              <SelectItem value="damage">{t('fittings.chargePicker.sortDamage')}</SelectItem>
              <SelectItem value="price">{t('fittings.chargePicker.sortPrice')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label={t('fittings.chargePicker.filterTech1')}
          tooltip={t('fittings.chargePicker.filterTech1Tip')}
          selected={settings.filters.tech1Only}
          onToggle={() => setFilter('tech1Only')}
        />
        <FilterChip
          label={t('fittings.chargePicker.filterCargo')}
          selected={settings.filters.inCargo}
          onToggle={() => setFilter('inCargo')}
        />
        <FilterChip
          label={t('fittings.chargePicker.filterUsable')}
          tooltip={t('fittings.chargePicker.filterUsableTip')}
          selected={settings.filters.usable}
          onToggle={() => setFilter('usable')}
        />
        <FilterChip
          label={t('fittings.chargePicker.fightingAt')}
          selected={settings.fightingAt}
          onToggle={() => set({ fightingAt: !settings.fightingAt })}
        />
      </div>
      {settings.fightingAt && (
        <div className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
          <label htmlFor="charge-picker-distance">{t('fittings.chargePicker.targetAt')}</label>
          <input
            id="charge-picker-distance"
            type="range"
            min={1}
            max={Math.max(5, maxKm)}
            step={1}
            value={Math.min(settings.distanceKm, Math.max(5, maxKm))}
            onChange={(event) => set({ distanceKm: Number(event.target.value) })}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-accent"
          />
          <span className="w-12 text-right text-text tabular-nums">
            {t('fittings.chargePicker.km', { km: settings.distanceKm })}
          </span>
        </div>
      )}
    </div>
  );
}

/** Solid optimal, dashed falloff, on one km scale shared down a list; a tick at the target distance. */
function RangeBar({
  choice,
  maxReach,
  distance,
}: {
  choice: ChargeChoice;
  maxReach: number;
  distance: number | null;
}) {
  const pct = (metres: number) => `${Math.min(100, (metres / maxReach) * 100)}%`;
  return (
    <span
      aria-hidden="true"
      className="relative block h-1.5 min-w-0 flex-1 border border-line bg-bg"
    >
      <span
        className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(90deg,var(--color-line-bright)_0_2px,transparent_2px_4px)]"
        style={{ width: pct(reach(choice)) }}
      />
      <span
        className="absolute inset-y-0 left-0 bg-text-dim"
        style={{ width: pct(choice.optimal) }}
      />
      {distance !== null && (
        <span className="absolute -inset-y-1 w-px bg-text" style={{ left: pct(distance) }} />
      )}
    </span>
  );
}

function rangeText(t: TFunction, choice: ChargeChoice) {
  return choice.falloff > 0
    ? t('fittings.chargePicker.range', { optimal: km(choice.optimal), falloff: km(choice.falloff) })
    : t('fittings.chargePicker.rangeMissile', { optimal: km(choice.optimal) });
}

function tierLabel(t: TFunction, choice: ChargeChoice): string {
  if (choice.tier === 'faction') return choice.faction ?? choice.name;
  return t(choice.tier === 'tech2' ? 'fittings.chargePicker.tech2' : 'fittings.chargePicker.tech1');
}

function DamageText({ choice }: { choice: ChargeChoice }) {
  const { t } = useTranslation();
  if (!choice.damage) return null;
  const parts = (['em', 'thermal', 'kinetic', 'explosive'] as const)
    .filter((key) => choice.damage![key] > 0.005)
    .map((key) => ({ key, share: Math.round(choice.damage![key] * 100) }));
  // Rounded shares can sum to 99 or 101: the largest takes up the difference.
  const largest = parts.reduce<(typeof parts)[number] | null>(
    (a, b) => (a === null || b.share > a.share ? b : a),
    null
  );
  if (largest) largest.share += 100 - parts.reduce((sum, p) => sum + p.share, 0);
  const swatch: Record<string, string> = {
    em: 'bg-dmg-em',
    thermal: 'bg-dmg-thermal',
    kinetic: 'bg-dmg-kinetic',
    explosive: 'bg-dmg-explosive',
  };
  return (
    <div className="flex flex-wrap gap-x-3 text-[0.6875rem] text-text-dim">
      {parts.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1">
          <span aria-hidden="true" className={cx('inline-block size-[7px]', swatch[p.key])} />
          {t(`fittings.stats.damageType.${p.key}`)} {p.share}%
        </span>
      ))}
    </div>
  );
}

/** A loadable row's accessible name: its cells run together otherwise. */
function rowLabel(t: TFunction, c: ChargeChoice, distance: number | null): string {
  const label = t('fittings.chargePicker.rowLabel', {
    name: c.name,
    dps: Math.round(chargeScore(c, distance)),
    price:
      c.price === null
        ? t('fittings.chargePicker.noPrice')
        : t('fittings.chargePicker.isk', { isk: formatIsk(c.price) }),
  });
  return c.skillMissing ? `${label}. ${t('fittings.chargePicker.needsSkill')}` : label;
}

function signedPct(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)}%`;
}

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
              <span className="font-semibold text-accent">{chargeShortName(loaded)}</span>
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
          className="bg-panel-2 py-0.5"
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
                className={cx(
                  'grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-2 border-l-2 px-2 py-1 text-left hover:bg-panel',
                  group.loaded.has(choice.typeId) ? 'border-accent' : 'border-transparent'
                )}
              >
                <span className="text-[0.6875rem] text-text-dim">
                  {t(`fittings.chargePicker.${key}`)}
                </span>
                <span
                  className={cx(
                    'truncate text-xs font-semibold',
                    group.loaded.has(choice.typeId) && 'text-accent'
                  )}
                >
                  {chargeShortName(choice)}
                </span>
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
                            isk: formatIsk(iskPerMinute(choice)!),
                          })
                        : t('fittings.chargePicker.isk', { isk: formatIsk(choice.price ?? 0) })}
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

interface ListProps {
  choices: ChargeChoice[];
  group: WeaponChargeGroup;
  settings: ChargePickerSettings;
  maxReach: number;
  onLoad?: (chargeTypeId: number) => void;
  wrap: (typeId: number, row: ReactNode) => ReactNode;
}

function TypeList({
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
    const weak = distance !== null && !rep.skillMissing && score < best * WEAK_SHARE;
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
      <div key={g.baseTypeId} className={cx('border-b border-line', weak && 'opacity-45')}>
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
          className={cx(
            'grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-l-2 px-1.5 py-1.5 text-left hover:bg-panel-2',
            hasLoaded ? 'border-accent' : 'border-transparent'
          )}
        >
          <span className="row-span-2 self-start">
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
                    isk: formatIsk(Math.min(...prices)),
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
          <div className="px-1.5 pt-2.5 pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('fittings.chargePicker.tech2')}
          </div>
          {tech2.map((g, i) => row(g, i, tech2.length))}
        </>
      )}
    </div>
  );
}

function TypeDetail({
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
        <div className="grid grid-cols-[minmax(0,1fr)_2.4rem_3rem_3.6rem] gap-0.5 pb-1 text-text-dim">
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
                  aria-label={rowLabel(t, c, distance)}
                  className={cx(
                    'grid w-full grid-cols-[minmax(0,1fr)_2.4rem_3rem_3.6rem] gap-0.5 border-t border-line py-1 text-left tabular-nums hover:bg-panel-2 disabled:cursor-not-allowed',
                    (worse || c.skillMissing) && 'opacity-50'
                  )}
                >
                  <span className={cx('truncate', isLoaded && 'text-accent')}>
                    {isLoaded && '● '}
                    {tierLabel(t, c)}
                    {c.cargo > 0 &&
                      ` · ${t('fittings.chargePicker.inCargo', { count: formatCompactNumber(c.cargo) })}`}
                  </span>
                  <span className="text-right">{Math.round(chargeScore(c, distance))}</span>
                  <span className="text-right">{c.price === null ? '—' : formatIsk(c.price)}</span>
                  <span
                    className={cx('text-right', pricey && 'text-warning')}
                    title={
                      c.price !== null && perMin === null
                        ? t('fittings.chargePicker.lastsTitle')
                        : undefined
                    }
                  >
                    {perMin === null ? '—' : formatIsk(perMin)}
                    {/* Colour is never the only signal (DESIGN.md §7). */}
                    {pricey && <span aria-label={t('fittings.chargePicker.priceyLabel')}> ▲</span>}
                  </span>
                  {(worse || c.skillMissing) && (
                    <span className="col-span-full text-text-dim">
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

function FactionList({ choices, group, settings, maxReach, onLoad, wrap }: ListProps) {
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
        const groupBest = Math.max(0, ...rows.map((c) => chargeScore(c, distance)));
        const name =
          g.tier === 'faction' ? (g.faction ?? '') : t(`fittings.chargePicker.${g.tier}`);
        return (
          <div key={g.key} className={cx('border-b border-line', allWorse && 'opacity-50')}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.key)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 px-1.5 py-1.5 text-left hover:bg-panel-2"
            >
              <span className="flex min-w-0 items-baseline gap-1.5 text-xs font-semibold">
                <span aria-hidden="true" className="text-text-dim">
                  {isOpen ? '▾' : '▸'}
                </span>
                <span className="truncate">{name}</span>
                {hasLoaded && (
                  <span className="shrink-0 text-[0.6875rem] text-accent">
                    {t('fittings.chargePicker.loadedTag')}
                  </span>
                )}
              </span>
              <span className="text-[0.6875rem] text-text-dim">
                {t('fittings.chargePicker.types', { count: g.choices.length })}
              </span>
              <span className="col-span-full text-[0.6875rem] text-text-dim">
                {meta(g)}
                {allWorse &&
                  ` · ${t('fittings.chargePicker.worseThan', { name: tierLabel(t, worse[0]!) })}`}
              </span>
            </button>
            {isOpen && (
              <div className="pb-1">
                <div className="grid grid-cols-[5.6rem_minmax(0,1fr)_2.2rem_3.4rem] gap-1.5 py-0.5 pr-1.5 pl-3.5 text-[0.6875rem] text-text-dim">
                  <span>{t('fittings.chargePicker.colCargo')}</span>
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
                          aria-label={rowLabel(t, c, distance)}
                          className={cx(
                            'grid w-full grid-cols-[5.6rem_minmax(0,1fr)_2.2rem_3.4rem] items-center gap-1.5 border-l-2 py-1.5 pr-1.5 pl-3 text-left text-[0.6875rem] tabular-nums hover:bg-panel-2 disabled:cursor-not-allowed',
                            isLoaded ? 'border-accent text-accent' : 'border-transparent',
                            distance !== null &&
                              !c.skillMissing &&
                              score < groupBest * WEAK_SHARE &&
                              'opacity-45',
                            (c.skillMissing || (!allWorse && worse[i] !== null)) && 'opacity-50'
                          )}
                        >
                          <span className="truncate">
                            {chargeLabel(c.baseName)}
                            {c.cargo > 0 && <span className="text-text-dim"> ●</span>}
                          </span>
                          <RangeBar choice={c} maxReach={maxReach} distance={distance} />
                          <span className="text-right">{Math.round(score)}</span>
                          <span className={cx('text-right', pricey && 'text-warning')}>
                            {c.price === null ? '—' : formatIsk(c.price)}
                            {pricey && (
                              <span aria-label={t('fittings.chargePicker.priceyLabel')}> ▲</span>
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
