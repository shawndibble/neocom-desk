/**
 * The LP Store page's corporation picker (issue #2321): a type-to-filter
 * combobox over every NPC corporation that runs an LP Store, so a pilot can
 * open — and compare — any store, not only the ones they already hold LP
 * with. Corps the active Character holds LP with are pinned first with their
 * balance (`lpStorePickerOptions`). Picking one navigates to
 * `/wallet/loyalty/:corporationId`, so the chosen store lives in the URL.
 *
 * Hand-built ARIA combobox (decision 20260905-114550), the same shape as
 * `BuildLocationPicker`: the input keeps DOM focus and is the one tab stop,
 * Arrow/Home/End move a highlight via `aria-activedescendant`, Enter or a
 * click opens the store, Escape closes the list.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@/components/ui';
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
const optionId = (corporationId: number) => `${ID_PREFIX}-option-${corporationId}`;

interface LpStorePickerProps {
  /** The open store's corp name, shown in the box whenever no search is in progress. */
  corporationName: string | null;
  className?: string;
}

export function LpStorePicker({ corporationName, className }: LpStorePickerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characterId = useActiveCharacter((s) => s.activeCharacterId);

  const [corporations, setCorporations] = useState<LpCorporationEntry[]>([]);
  const [balances, setBalances] = useState<CharacterLoyaltyPoints[]>([]);
  // `null` = not searching: the box reads the open store's name rather than
  // a typed fragment (BuildLocationPicker's idiom).
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
    () => lpStorePickerOptions(corporations, balances, query ?? ''),
    [corporations, balances, query]
  );
  const listOpen = open && options.length > 0;
  const trimmed = query?.trim() ?? '';
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

  function close() {
    setOpen(false);
    setHighlightedId(null);
  }

  function pick(option: LpStorePickerOption) {
    close();
    setQuery(null);
    navigate(`/wallet/loyalty/${option.corporationId}`);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        if (!listOpen && (e.key === 'Home' || e.key === 'End')) return;
        e.preventDefault();
        setOpen(true);
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
        if (listOpen) {
          e.preventDefault();
          close();
        }
        break;
    }
  }

  function balanceLabel(option: LpStorePickerOption) {
    return option.lp === null
      ? null
      : t('loyaltyStore.pickerBalance', { lp: option.lp.toLocaleString() });
  }

  return (
    <div className={cx('relative flex flex-col gap-1 text-xs', className)}>
      <label htmlFor={INPUT_ID} className="sr-only">
        {t('loyaltyStore.pickerLabel')}
      </label>
      <SearchInput
        id={INPUT_ID}
        value={query ?? corporationName ?? ''}
        placeholder={t('loyaltyStore.pickerPlaceholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightedId(null);
        }}
        onFocus={(e) => {
          e.currentTarget.select();
          setOpen(true);
        }}
        // Result rows cancel their own mousedown, so clicking one never blurs first.
        onBlur={() => {
          close();
          setQuery(null);
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
            ? t('loyaltyStore.pickerHighlighted', { count: options.length, name: highlighted.name })
            : t('loyaltyStore.pickerResultsCount', { count: options.length }))}
        {noMatches && t('loyaltyStore.pickerNoResults')}
      </span>
      {noMatches && (
        <span aria-hidden="true" className="text-text-dim">
          {t('loyaltyStore.pickerNoResults')}
        </span>
      )}
      {listOpen && (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t('loyaltyStore.pickerLabel')}
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xs border border-line bg-panel shadow-lg shadow-black/50"
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
                <span className="shrink-0 text-accent tabular-nums">{balanceLabel(option)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
