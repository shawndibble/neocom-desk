import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Eyebrow, FieldError, Radio, SegmentedControl, TextInput } from '@/components/ui';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import {
  customM3Problem,
  MAX_CUSTOM_HAULS,
  type HaulerOption,
  type HaulerOverride,
  type MovePlan,
} from '@/engine/assets/movePlan';
import { ownedFirstOrder } from './ownedHullText';
import { OwnedMark } from './MovePlanOwnedMark';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';

const CUSTOM = 'custom';

/** Rows shown before "Show more"; the chosen hauler is always among them. */
const INLINE_ROWS = 4;

/** A phone stacks the carry note and the owned mark under the name; from `sm` up each gets a column. */
const ROW_COLUMNS =
  'grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[1rem_minmax(0,11rem)_7.5rem_minmax(0,1fr)_auto]';

interface HaulerPickerProps {
  plan: MovePlan;
  override: HaulerOverride | undefined;
  /** Undefined goes back to the suggested hauler. */
  onPick: (override: HaulerOverride | undefined) => void;
  /** List owned hulls first; the plan's own ranking is untouched. */
  ownedFirst?: boolean;
  onOwnedFirstChange?: (on: boolean) => void;
  /** Every hauler is listed, not just the first few. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Trips a hauler takes, counting the ships flown. */
  tripsOf?: (option: HaulerOption) => number;
}

/**
 * Per-plan hauler choice: one row per hauler (trips, what it cannot carry, whether you own one),
 * or one typed m³. Lives only as long as the plan; the saved Cargo Space is never touched.
 */
export function HaulerPicker({
  plan,
  override,
  onPick,
  ownedFirst = false,
  onOwnedFirstChange,
  expanded = false,
  onToggleExpanded,
  tripsOf = (o) => o.trips,
}: HaulerPickerProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const groupName = useId();
  const [customMode, setCustomMode] = useState(override !== undefined && 'customM3' in override);
  const [text, setText] = useState(
    override && 'customM3' in override ? maskNumber(override.customM3) : ''
  );
  const { totalM3 } = plan.totals;
  /** Why the typed size cannot be used; blank and garbage read as not a number. */
  const problem = (raw: string) => {
    const value = unmaskNumber(raw);
    return value === undefined ? 'invalid' : customM3Problem(value, totalM3);
  };
  const shown = customMode ? problem(text) : null;
  const suggestedId = plan.suggested?.hull.typeId;
  const activeId = plan.active?.hull.typeId;
  const selected = customMode ? CUSTOM : activeId === undefined ? '' : String(activeId);

  const ordered = ownedFirstOrder(plan.comparison, ownedFirst);
  const visible = expanded
    ? ordered
    : ordered.filter((o, i) => i < INLINE_ROWS || (!customMode && o.hull.typeId === activeId));
  const hidden = ordered.length - visible.length;
  const mostTrips = Math.max(1, ...ordered.map(tripsOf));
  const anyOwned = plan.comparison.some((o) => o.hull.owned);

  function choose(value: string) {
    if (value === CUSTOM) {
      setCustomMode(true);
      const start = Math.round(plan.active?.hull.capacityM3 ?? 0);
      const seed = start > 0 && customM3Problem(start, totalM3) === null ? start : null;
      setText(seed === null ? '' : maskNumber(seed));
      if (seed !== null) onPick({ customM3: seed });
      return;
    }
    setCustomMode(false);
    const hullTypeId = Number(value);
    onPick(hullTypeId === suggestedId ? undefined : { hullTypeId });
  }

  function onType(raw: string) {
    setText(raw);
    // A bad entry keeps the last good plan on screen; it is never read as unlimited.
    if (problem(raw) === null) onPick({ customM3: unmaskNumber(raw)! });
  }

  return (
    <section
      aria-label={t('assets.movePlan.haulerLabel')}
      className="rounded-xs border border-line bg-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Eyebrow as="h3">{t('assets.movePlan.haulerLabel')}</Eyebrow>
        {anyOwned && onOwnedFirstChange && (
          <SegmentedControl
            size="sm"
            label={t('assets.movePlan.haulerOrder')}
            value={ownedFirst ? 'owned' : 'trips'}
            onChange={(v) => onOwnedFirstChange(v === 'owned')}
            options={[
              { value: 'owned', label: t('assets.movePlan.ownedFirst') },
              { value: 'trips', label: t('assets.movePlan.fewestTrips') },
            ]}
          />
        )}
      </div>
      <div role="radiogroup" aria-label={t('assets.movePlan.haulerLabel')}>
        {visible.map((o) => {
          const id = String(o.hull.typeId);
          const trips = tripsOf(o);
          return (
            <div key={id} className="border-b border-line last:border-b-0">
              <label
                className={cx(
                  ROW_COLUMNS,
                  'min-h-9 cursor-pointer px-3 py-1.5',
                  rowInteractiveClassName,
                  selected === id && 'bg-accent/10'
                )}
              >
                <Radio
                  name={groupName}
                  value={id}
                  checked={selected === id}
                  onChange={() => choose(id)}
                  aria-label={o.hull.name}
                />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-semibold">
                  {o.hull.name}
                  {o.hull.typeId === suggestedId && (
                    <Pill tone="neutral">{t('assets.movePlan.suggestedTag')}</Pill>
                  )}
                </span>
                <span className="flex items-baseline gap-2 text-sm tabular-nums">
                  <span className="min-w-5 text-right font-bold sm:text-left sm:font-normal">
                    {trips}
                  </span>
                  <span className="text-xs text-text-dim sm:sr-only">
                    {t('assets.movePlan.tripsLabel', { count: trips })}
                  </span>
                  <span
                    aria-hidden
                    className="hidden h-1.5 w-20 self-center overflow-hidden rounded-xs bg-line sm:block"
                  >
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${(trips / mostTrips) * 100}%` }}
                    />
                  </span>
                </span>
                <span className="col-span-2 col-start-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm sm:contents">
                  <span className={o.unfitCount > 0 ? 'text-warning' : 'text-text-dim'}>
                    {o.unfitCount > 0
                      ? t('assets.movePlan.cantCarry', { count: o.unfitCount })
                      : t('assets.movePlan.carriesAll')}
                  </span>
                  <OwnedMark t={t} hull={o.hull} />
                </span>
              </label>
            </div>
          );
        })}
        <div className="border-t border-line">
          <label
            className={cx(
              'flex min-h-9 cursor-pointer items-center gap-3 px-3 py-1.5',
              rowInteractiveClassName,
              selected === CUSTOM && 'bg-accent/10'
            )}
          >
            <Radio
              name={groupName}
              value={CUSTOM}
              checked={selected === CUSTOM}
              onChange={() => choose(CUSTOM)}
            />
            <span className="font-semibold">{t('assets.movePlan.customOption')}</span>
          </label>
          {customMode && (
            <div className="flex flex-col gap-1 px-3 pb-2 pl-10">
              <div className="flex items-center gap-2">
                <TextInput
                  aria-label={t('assets.movePlan.customAria')}
                  size="sm"
                  inputMode="decimal"
                  className="w-32"
                  value={text}
                  aria-invalid={shown !== null || undefined}
                  aria-describedby={shown !== null ? errorId : undefined}
                  onChange={(e) => onType(e.target.value)}
                />
                <span className="text-sm text-text-dim">m³</span>
              </div>
              {shown && (
                <FieldError id={errorId} className="text-xs">
                  {shown === 'tooSmall'
                    ? t('assets.movePlan.customTooSmall', {
                        min: maskNumber(Math.ceil(totalM3 / MAX_CUSTOM_HAULS)),
                      })
                    : t('assets.movePlan.customInvalid')}
                </FieldError>
              )}
            </div>
          )}
        </div>
      </div>
      {onToggleExpanded && (hidden > 0 || expanded) && ordered.length > INLINE_ROWS && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className="w-full rounded-none border-t border-line"
        >
          {expanded
            ? t('assets.movePlan.showFewerHaulers')
            : t('assets.movePlan.showMoreHaulers', { count: hidden })}
        </Button>
      )}
    </section>
  );
}
