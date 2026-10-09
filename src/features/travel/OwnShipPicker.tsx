import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
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
 * "Your ship" for the D-Scan danger read: type a hull name, pick it from the
 * SDE. A manual pick wins over the character's current ship; Clear drops it.
 */
export function OwnShipPicker({ typeId, autoTypeId, onChange }: OwnShipPickerProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listId = useId();
  const [ships, setShips] = useState<ShipType[]>([]);
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

  const nameOf = (id: number | null) =>
    id === null ? null : (ships.find((s) => s.typeId === id)?.name ?? null);
  const manualName = nameOf(typeId);
  const autoName = nameOf(autoTypeId);

  const editing = query !== null;
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
    } else if (event.key === 'Escape' && editing) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  const placeholder = autoName
    ? t('travel.pilot.dscan.ownShip.fromCharacter', { name: autoName })
    : t('travel.pilot.dscan.ownShip.placeholder');

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-xs font-semibold text-text-dim">
        {t('travel.pilot.dscan.ownShip.label')}
      </label>
      <div className="relative">
        <TextInput
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
          autoComplete="off"
          spellCheck={false}
          className="w-full"
          value={editing ? query : (manualName ?? '')}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(null);
          }}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={t('travel.pilot.dscan.ownShip.label')}
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
      {typeId !== null && (
        // Both mean "drop the manual pick"; with a character ship to fall back
        // to, the label says where it lands.
        <button type="button" className={textActionClassName()} onClick={() => onChange(null)}>
          {autoTypeId !== null
            ? t('travel.pilot.dscan.ownShip.useCurrent')
            : t('travel.pilot.dscan.ownShip.clear')}
        </button>
      )}
    </div>
  );
}
