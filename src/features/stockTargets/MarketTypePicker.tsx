import { useEffect, useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { Button, LiveStatus, TextInput } from '@/components/ui';
import { useTranslation } from 'react-i18next';
import { suggestionOptionClassName, suggestionPopupClassName } from '@/components/ui/controlStyles';
import { rankedSearch } from '@/lib/rankedSearch';
import { useCombobox } from '@/lib/useCombobox';
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
  unavailableText: string;
  picked: MarketTypeEntry | null;
  onPick: (type: MarketTypeEntry | null) => void;
  resetKey?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [types, setTypes] = useState<readonly MarketTypeEntry[]>([]);
  const [query, setQuery] = useState('');

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

  const matches = useMemo(
    () =>
      picked
        ? []
        : rankedSearch(types, query, { primary: (type) => type.name, limit: SEARCH_LIMIT }),
    [types, query, picked]
  );
  const open = matches.length > 0;
  const combo = useCombobox({ count: matches.length, open });

  const [seenResetKey, setSeenResetKey] = useState(resetKey);
  if (seenResetKey !== resetKey) {
    setSeenResetKey(resetKey);
    setQuery('');
    combo.reset();
  }

  function choose(type: MarketTypeEntry) {
    setQuery(type.name);
    combo.reset();
    onPick(type);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(matches[combo.highlight ?? 0]);
    } else if (event.key === 'Escape' && open) {
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
        {...combo.inputProps}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="w-full"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          combo.reset();
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
              document.getElementById(`${id}-search`)?.focus();
              retryTypes();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      <LiveStatus>{typesFailed ? unavailableText : null}</LiveStatus>
      <ul
        {...combo.listboxProps}
        aria-label={label}
        hidden={!open}
        className={suggestionPopupClassName}
      >
        {matches.map((type, index) => (
          <li
            key={type.typeId}
            {...combo.optionProps(index)}
            className={suggestionOptionClassName(index === combo.activeIndex)}
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
