import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { TextInput } from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { moveHighlight } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import {
  MIN_PAYEE_SEARCH_LENGTH,
  resolvePayeeName,
  searchPayeeEntities,
  type PayeeEntityMatch,
} from './payeeEntitySearch';

const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
/**
 * The Payee form's Name box: free text, with suggestions of the characters,
 * corporations and alliances it could be. Picking one verifies the Payee. A
 * label that is none of them (a moon, a place) is simply typed and stays a
 * label. Without the search permission the suggestions are the exact-name
 * matches only, which need no scope.
 */
export function PayeeNameField({
  id,
  characterId,
  value,
  onChange,
  onPick,
}: {
  id: string;
  /** Whose token the search runs under. */
  characterId: number;
  value: string;
  onChange: (name: string) => void;
  onPick: (match: PayeeEntityMatch) => void;
}) {
  const { t } = useTranslation();
  const listboxId = useId();
  const canSearch = useEndpointsGranted(SEARCH_ENDPOINTS) === true;
  const [suggestions, setSuggestions] = useState<PayeeEntityMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  // Only the user's typing asks ESI; a picked or seeded name is already settled.
  const typing = useRef(false);
  // Only the newest search may write results: ESI can answer out of order.
  const latest = useRef(0);
  const trimmed = value.trim();
  const shown = trimmed.length >= MIN_PAYEE_SEARCH_LENGTH ? suggestions : [];

  useEffect(() => {
    if (!typing.current || trimmed.length < MIN_PAYEE_SEARCH_LENGTH) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const lookup = canSearch
        ? searchPayeeEntities(characterId, trimmed, controller.signal)
        : resolvePayeeName(trimmed, controller.signal);
      void lookup
        .then((hits) => {
          if (ticket === latest.current) setSuggestions(hits);
        })
        .catch(() => {
          // A failed suggestion lookup leaves a free-text label, never a blocked save.
          if (ticket === latest.current && !controller.signal.aborted) setSuggestions([]);
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, characterId, trimmed]);

  function choose(match: PayeeEntityMatch) {
    typing.current = false;
    latest.current++;
    setSuggestions([]);
    setOpen(false);
    setHighlight(null);
    onPick(match);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(null);
      return;
    }
    if (e.key === 'Enter') {
      const picked = highlight === null ? undefined : shown[highlight];
      if (open && picked) {
        e.preventDefault();
        choose(picked);
      }
      return;
    }
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      if (shown.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((current) => moveHighlight(key, current, shown.length));
    }
  }

  const listOpen = open && shown.length > 0;

  return (
    <div className="relative">
      <TextInput
        id={id}
        className="w-full"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listboxId : undefined}
        aria-activedescendant={
          listOpen && highlight !== null ? `${listboxId}-option-${highlight}` : undefined
        }
        autoComplete="off"
        value={value}
        placeholder={t('miningTax.payeeNamePlaceholder')}
        onChange={(e) => {
          typing.current = true;
          latest.current++;
          setSuggestions([]);
          setOpen(true);
          setHighlight(null);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          typing.current = false;
          setOpen(false);
        }}
        onKeyDown={handleKeyDown}
      />
      {listOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('miningTax.payees.verify.suggestionsLabel')}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
        >
          {shown.map((match, i) => (
            <li
              key={`${match.kind}-${match.id}`}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={highlight === i}
              className={cx(
                'flex cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 text-xs text-text',
                'hover:bg-panel-2',
                highlight === i && `bg-panel-2 ${activeOptionClassName}`
              )}
              onMouseEnter={() => setHighlight(i)}
              // Keeps the input focused — a plain click would blur it first and close the list.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(match);
              }}
            >
              <span className="min-w-0 truncate">{match.name}</span>
              <span className="shrink-0 text-[0.6875rem] text-text-dim">
                {t(`miningTax.payees.verify.kind.${match.kind}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
