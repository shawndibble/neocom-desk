import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Caret, Checkbox } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
  touchCheckboxLabelClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatCubicMetres } from '@/lib/volume';
import { Rail, RailHeading, RailStop } from './MovePlanRail';
import type { PickerStack } from './movePlanInput';

interface PickerListProps {
  /** Stacks by Character, then by pickup location. */
  grouped: ReadonlyMap<number, ReadonlyMap<number, PickerStack[]>>;
  characterName: (characterId: number) => string;
  placeLabel: (locationId: number) => string;
  typeName: (typeId: number) => string;
  /** Per-unit packaged volume by type. */
  unitM3: ReadonlyMap<number, number>;
  hueOf: (locationId: number) => number;
  selected: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
  collapsed: ReadonlySet<string>;
  onToggleCollapsed: (groupKey: string) => void;
  /** Pickup locations the destination covers: nothing there needs moving. */
  atDestination: ReadonlySet<number>;
}

/** What to move: each Character's pickup locations on the rail, stacks ticked inside. */
export function PickerList({
  grouped,
  characterName,
  placeLabel,
  typeName,
  unitM3,
  hueOf,
  selected,
  onToggle,
  collapsed,
  onToggleCollapsed,
  atDestination,
}: PickerListProps) {
  const { t } = useTranslation();
  return (
    <Rail>
      {[...grouped].map(([characterId, byPlace]) => {
        const who = characterName(characterId);
        const movableKeys = [...byPlace]
          .filter(([locationId]) => !atDestination.has(locationId))
          .flatMap(([, stacks]) => stacks.map((s) => s.key));
        return (
          <PickerCharacter
            key={characterId}
            name={who}
            keys={movableKeys}
            selected={selected}
            onToggle={onToggle}
          >
            {[...byPlace].map(([locationId, stacks]) => {
              const here = atDestination.has(locationId);
              const keys = stacks.map((s) => s.key);
              const groupKey = `${characterId}:${locationId}`;
              const isOpen = !collapsed.has(groupKey);
              const groupId = `move-plan-group-${groupKey}`;
              const picked = here ? 0 : keys.filter((k) => selected.has(k)).length;
              const place = placeLabel(locationId);
              return (
                <RailStop key={locationId} hue={hueOf(locationId)} neutral={here}>
                  <div
                    className={cx(
                      'overflow-hidden rounded-xs border border-line',
                      here ? 'bg-transparent' : 'bg-panel-2'
                    )}
                  >
                    <div className="flex items-center">
                      <GroupCheckbox
                        keys={keys}
                        selected={selected}
                        disabled={here}
                        onToggle={onToggle}
                        label={t('assets.movePlan.selectAllAt', { place, character: who })}
                      />
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? groupId : undefined}
                        aria-label={
                          here
                            ? t('assets.movePlan.groupToggleHere', { character: who, place })
                            : t('assets.movePlan.groupToggle', {
                                character: who,
                                place,
                                picked,
                                total: keys.length,
                              })
                        }
                        onClick={() => onToggleCollapsed(groupKey)}
                        className={`${tappableRowClassName} ${rowInteractiveClassName} ${focusRingInsetClassName} flex min-w-0 flex-1 items-center gap-2.5 pr-3 pl-1 text-left`}
                      >
                        <Caret expanded={isOpen} />
                        <span className="min-w-0 flex-1 py-1.5 leading-tight font-bold [overflow-wrap:anywhere]">
                          {place}
                        </span>
                        <span className="shrink-0 pl-2 text-xs whitespace-nowrap text-text-dim tabular-nums">
                          {here
                            ? t('assets.movePlan.atDestination')
                            : t('assets.movePlan.groupCount', { picked, total: keys.length })}
                        </span>
                      </button>
                    </div>
                    {isOpen && (
                      <div id={groupId} className="flex flex-col">
                        {stacks.map((s) => {
                          const unit = unitM3.get(s.typeId);
                          return (
                            <StackRow
                              key={s.key}
                              checked={!here && selected.has(s.key)}
                              disabled={here}
                              onChange={(on) => onToggle([s.key], on)}
                              name={typeName(s.typeId)}
                              qty={
                                s.ship ? (
                                  <span className="font-semibold text-warning">
                                    {t('assets.movePlan.shipRow')}
                                  </span>
                                ) : (
                                  `× ${s.quantity.toLocaleString()}`
                                )
                              }
                              volume={
                                s.ship
                                  ? null
                                  : unit === undefined
                                    ? t('assets.movePlan.volumeUnknown')
                                    : `${formatCubicMetres(s.quantity * unit)} m³`
                              }
                              here={here}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </RailStop>
              );
            })}
          </PickerCharacter>
        );
      })}
    </Rail>
  );
}

function PickerCharacter({
  name,
  keys,
  selected,
  onToggle,
  children,
}: {
  name: string;
  keys: readonly string[];
  selected: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <RailHeading
        name={name}
        leading={
          <GroupCheckbox
            keys={keys}
            selected={selected}
            onToggle={onToggle}
            label={t('assets.movePlan.selectAllFor', { character: name })}
          />
        }
      />
      {children}
    </>
  );
}

/** A stack's row: name, quantity and packaged volume. On a phone the quantity drops under the name. */
function StackRow({
  checked,
  disabled,
  onChange,
  name,
  qty,
  volume,
  here,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  name: string;
  qty: ReactNode;
  volume: string | null;
  here: boolean;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={cx(
        tappableRowClassName,
        'grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center border-t border-line pr-3 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_auto]',
        here ? 'cursor-default' : 'cursor-pointer'
      )}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="row-span-2 justify-self-center sm:row-span-1"
      />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 py-1.5 leading-tight">
        <span
          className={cx(
            '[overflow-wrap:anywhere]',
            here && 'line-through opacity-60 decoration-text-dim'
          )}
        >
          {name}
        </span>
        {here && (
          <span className="text-xs text-text-dim">{t('assets.movePlan.atDestination')}</span>
        )}
      </span>
      <span
        className={cx(
          'col-start-2 row-start-2 text-xs text-text-dim tabular-nums sm:col-start-3 sm:row-start-1 sm:pl-3 sm:text-sm',
          here && 'line-through opacity-60'
        )}
      >
        {qty}
      </span>
      <span
        className={cx(
          'col-start-3 row-span-2 row-start-1 min-w-[5.5em] text-right tabular-nums sm:col-start-4 sm:row-span-1 sm:pl-3',
          here && 'line-through opacity-60'
        )}
      >
        {volume ?? ''}
      </span>
    </label>
  );
}

/** Select-all box for a group: ticked when every key is, mixed when some are. */
function GroupCheckbox({
  keys,
  selected,
  onToggle,
  label,
  disabled = false,
}: {
  keys: readonly string[];
  selected: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = disabled ? 0 : keys.filter((k) => selected.has(k)).length;
  const all = keys.length > 0 && count === keys.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <label
      className={`${touchCheckboxLabelClassName} ${tappableRowClassName} w-11 shrink-0 cursor-pointer justify-center`}
    >
      <Checkbox
        ref={ref}
        checked={all}
        disabled={disabled || keys.length === 0}
        onChange={(e) => onToggle(keys, e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}
