/**
 * "Stock targets…" on the Corp assets page: every stock target the pilot has
 * set for one corporation, with the means to add a target for any item (found
 * by name, even one the corporation owns none of), change one, or remove one.
 * Edits save at once, as they do in the Target cell. The item search is the
 * market catalogue every other item picker reads.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  FieldError,
  IconButton,
  LiveStatus,
  Modal,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { loadTypeNames } from '@/features/character/typeNames';
import { COMBOBOX_NAV_KEYS, moveHighlight, type ComboboxNavKey } from '@/lib/comboboxNav';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import { rankedSearch } from '@/lib/rankedSearch';
import { useRetryableLoad } from '@/lib/useRetryableLoad';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { useCorpStockTargets } from './stockTargets';

const SEARCH_LIMIT = 8;

export interface StockTargetsDialogProps {
  corporationId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Units the corporation owns per type (the ledger's usable stock), to show beside each target. */
  ownedByTypeId?: ReadonlyMap<number, number>;
}

export function StockTargetsDialog({
  corporationId,
  open,
  onOpenChange,
  ownedByTypeId,
}: StockTargetsDialogProps) {
  const { t } = useTranslation();
  const { targets, setTarget, removeTarget } = useCorpStockTargets(corporationId);
  const names = useTypeNames(open ? [...targets.keys()] : []);
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(
    () =>
      [...targets.entries()]
        .map(([typeId, target]) => ({
          typeId,
          target,
          name: names.get(typeId) ?? t('corp.stockTargets.typeFallback', { id: typeId }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [targets, names, t]
  );

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={t('corp.stockTargets.title')}
      initialFocusRef={searchRef}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-dim">{t('corp.stockTargets.intro')}</p>
        <AddTarget
          searchRef={searchRef}
          onAdd={(typeId, quantity) => setTarget(typeId, quantity)}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={t('corp.stockTargets.emptyTitle')}
            hint={t('corp.stockTargets.emptyHint')}
          />
        ) : (
          <ul aria-label={t('corp.stockTargets.listLabel')} className="divide-y divide-line">
            {rows.map((row) => (
              <TargetRow
                key={row.typeId}
                name={row.name}
                target={row.target}
                owned={ownedByTypeId ? (ownedByTypeId.get(row.typeId) ?? 0) : null}
                onChange={(value) => setTarget(row.typeId, value)}
                onRemove={() => removeTarget(row.typeId)}
              />
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>{t('corp.stockTargets.done')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function useTypeNames(typeIds: readonly number[]): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const key = [...typeIds].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (key === '') return;
    let live = true;
    loadTypeNames(key.split(',').map(Number)).then(
      (loaded) => {
        if (live) setNames(loaded);
      },
      () => {
        // Names are decoration; a row falls back to "Type 34".
      }
    );
    return () => {
      live = false;
    };
  }, [key]);
  return names;
}

function TargetRow({
  name,
  target,
  owned,
  onChange,
  onRemove,
}: {
  name: string;
  target: number;
  owned: number | null;
  onChange: (value: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const value = Math.floor(Number(draft));
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(value) && value >= 1 && value !== target) {
      onChange(value);
    }
  }

  return (
    <li className={cx(tappableRowClassName, 'flex flex-wrap items-center gap-x-3 gap-y-1 py-1')}>
      <span className="min-w-0 flex-1 truncate text-sm text-text">{name}</span>
      {owned !== null && (
        <span className="text-xs text-text-dim tabular-nums">
          {t('corp.stockTargets.owned', { formatted: formatNumber(owned) })}
        </span>
      )}
      <TextInput
        size="sm"
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        aria-label={t('corp.stockTargets.cellLabel', { name })}
        className="w-28 text-right tabular-nums"
        value={draft ?? String(target)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && draft !== null) {
            // Reverts the field, not the dialog.
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
      <IconButton
        label={t('corp.stockTargets.removeLabel', { name })}
        icon={<Icon.Close />}
        onClick={onRemove}
      />
    </li>
  );
}

function AddTarget({
  searchRef,
  onAdd,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const listId = `${id}-results`;
  const quantityRef = useRef<HTMLInputElement>(null);
  const [types, setTypes] = useState<readonly MarketTypeEntry[]>([]);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [picked, setPicked] = useState<MarketTypeEntry | null>(null);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<{ field: 'item' | 'quantity'; text: string } | null>(null);
  const [added, setAdded] = useState<{ name: string; n: number } | null>(null);

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

  const matches = useMemo(
    () =>
      picked
        ? []
        : rankedSearch(types, query, { primary: (type) => type.name, limit: SEARCH_LIMIT }),
    [types, query, picked]
  );
  const listOpen = matches.length > 0;

  function choose(type: MarketTypeEntry) {
    setPicked(type);
    setQuery(type.name);
    setHighlight(null);
    setError(null);
    quantityRef.current?.focus();
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (COMBOBOX_NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      setHighlight(moveHighlight(event.key as ComboboxNavKey, highlight, matches.length));
    } else if (event.key === 'Enter' && listOpen) {
      event.preventDefault();
      choose(matches[highlight ?? 0]);
    } else if (event.key === 'Escape' && listOpen) {
      // Closes the list, not the dialog.
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
    }
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = Math.floor(Number(quantity));
        if (!picked) {
          setError({ field: 'item', text: t('corp.stockTargets.pickItem') });
          searchRef.current?.focus();
          return;
        }
        if (!Number.isFinite(amount) || amount < 1) {
          setError({ field: 'quantity', text: t('corp.stockTargets.quantityRequired') });
          quantityRef.current?.focus();
          return;
        }
        onAdd(picked.typeId, amount);
        setAdded((prev) => ({ name: picked.name, n: (prev?.n ?? 0) + 1 }));
        setPicked(null);
        setQuery('');
        setQuantity('');
        setError(null);
        searchRef.current?.focus();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1 space-y-1">
          <label className="block text-xs text-text-dim" htmlFor={`${id}-search`}>
            {t('corp.stockTargets.searchLabel')}
          </label>
          <TextInput
            ref={searchRef}
            id={`${id}-search`}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlight === null ? undefined : `${listId}-${highlight}`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error?.field === 'item' || undefined}
            aria-describedby={error?.field === 'item' ? `${id}-error` : undefined}
            className="w-full"
            value={query}
            placeholder={t('corp.stockTargets.searchPlaceholder')}
            onChange={(event) => {
              setQuery(event.target.value);
              setPicked(null);
              setHighlight(null);
            }}
            onKeyDown={onSearchKeyDown}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={t('corp.stockTargets.searchLabel')}
            hidden={!listOpen}
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
        <div className="space-y-1">
          <label className="block text-xs text-text-dim" htmlFor={`${id}-quantity`}>
            {t('corp.stockTargets.quantityLabel')}
          </label>
          <TextInput
            ref={quantityRef}
            id={`${id}-quantity`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="w-28 text-right tabular-nums"
            value={quantity}
            aria-invalid={error?.field === 'quantity' || undefined}
            aria-describedby={error?.field === 'quantity' ? `${id}-error` : undefined}
            onChange={(e) => {
              setQuantity(e.target.value);
              setError(null);
            }}
          />
        </div>
        <Button type="submit" variant="primary">
          {t('corp.stockTargets.add')}
        </Button>
      </div>
      {typesFailed && (
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span>{t('corp.stockTargets.searchUnavailable')}</span>
          <Button
            size="sm"
            onClick={() => {
              searchRef.current?.focus();
              retryTypes();
            }}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {error !== null && (
        <FieldError id={`${id}-error`} className="block text-xs">
          {error.text}
        </FieldError>
      )}
      {/* Always mounted, so a failure or an add is announced when it appears (DESIGN.md §7). */}
      <LiveStatus announceKey={added?.n}>
        {typesFailed
          ? t('corp.stockTargets.searchUnavailable')
          : added && t('corp.stockTargets.added', { name: added.name })}
      </LiveStatus>
    </form>
  );
}
