import { useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  LiveStatus,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { suggestionOptionClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import { SecurityStatus } from '@/components/SecurityStatus';
import { useCombobox } from '@/lib/useCombobox';
import type { PickedStation } from '@/features/places/placeSearch';
import { useKnownPlaces } from '@/features/places/useKnownPlaces';
import { buildPickerOptions, pickedStationOf, type PickerOption } from './pickerOptions';
import { useSolarSystemList, useSystemName } from './useSolarSystems';

const MATCH_LIMIT = 8;

export interface SolarSystemPickerProps {
  value: number | null;
  onChange: (systemId: number, station?: PickedStation) => void;
  ariaLabel: string;
  triggerLabel?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  footer?: (close: () => void) => ReactNode;
  exclude?: ReadonlySet<number>;
  showSecurity?: boolean;
  triggerRef?: Ref<HTMLButtonElement>;
  places?: boolean;
}

export function SolarSystemPicker({
  value,
  onChange,
  ariaLabel,
  triggerLabel,
  placeholder,
  disabled = false,
  hint,
  footer,
  exclude,
  showSecurity = false,
  triggerRef,
  places = false,
}: SolarSystemPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { systems, failed: systemsFailed, retry: retrySystems } = useSolarSystemList(open);
  const [bodyRef, , holdRetryFocus] = useRetryFocus(
    systemsFailed ? 'failed' : systems === null ? 'busy' : 'ok',
    open
  );
  const valueName = useSystemName(triggerLabel === undefined ? value : null);

  const placeHits = useKnownPlaces(query, places && open, MATCH_LIMIT);
  const matches = useMemo(
    () => (systems ? buildPickerOptions(systems, query, exclude, placeHits, MATCH_LIMIT) : []),
    [systems, query, exclude, placeHits]
  );

  const combo = useCombobox({ count: matches.length, open: matches.length > 0 });

  function close() {
    setOpen(false);
    setQuery('');
    combo.reset();
  }

  function choose(option: PickerOption) {
    onChange(option.systemId, pickedStationOf(option));
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    const pick = matches[combo.highlight ?? 0];
    if (event.key === 'Enter' && pick) {
      event.preventDefault();
      choose(pick);
    }
  }

  const shown = triggerLabel ?? (value === null ? (placeholder ?? '') : (valueName ?? '…'));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          disabled={disabled}
          aria-label={ariaLabel}
          className="max-w-full min-w-0 whitespace-nowrap"
        >
          <span className="truncate">{shown}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={ariaLabel} className="w-72 p-2">
        <div ref={bodyRef} tabIndex={-1} className="flex flex-col gap-2 focus:outline-none">
          <LiveStatus>{systemsFailed ? t('jumpRange.systemsFailed') : ''}</LiveStatus>
          {hint !== undefined && <p className="text-text-dim">{hint}</p>}
          <SearchInput
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              combo.reset();
            }}
            onKeyDown={onKeyDown}
            placeholder={t('jumpRange.searchPlaceholder')}
            aria-label={t('jumpRange.searchPlaceholder')}
            {...combo.inputProps}
          />
          {systemsFailed && (
            <div className="flex flex-col items-start gap-1.5">
              <p className="text-warning">{t('jumpRange.systemsFailed')}</p>
              <Button
                size="sm"
                onClick={() => {
                  holdRetryFocus();
                  retrySystems();
                }}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}
          {matches.length > 0 && (
            <ul {...combo.listboxProps} className="flex flex-col">
              {matches.map((option, index) => (
                <li
                  key={option.key}
                  {...combo.optionProps(index)}
                  className={suggestionOptionClassName(index === combo.activeIndex)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  {showSecurity && option.security !== null && (
                    <SecurityStatus security={option.security} className="ml-1" />
                  )}
                  {places && (
                    <span className="ml-2 text-xs text-text-dim">
                      {t(`travel.stops.kind.${option.kind}`)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!systemsFailed && query.trim() !== '' && matches.length === 0 && (
            <p className={cx('flex items-center text-text-dim', tappableRowClassName)}>
              {systems === null ? t('jumpRange.searching') : t('jumpRange.noMatch')}
            </p>
          )}
          {footer?.(close)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
