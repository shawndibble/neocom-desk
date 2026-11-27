import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { TextInput } from '@/components/ui';
import { activeOptionClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { useCombobox } from '@/lib/useCombobox';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import {
  MIN_PAYEE_SEARCH_LENGTH,
  searchPayeeEntities,
  searchPayeeEntitiesPublic,
  type PayeeEntityMatch,
} from './payeeEntitySearch';
import type { PayeeEntityKind } from './payees';

const SEARCH_ENDPOINTS = ['getCharacterSearch'] as const;
export function PayeeNameField({
  id,
  characterId,
  value,
  onChange,
  onPick,
  placeholder,
  ariaLabel,
  className,
  size,
  kinds,
}: {
  id: string;
  characterId: number | null;
  value: string;
  onChange: (name: string) => void;
  onPick: (match: PayeeEntityMatch) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
  kinds?: readonly PayeeEntityKind[];
}) {
  const { t } = useTranslation();
  const canSearch = useEndpointsGranted(SEARCH_ENDPOINTS) === true && characterId !== null;
  const [suggestions, setSuggestions] = useState<PayeeEntityMatch[]>([]);
  const [open, setOpen] = useState(false);
  const typing = useRef(false);
  const latest = useRef(0);
  const trimmed = value.trim();
  const shown =
    trimmed.length < MIN_PAYEE_SEARCH_LENGTH
      ? []
      : kinds
        ? suggestions.filter((match) => kinds.includes(match.kind))
        : suggestions;
  const listOpen = open && shown.length > 0;
  const combo = useCombobox({ count: shown.length, open: listOpen });

  useEffect(() => {
    if (!typing.current || trimmed.length < MIN_PAYEE_SEARCH_LENGTH) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const lookup =
        canSearch && characterId !== null
          ? searchPayeeEntities(characterId, trimmed, controller.signal)
          : searchPayeeEntitiesPublic(trimmed, controller.signal);
      void lookup
        .then((hits) => {
          if (ticket === latest.current) setSuggestions(hits);
        })
        .catch(() => {
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
    combo.reset();
    onPick(match);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      combo.reset();
      return;
    }
    if (e.key === 'Enter') {
      const picked = combo.highlight === null ? undefined : shown[combo.highlight];
      if (open && picked) {
        e.preventDefault();
        choose(picked);
      }
      return;
    }
    if (combo.handleNavKey(e)) setOpen(true);
  }

  return (
    <div className={cx('relative', className)}>
      <TextInput
        id={id}
        size={size}
        aria-label={ariaLabel}
        className="w-full"
        {...combo.inputProps}
        autoComplete="off"
        value={value}
        placeholder={placeholder ?? t('miningTax.payeeNamePlaceholder')}
        onChange={(e) => {
          typing.current = true;
          latest.current++;
          setSuggestions([]);
          setOpen(true);
          combo.reset();
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
          {...combo.listboxProps}
          aria-label={t('miningTax.payees.verify.suggestionsLabel')}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xs border border-line bg-panel shadow-lg"
        >
          {shown.map((match, i) => (
            <li
              key={`${match.kind}-${match.id}`}
              {...combo.optionProps(i)}
              className={cx(
                'flex cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 text-xs text-text',
                rowInteractiveClassName,
                i === combo.activeIndex && `bg-panel-2 ${activeOptionClassName}`
              )}
              onMouseEnter={() => combo.setHighlight(i)}
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
