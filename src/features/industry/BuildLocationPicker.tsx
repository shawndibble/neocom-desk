import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Disclosure,
  LiveStatus,
  NeedsConnection,
  SearchInput,
  Spinner,
} from '@/components/ui';
import { activeOptionClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { LOOKUP_DEBOUNCE_MS } from '@/lib/useDebouncedValue';
import { beginEveLogin } from '@/app/loginFlow';
import { ESI_REGISTRY } from '@/esi/registry';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { IndustryActivity } from '@/engine/industry/types';
import { buildLocationLabel } from './buildLocationLabel';
import { moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { MIN_SEARCH_LENGTH, searchBuildLocations } from './searchBuildLocations';
import type { BuildLocationOption } from './buildLocations';

interface BuildLocationPickerProps {
  summary: string;
  selectedLabel: string | null;
  children: ReactNode;
  onPick: (option: BuildLocationOption) => void;
  activity: IndustryActivity;
  idPrefix?: string;
  labelKey?: string;
}

const SEARCH_SCOPE = ESI_REGISTRY.getCharacterSearch.scope;

export function BuildLocationPicker({
  summary,
  selectedLabel,
  children,
  onPick,
  activity,
  idPrefix = 'build-location',
  labelKey = 'industry.buildLocation',
}: BuildLocationPickerProps) {
  const { t } = useTranslation();
  const listboxId = `${idPrefix}-listbox`;
  const optionId = (structureId: number) => `${idPrefix}-option-${structureId}`;
  const inputId = `${idPrefix}-input`;
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  const [overriding, setOverriding] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<BuildLocationOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);

  const canSearch = granted !== undefined && granted.includes(SEARCH_SCOPE);

  const trimmed = query?.trim() ?? '';
  const searchKey = canSearch && trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '';
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (prevSearchKey !== searchKey) {
    setPrevSearchKey(searchKey);
    setResults(null);
    setFailed(false);
    setSearching(searchKey !== '');
    setHighlightedId(null);
    setDismissed(false);
  }

  const [prevSelectedLabel, setPrevSelectedLabel] = useState(selectedLabel);
  if (prevSelectedLabel !== selectedLabel) {
    setPrevSelectedLabel(selectedLabel);
    setPicked(null);
  }

  const latest = useRef(0);
  useEffect(() => {
    if (searchKey === '' || characterId === null) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchBuildLocations(characterId, searchKey, activity, controller.signal)
        .then((found) => {
          if (ticket !== latest.current) return;
          setResults(found);
          setSearching(false);
        })
        .catch(() => {
          if (ticket !== latest.current || controller.signal.aborted) return;
          setFailed(true);
          setSearching(false);
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchKey, characterId, activity]);

  const openResults =
    !dismissed && !searching && results !== null && results.length > 0 ? results : null;

  function optionLabel(option: BuildLocationOption) {
    return buildLocationLabel(option.name, option.facility, option.systemName, t);
  }

  function pick(option: BuildLocationOption) {
    onPick(option);
    setQuery(null);
    setPicked(optionLabel(option));
  }

  const foundIndex =
    openResults === null || highlightedId === null
      ? -1
      : openResults.findIndex((option) => option.structureId === highlightedId);
  const highlightedIndex = foundIndex === -1 ? null : foundIndex;

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (openResults === null) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End':
        e.preventDefault();
        {
          const next = moveHighlight(e.key as ComboboxNavKey, highlightedIndex, openResults.length);
          setHighlightedId(next === null ? null : openResults[next].structureId);
        }
        break;
      case 'Enter':
        if (highlightedIndex !== null) {
          e.preventDefault();
          pick(openResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setDismissed(true);
        setHighlightedId(null);
        break;
    }
  }

  const highlightedOption =
    openResults !== null && highlightedIndex !== null ? openResults[highlightedIndex] : null;
  const highlightedName = highlightedOption ? optionLabel(highlightedOption) : null;

  const searchBox =
    granted === undefined ? null : canSearch ? (
      <div className="relative flex flex-col gap-1">
        <label htmlFor={inputId}>{t(labelKey)}</label>
        <SearchInput
          id={inputId}
          value={query ?? picked ?? selectedLabel ?? ''}
          placeholder={t('industry.buildLocationPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setQuery(null)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={openResults !== null}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedOption ? optionId(highlightedOption.structureId) : undefined
          }
        />
        <LiveStatus>
          {!searching &&
            !failed &&
            results !== null &&
            (highlightedName
              ? t('industry.buildLocationHighlighted', {
                  count: results.length,
                  name: highlightedName,
                })
              : t('industry.buildLocationResultsCount', { count: results.length }))}
        </LiveStatus>
        {searching && (
          <span className="flex items-center gap-1 text-text-dim">
            <Spinner size="sm" label={t('industry.buildLocationSearching')} />
          </span>
        )}
        {!searching && failed && (
          <span role="alert" className="text-danger">
            {t('industry.buildLocationFailed')}
          </span>
        )}
        {!searching && !failed && results !== null && results.length === 0 && (
          <span className="text-text-dim">{t('industry.buildLocationNoResults')}</span>
        )}
        {openResults !== null && (
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-56 overflow-y-auto rounded-xs border border-line bg-panel"
          >
            {openResults.map((option, index) => (
              <li
                key={option.structureId}
                id={optionId(option.structureId)}
                role="option"
                aria-selected={index === highlightedIndex}
                className={cx(
                  'flex cursor-pointer flex-col items-start gap-0.5 border-b border-line px-2 py-1.5 last:border-b-0',
                  index === highlightedIndex
                    ? `bg-panel-2 ${activeOptionClassName}`
                    : 'hover:bg-panel-2'
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                <span className="truncate">{optionLabel(option)}</span>
                <span className="text-text-dim">
                  {t('industry.buildLocationDetail', {
                    facility: FACILITY_PRESETS[option.facility].name,
                    system: option.systemName,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : (
      <div className="flex flex-col gap-1.5 rounded-xs border border-line p-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-text-dim">{t('industry.buildLocationGrantHint')}</span>
        <NeedsConnection>
          <Button
            size="sm"
            onClick={() => void beginEveLogin({ characterId: characterId ?? undefined })}
          >
            {t('industry.buildLocationGrant')}
          </Button>
        </NeedsConnection>
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {searchBox}

      <Disclosure
        label={t('industry.override')}
        trailing={summary}
        expanded={overriding}
        onToggle={() => setOverriding((open) => !open)}
        className="rounded-xs border border-line"
      >
        <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3">{children}</div>
      </Disclosure>
    </div>
  );
}
