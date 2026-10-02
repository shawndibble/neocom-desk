/**
 * The LP Store corporation picker (issue #2321): a select box over every NPC
 * corporation that runs an LP Store, so a pilot can open — and compare — any
 * store, not only the ones they already hold LP with. The closed control is a
 * select-style button (the open store's name, or a prompt); opening it shows a
 * search field pinned above the full list, which the field narrows. Corps the active Character holds LP with are pinned first with their
 * balance (`lpStorePickerOptions`). Picking one navigates to
 * `/market/lp-store/:corporationId`, so the chosen store lives in the URL.
 *
 * Hand-built ARIA (decision 20260905-114550, reshaped by
 * 20260930-select-box-lp-store-picker): the button opens a dialog popover,
 * focus moves to its search input, Arrow/Home/End move a highlight via
 * `aria-activedescendant`, Enter or a click opens the store, Escape closes the
 * popover and returns focus to the button.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { fieldBaseClassName, fieldSizeClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { loadLpCorporations } from '@/sde/loadMarketSde';
import type { LpCorporationEntry } from '@/sde/marketTypes';
import type { CharacterLoyaltyPoints } from '@/esi/endpoints';
import { loadCharacterLoyaltyPoints } from '@/features/character/loyalty';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { lpStorePickerOptions, type LpStorePickerOption } from './lpStorePickerOptions';

const ID_PREFIX = 'lp-store-picker';
const LISTBOX_ID = `${ID_PREFIX}-listbox`;
const INPUT_ID = `${ID_PREFIX}-input`;
const TRIGGER_ID = `${ID_PREFIX}-trigger`;
const POPOVER_ID = `${ID_PREFIX}-popover`;
const optionId = (corporationId: number) => `${ID_PREFIX}-option-${corporationId}`;

interface LpStorePickerProps {
  /** The open store's corp name, shown on the closed select; `null` shows the prompt. */
  corporationName: string | null;
  /** `sm` for a panel's title bar, `md` (default) for a page header. */
  size?: 'sm' | 'md';
  className?: string;
}

export function LpStorePicker({ corporationName, size = 'md', className }: LpStorePickerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);

  const [corporations, setCorporations] = useState<LpCorporationEntry[]>([]);
  const [balances, setBalances] = useState<CharacterLoyaltyPoints[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Held by corporation, not list position: the balances landing re-pins
  // the list, and an index would silently jump to a different corp.
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A snapshot that fails to load leaves the picker empty rather than
    // breaking the store page it sits on.
    void loadLpCorporations()
      .then((corps) => {
        if (!cancelled) setCorporations(corps);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyed on the Character, so a switch (or clearing it) never pins the
  // previous Character's held corps — adjust-during-render, not an effect.
  const [balancesFor, setBalancesFor] = useState(characterId);
  if (balancesFor !== characterId) {
    setBalancesFor(characterId);
    setBalances([]);
  }

  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    // A failed read just leaves nothing pinned; every store stays listed.
    void loadCharacterLoyaltyPoints(characterId)
      .then((result) => {
        if (!cancelled) setBalances(result.cached?.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const options = useMemo(
    () => lpStorePickerOptions(corporations, balances, query),
    [corporations, balances, query]
  );
  const listOpen = open && options.length > 0;
  const trimmed = query.trim();
  const noMatches = open && trimmed !== '' && corporations.length > 0 && options.length === 0;
  const highlightedIndex = listOpen
    ? options.findIndex((option) => option.corporationId === highlightedId)
    : -1;
  const highlighted = highlightedIndex >= 0 ? options[highlightedIndex] : null;

  // Keyboard moves through ~180 stores in a scrolling list: keep the
  // highlighted one in view (`aria-activedescendant` alone doesn't scroll).
  useEffect(() => {
    if (highlighted === null) return;
    document.getElementById(optionId(highlighted.corporationId))?.scrollIntoView?.({
      block: 'nearest',
    });
  }, [highlighted]);

  function close(refocus = false) {
    setOpen(false);
    setQuery('');
    setHighlightedId(null);
    if (refocus) triggerRef.current?.focus();
  }

  function pick(option: LpStorePickerOption) {
    close();
    navigate(`/market/lp-store/${option.corporationId}`);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        if (!listOpen) return;
        e.preventDefault();
        {
          const next = moveHighlight(
            e.key as ComboboxNavKey,
            highlightedIndex >= 0 ? highlightedIndex : null,
            options.length
          );
          setHighlightedId(next === null ? null : options[next].corporationId);
        }
        break;
      case 'Enter': {
        // With nothing highlighted, a typed name opens its best match — the
        // top option — so "fed" + Enter goes straight to a store.
        const target = highlighted ?? (listOpen && trimmed !== '' ? options[0] : null);
        if (target) {
          e.preventDefault();
          pick(target);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
    }
  }

  function balanceLabel(option: LpStorePickerOption) {
    return option.lp === null
      ? null
      : t('loyaltyStore.pickerBalance', { lp: option.lp.toLocaleString() });
  }

  return (
    <div
      ref={rootRef}
      className={cx('relative text-xs', className)}
      // Focus leaving the whole control (trigger + popover) closes it; moving
      // between the button and the search field does not.
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <button
        ref={triggerRef}
        id={TRIGGER_ID}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? POPOVER_ID : undefined}
        // While open, keep focus in the search field: a blur here would close the
        // popover and the click would reopen it (Safari/iOS don't focus buttons).
        onMouseDown={(e) => open && e.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
        className={cx(
          fieldBaseClassName,
          fieldSizeClassName[size],
          'relative flex w-full cursor-pointer items-center text-left',
          size === 'sm' ? 'pr-6' : 'pr-8'
        )}
      >
        <span className="sr-only">{t('loyaltyStore.pickerLabel')}: </span>
        <span className={cx('truncate', corporationName === null && 'text-text-dim')}>
          {corporationName ?? t('loyaltyStore.pickerPrompt')}
        </span>
        <Icon.Expanded
          size={size === 'sm' ? Icon.ICON_SIZE.sm : Icon.ICON_SIZE.md}
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-dim',
            size === 'sm' ? 'right-1' : 'right-2'
          )}
        />
      </button>
      {open && (
        <div
          id={POPOVER_ID}
          role="dialog"
          aria-label={t('loyaltyStore.pickerLabel')}
          className="absolute top-full right-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xs border border-line bg-panel p-1 shadow-lg shadow-black/50"
        >
          <label htmlFor={INPUT_ID} className="sr-only">
            {t('loyaltyStore.pickerSearchLabel')}
          </label>
          <SearchInput
            id={INPUT_ID}
            value={query}
            placeholder={t('loyaltyStore.pickerPlaceholder')}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedId(null);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={listOpen}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={highlighted ? optionId(highlighted.corporationId) : undefined}
            autoComplete="off"
          />
          <span role="status" aria-live="polite" className="sr-only">
            {listOpen &&
              (highlighted
                ? t('loyaltyStore.pickerHighlighted', {
                    count: options.length,
                    name: highlighted.name,
                  })
                : t('loyaltyStore.pickerResultsCount', { count: options.length }))}
            {noMatches && t('loyaltyStore.pickerNoResults')}
          </span>
          {noMatches && (
            <span aria-hidden="true" className="px-2 py-1.5 text-text-dim">
              {t('loyaltyStore.pickerNoResults')}
            </span>
          )}
          {options.length > 0 && (
            <ul
              id={LISTBOX_ID}
              role="listbox"
              aria-label={t('loyaltyStore.pickerLabel')}
              className="max-h-72 overflow-y-auto"
              // The scrollbar/gutter must not steal focus, or the popover closes.
              onMouseDown={(e) => e.preventDefault()}
            >
              {options.map((option) => (
                <li
                  key={option.corporationId}
                  id={optionId(option.corporationId)}
                  role="option"
                  aria-selected={option.corporationId === highlighted?.corporationId}
                  className={cx(
                    'flex cursor-pointer items-center justify-between gap-3 border-b border-line px-2 py-1.5 last:border-b-0',
                    option.corporationId === highlighted?.corporationId
                      ? 'bg-panel-2'
                      : 'hover:bg-panel-2'
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                >
                  <span className="truncate text-text">{option.name}</span>
                  {option.lp !== null && (
                    <span className="shrink-0 text-accent tabular-nums">
                      {balanceLabel(option)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
