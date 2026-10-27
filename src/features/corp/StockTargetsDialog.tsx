/**
 * "Stock targets" on the Corp assets page: every stock target the pilot has
 * set for one corporation, with the means to add a target for any item (found
 * by name, even one the corporation owns none of), change one, or remove one.
 * Edits save at once, as they do in the Target cell. The item search is the
 * market catalogue every other item picker reads.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { MarketTypePicker } from '@/features/stockTargets/MarketTypePicker';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { useCorpStockTargets } from './stockTargets';

export interface StockTargetsDialogProps {
  corporationId: number | null;
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
  const { hydrated, targets, setTarget, removeTarget } = useCorpStockTargets(corporationId);
  // A write before the stored value has loaded, or with no corporation, is lost: don't offer one.
  const canEdit = hydrated && corporationId !== null;
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
          disabled={!canEdit}
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
                disabled={!canEdit}
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
  disabled,
  onChange,
  onRemove,
}: {
  name: string;
  target: number;
  owned: number | null;
  disabled: boolean;
  onChange: (value: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const value = Math.floor(Number(draft));
    setDraft(null);
    // Clearing the field removes the target, as in the ledger's Target cell.
    if (draft.trim() === '') onRemove();
    else if (Number.isFinite(value) && value >= 1 && value !== target) onChange(value);
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
        disabled={disabled}
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
        disabled={disabled}
        onClick={onRemove}
      />
    </li>
  );
}

function AddTarget({
  searchRef,
  disabled,
  onAdd,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onAdd: (typeId: number, quantity: number) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const quantityRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<MarketTypeEntry | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<{ field: 'item' | 'quantity'; text: string } | null>(null);
  const [added, setAdded] = useState<{ name: string; n: number } | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
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
        setResetKey((n) => n + 1);
        setQuantity('');
        setError(null);
        searchRef.current?.focus();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <MarketTypePicker
            inputRef={searchRef}
            label={t('corp.stockTargets.searchLabel')}
            placeholder={t('corp.stockTargets.searchPlaceholder')}
            unavailableText={t('corp.stockTargets.searchUnavailable')}
            picked={picked}
            resetKey={resetKey}
            invalid={error?.field === 'item'}
            describedBy={error?.field === 'item' ? `${id}-error` : undefined}
            onPick={(type) => {
              setPicked(type);
              if (type) {
                setError(null);
                quantityRef.current?.focus();
              }
            }}
          />
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
        <Button type="submit" variant="primary" disabled={disabled}>
          {t('corp.stockTargets.add')}
        </Button>
      </div>
      {error !== null && (
        <FieldError id={`${id}-error`} className="block text-xs">
          {error.text}
        </FieldError>
      )}
      <LiveStatus announceKey={added?.n}>
        {added && t('corp.stockTargets.added', { name: added.name })}
      </LiveStatus>
    </form>
  );
}
