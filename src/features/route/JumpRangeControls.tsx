/**
 * The Jump Range filter's controls, shared by Market Browser, Item Offers and
 * BPC Sourcing: the range select, the Current System it measures from, and a
 * note for when it cannot measure at all.
 *
 * The range select is a plain controlled field so it can sit inside a
 * `FilterBar`'s draft. The Current System picker writes its setting straight
 * away — it is where the pilot is, not part of any one page's filter.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { JUMP_RANGES, type JumpRange } from '@/engine/route/jumpRange';
import { moveHighlight, type ComboboxNavKey } from '@/features/industry/comboboxNav';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { loadSolarSystems } from '@/sde/loadMarketSde';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import type { CurrentSystemState, JumpRangeStatus } from './currentSystem';

const MATCH_LIMIT = 8;

const NAV_KEYS: readonly string[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

interface JumpRangeSelectProps {
  value: JumpRange;
  onChange: (next: JumpRange) => void;
  className?: string;
}

export function JumpRangeSelect({ value, onChange, className = 'w-40' }: JumpRangeSelectProps) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as JumpRange)}>
      <SelectTrigger aria-label={t('jumpRange.label')} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JUMP_RANGES.map((range) => (
          <SelectItem key={range} value={range}>
            {t(`jumpRange.option.${range}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useSolarSystems(enabled: boolean): readonly SolarSystemEntry[] | null {
  const [systems, setSystems] = useState<readonly SolarSystemEntry[] | null>(null);
  useEffect(() => {
    if (!enabled || systems !== null) return;
    let cancelled = false;
    void loadSolarSystems()
      .catch(() => [])
      .then((entries) => {
        if (!cancelled) setSystems(entries);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, systems]);
  return systems;
}

function useSystemName(systemId: number | null): string | null {
  const [name, setName] = useState<{ id: number; name: string } | null>(null);
  useEffect(() => {
    if (systemId === null) return;
    let cancelled = false;
    void loadSolarSystems()
      .then((entries) => entries.find((entry) => entry.id === systemId)?.name ?? null)
      .catch(() => null)
      .then((found) => {
        if (!cancelled && found !== null) setName({ id: systemId, name: found });
      });
    return () => {
      cancelled = true;
    };
  }, [systemId]);
  return systemId !== null && name?.id === systemId ? name.name : null;
}

interface CurrentSystemPickerProps {
  current: CurrentSystemState;
}

/**
 * "From: Jita" — opens a search over every solar system in the local
 * snapshot, so picking one costs no ESI request.
 */
export function CurrentSystemPicker({ current }: CurrentSystemPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const listId = useId();
  const systems = useSolarSystems(open);
  const currentName = useSystemName(current.systemId);

  const matches = useMemo(
    () =>
      systems ? rankedSearch(systems, query, { primary: (s) => s.name, limit: MATCH_LIMIT }) : [],
    [systems, query]
  );

  function choose(system: SolarSystemEntry) {
    current.pick(system.id);
    setOpen(false);
    setQuery('');
    setHighlight(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter' && highlight !== null && matches[highlight]) {
      event.preventDefault();
      choose(matches[highlight]);
    }
  }

  const label =
    current.systemId === null
      ? t('jumpRange.fromUnknown')
      : t('jumpRange.from', { system: currentName ?? '…' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          // A pick made before ESI answers would record no game location, and
          // the answer arriving a moment later would then clear it.
          disabled={!current.loaded}
          aria-label={t('jumpRange.changeSystem', { current: label })}
          className="whitespace-nowrap"
        >
          {label}
          {current.source === 'picked' && (
            <span className="text-text-dim">{t('jumpRange.pickedSuffix')}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex flex-col gap-2">
          <p className="text-text-dim">
            {current.source === 'picked'
              ? t('jumpRange.pickedHint')
              : current.source === 'game'
                ? t('jumpRange.gameHint')
                : t('jumpRange.noGameHint')}
          </p>
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('jumpRange.searchPlaceholder')}
            aria-label={t('jumpRange.searchPlaceholder')}
            aria-controls={listId}
            aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-autocomplete="list"
          />
          {matches.length > 0 && (
            <ul id={listId} role="listbox" className="flex flex-col">
              {matches.map((system, index) => (
                <li
                  key={system.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={cx(
                    'cursor-pointer rounded-xs px-2 py-1 hover:bg-panel-2',
                    index === highlight && 'bg-panel-2'
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(system)}
                >
                  {system.name}
                </li>
              ))}
            </ul>
          )}
          {current.source === 'picked' && (
            <Button
              size="sm"
              onClick={() => {
                current.clearPick();
                setOpen(false);
              }}
            >
              {t('jumpRange.useGameLocation')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Why a set range is not filtering, or nothing when it is (or is off). */
export function JumpRangeNote({ status }: { status: JumpRangeStatus }) {
  const { t } = useTranslation();
  if (status !== 'no-origin' && status !== 'unknown') return null;
  return (
    <p role="status" className="text-text-dim">
      {t(status === 'no-origin' ? 'jumpRange.noOrigin' : 'jumpRange.graphUnavailable')}
    </p>
  );
}
