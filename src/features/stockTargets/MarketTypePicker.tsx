/**
 * Search the market catalogue for one item type: a combobox over
 * `loadMarketTypes` with ranked matches, arrow-key navigation, a retry note
 * when the lazy catalogue download fails, and the announcement for it. The
 * caller owns what happens next (a quantity field, a submit): it learns the
 * chosen type through `onPick` and is told to start over with `resetKey`.
 * Shared by the Stock tab's Add items dialog and the corp Stock targets dialog.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { Button, LiveStatus, TextInput } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { rankedSearch } from '@/lib/rankedSearch';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketTypeEntry } from '@/sde/marketTypes';

const SEARCH_LIMIT = 8;

export function MarketTypePicker({
  inputRef,
  label,
  placeholder,
  unavailableText,
  picked,
  onPick,
  resetKey,
  invalid,
  describedBy,
}: {
  inputRef: Ref<HTMLInputElement>;
  label: string;
  placeholder: string;
  /** Shown, and announced, when the catalogue could not be downloaded. */
  unavailableText: string;
  /** The chosen type, or null while the pilot is still typing. */
  picked: MarketTypeEntry | null;
  /** Called with the chosen type, and with null once the pilot edits the text again. */
  onPick: (type: MarketTypeEntry | null) => void;
  /** Changing this empties the field (after the caller has used the pick). */
  resetKey?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-results`;
  const [types, setTypes] = useState<readonly MarketTypeEntry[]>([]);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);

  // The catalogue is a lazy download, so offline it may be missing: say so.
  const {
    failed: typesFailed,
    attempt: typesAttempt,
    fail: failTypes,
    clear: clearTypesFailure,
    retry: retryTypes,
  } = useRetryableLoad();
  useEffect(() => {
    let live = true;
    clearTypesFailure();
    loadMarketTypes().then(
      (list) => {
        if (live) setTypes(list);
      },
      () => {
        if (live) failTypes();
      }
    );
    return () => {
      live = false;
    };
  }, [typesAttempt, failTypes, clearTypesFailure]);

  // Start over when the caller bumps `resetKey` (adjusted during render, not in an effect).
  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setQuery('');
    setHighlight(null);
  }

  const matches = useMemo(
    () =>
      picked
        ? []
        : rankedSearch(types, query, { primary: (type) => type.name, limit: SEARCH_LIMIT }),
    [types, query, picked]
  );
  const open = matches.length > 0;

  function choose(type: MarketTypeEntry) {
    setQuery(type.name);
    setHighlight(null);
    onPick(type);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(matches[highlight ?? 0]);
    } else if (event.key === 'Escape' && open) {
      // Closes the list, not the dialog.
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  }

  return (
    <div className="relative space-y-1">
      <label className="block text-xs text-text-dim" htmlFor={`${id}-search`}>
        {label}
      </label>
      <TextInput
        ref={inputRef}
        id={`${id}-search`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="w-full"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(null);
          onPick(null);
        }}
        onKeyDown={onKeyDown}
      />
      {typesFailed && (
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span>{unavailableText}</span>
          <Button
            size="sm"
            onClick={() => {
              // The note unmounts into the retry; focus goes on to the search field it serves.
              document.getElementById(`${id}-search`)?.focus();
              retryTypes();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {/* Always mounted, so the failure is announced when it appears (DESIGN.md §7). */}
      <LiveStatus>{typesFailed ? unavailableText : null}</LiveStatus>
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!open}
        className="absolute z-20 mt-1 w-full overflow-hidden rounded-xs border border-line-bright bg-panel shadow-lg"
      >
        {matches.map((type, index) => (
          <li
            key={type.typeId}
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
            onClick={() => choose(type)}
          >
            {type.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
