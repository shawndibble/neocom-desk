import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import {
  focusRingClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { moveHighlight, COMBOBOX_NAV_KEYS, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { listShipTypes, searchShips, type ShipType } from './ownShip';

export interface OwnShipPickerProps {
  /** The hull picked by hand, remembered on this device. */
  typeId: number | null;
  /** The hull the active character is flying, when ESI says. */
  autoTypeId: number | null;
  onChange: (typeId: number | null) => void;
}

/**
 * "Your ship" for the D-Scan danger read, as a line of text: the ship's name
 * with a faint pencil (DESIGN.md §6c), which opens into a field where you type
 * a hull name and pick it from the SDE. A manual pick wins over the
 * character's current ship; Clear drops it.
 */
export function OwnShipPicker({ typeId, autoTypeId, onChange }: OwnShipPickerProps) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ships, setShips] = useState<ShipType[]>([]);
  // null = showing the name; a string = the field is open with that text.
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void listShipTypes().then((list) => {
      if (live) setShips(list);
    });
    return () => {
      live = false;
    };
  }, []);

  const editing = query !== null;
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const nameOf = (id: number | null) =>
    id === null ? null : (ships.find((s) => s.typeId === id)?.name ?? null);
  const manualName = nameOf(typeId);
  const autoName = nameOf(autoTypeId);
  const shownName = manualName ?? autoName;

  const matches = useMemo(() => (query === null ? [] : searchShips(ships, query)), [ships, query]);
  const open = matches.length > 0;

  function close() {
    setQuery(null);
    setHighlight(null);
  }

  function choose(ship: ShipType) {
    onChange(ship.typeId);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(matches[highlight ?? 0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  const label = t('travel.pilot.dscan.ownShip.label');

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-text-dim">{label}:</span>
      {editing ? (
        <div className="relative w-64 max-w-full">
          <TextInput
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
            autoComplete="off"
            spellCheck={false}
            className="w-full"
            value={query}
            placeholder={t('travel.pilot.dscan.ownShip.placeholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(null);
            }}
            onBlur={close}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            hidden={!open}
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xs border border-line-bright bg-panel shadow-lg"
          >
            {matches.map((ship, index) => (
              <li
                key={ship.typeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={cx(
                  tappableRowClassName,
                  'flex cursor-pointer items-center border-l-2 px-3 text-sm',
                  index === highlight
                    ? 'border-accent bg-panel-2 font-semibold'
                    : 'border-transparent hover:bg-panel-2'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(ship)}
              >
                {ship.name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label={t('travel.pilot.dscan.ownShip.editLabel', {
              name: shownName ?? t('travel.pilot.dscan.ownShip.notSet'),
            })}
            className={cx(
              tappableRowClassName,
              rowInteractiveClassName,
              focusRingClassName,
              '-mx-1.5 inline-flex items-center gap-1.5 rounded-xs px-1.5 text-left'
            )}
            onClick={() => setQuery('')}
          >
            <span className={shownName === null ? 'text-text-dim' : 'font-semibold text-text'}>
              {shownName ?? t('travel.pilot.dscan.ownShip.notSet')}
            </span>
            <Icon.Rename aria-hidden="true" className="shrink-0 text-text-faint" />
          </button>
          {typeId === null && autoName !== null && (
            <span className="text-xs text-text-dim">
              {t('travel.pilot.dscan.ownShip.fromCharacter')}
            </span>
          )}
          {shownName === null && (
            <span className="text-xs text-text-dim">
              {t('travel.pilot.dscan.ownShip.unsetNote')}
            </span>
          )}
          {typeId !== null && (
            // Both mean "drop the manual pick"; with a character ship to fall back
            // to, the label says where it lands.
            <button type="button" className={textActionClassName()} onClick={() => onChange(null)}>
              {autoTypeId !== null
                ? t('travel.pilot.dscan.ownShip.useCurrent')
                : t('travel.pilot.dscan.ownShip.clear')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
