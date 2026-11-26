import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import {
  focusRingClassName,
  rowInteractiveClassName,
  suggestionOptionClassName,
  suggestionPopupClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { useCombobox } from '@/lib/useCombobox';
import { listShipTypes, searchShips, type ShipType } from './ownShip';

export interface OwnShipPickerProps {
  typeId: number | null;
  autoTypeId: number | null;
  onChange: (typeId: number | null) => void;
}

export function OwnShipPicker({ typeId, autoTypeId, onChange }: OwnShipPickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const refocusButton = useRef(false);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [query, setQuery] = useState<string | null>(null);

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
    else if (refocusButton.current) {
      refocusButton.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  const nameOf = (id: number | null) =>
    id === null ? null : (ships.find((s) => s.typeId === id)?.name ?? null);
  const manualName = nameOf(typeId);
  const autoName = nameOf(autoTypeId);
  const shownName = manualName ?? autoName;

  const matches = useMemo(() => (query === null ? [] : searchShips(ships, query)), [ships, query]);
  const open = matches.length > 0;
  const combo = useCombobox({ count: matches.length, open });

  function close() {
    setQuery(null);
    combo.reset();
  }

  function choose(ship: ShipType) {
    onChange(ship.typeId);
    refocusButton.current = true;
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(matches[combo.highlight ?? 0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      refocusButton.current = true;
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
            {...combo.inputProps}
            aria-label={label}
            autoComplete="off"
            spellCheck={false}
            className="w-full"
            value={query}
            placeholder={t('travel.pilot.dscan.ownShip.placeholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              combo.reset();
            }}
            onBlur={close}
            onKeyDown={onKeyDown}
          />
          <ul
            {...combo.listboxProps}
            aria-label={label}
            hidden={!open}
            className={suggestionPopupClassName}
          >
            {matches.map((ship, index) => (
              <li
                key={ship.typeId}
                {...combo.optionProps(index)}
                className={suggestionOptionClassName(index === combo.activeIndex)}
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
            ref={editButtonRef}
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
