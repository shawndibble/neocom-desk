import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, TextInput, type DataTableColumn } from '@/components/ui';
import type {
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';

interface MaterialsTableProps {
  /** Engine cost lines — already resolved against the plan's sourcing overrides and hub prices. */
  materials: readonly MaterialCostLine[];
  nameFor: (typeID: number) => string;
  /** The plan's raw overrides. Needed to tell an override apart from a hub price of the same value. */
  sourcing: MaterialSourcingMap | undefined;
  /** False when prices couldn't be fetched at all (offline) — unit price and line total fall back to placeholder text. */
  pricesReady: boolean;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
}

/** Blank or garbage clears the field; anything real is kept as-is (the engine clamps). */
function parseCount(raw: string): number | undefined {
  const n = Number(raw);
  return raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.floor(n);
}

function parsePrice(raw: string): number | undefined {
  const n = Number(raw);
  return raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n;
}

interface SourcingInputProps {
  value: number | undefined;
  /** Accessible name — the column alone cannot name it, a `<th>` does not label a form control. */
  label: string;
  step: number | 'any';
  widthClassName: string;
  parse: (raw: string) => number | undefined;
  onCommit: (value: number | undefined) => void;
}

/**
 * One always-editable numeric cell. Commits on blur (and on Enter, which blurs)
 * rather than per keystroke: every commit writes the whole plan record and
 * schedules a sync, and clearing the box to retype would briefly drop the entry
 * and flip the row's state labels mid-edit. While focused the raw string is
 * held locally so a half-typed value survives; the moment the edit ends the
 * prop is the source of truth again.
 */
function SourcingInput({
  value,
  label,
  step,
  widthClassName,
  parse,
  onCommit,
}: SourcingInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      size="sm"
      type="number"
      min={0}
      step={step}
      inputMode="decimal"
      aria-label={label}
      className={cx(widthClassName, 'text-right tabular-nums')}
      value={draft ?? value ?? ''}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const next = parse(event.target.value);
        setDraft(null);
        // Tabbing through an untouched field must not rewrite the record.
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/**
 * Materials table: name, effective quantity, the two sourcing overrides (units
 * already owned, manual unit price), unit price and line total.
 *
 * Three pricing states have to be told apart — hub-priced, owned-free, manually
 * overridden — and they are not mutually exclusive: a row can be half owned and
 * overridden at once. So each cue is text, never colour alone (WCAG 1.4.1): the
 * unit price carries a Hub/Override tag read from the stored overrides rather
 * than by comparing numbers (an override equal to the hub price is otherwise
 * invisible), and a partly-owned row spells its owned/bought split out beneath
 * the blended line total.
 */
export function MaterialsTable({
  materials,
  nameFor,
  sourcing,
  pricesReady,
  onSourcingChange,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<MaterialCostLine>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        render: (material) => nameFor(material.typeID),
      },
      {
        id: 'quantity',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => material.quantity.toLocaleString(),
      },
      {
        id: 'owned',
        header: t('industry.ownedQuantity'),
        align: 'right',
        render: (material) => (
          <SourcingInput
            value={sourcing?.[material.typeID]?.ownedQuantity}
            label={t('industry.ownedQuantityFor', { material: nameFor(material.typeID) })}
            step={1}
            widthClassName="w-20"
            parse={parseCount}
            onCommit={(ownedQuantity) => onSourcingChange(material.typeID, { ownedQuantity })}
          />
        ),
      },
      {
        id: 'overridePrice',
        header: t('industry.overridePrice'),
        align: 'right',
        render: (material) => (
          <SourcingInput
            value={sourcing?.[material.typeID]?.overridePrice}
            label={t('industry.overridePriceFor', { material: nameFor(material.typeID) })}
            step="any"
            widthClassName="w-24"
            parse={parsePrice}
            onCommit={(overridePrice) => onSourcingChange(material.typeID, { overridePrice })}
          />
        ),
      },
      {
        id: 'unitPrice',
        header: t('industry.unitPrice'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => {
          const priced = pricesReady && material.unitPrice !== null;
          if (!priced) {
            // A fully owned material costs nothing, so a missing hub price for
            // it is not a problem worth a warning — only a real remainder is.
            return material.remainingQuantity === 0 ? (
              <span className="text-text-dim">{t('industry.priceSourceOwned')}</span>
            ) : (
              <span className="text-warning">{t('industry.unpriced')}</span>
            );
          }
          const overridden = sourcing?.[material.typeID]?.overridePrice !== undefined;
          return (
            <span className="inline-flex items-baseline justify-end gap-1">
              {formatIsk(material.unitPrice ?? 0)}
              <span
                className={cx('text-[0.6875rem]', overridden ? 'text-accent' : 'text-text-faint')}
              >
                {overridden ? t('industry.priceSourceOverride') : t('industry.priceSourceHub')}
              </span>
            </span>
          );
        },
      },
      {
        id: 'lineTotal',
        header: t('industry.lineTotal'),
        align: 'right',
        className: 'tabular-nums',
        render: (material) => {
          const priced = pricesReady && material.unitPrice !== null;
          // A fully owned row costs nothing whether or not anything is priced.
          const fullyOwned = material.remainingQuantity === 0;
          const owned = material.ownedQuantity;
          return (
            <span className="flex flex-col items-end">
              <span>
                {fullyOwned || priced ? formatIsk(material.lineCost) : t('common.unknown')}
              </span>
              {owned > 0 && (
                <span className="text-[0.6875rem] text-text-dim">
                  {fullyOwned
                    ? t('industry.sourcingAllOwned', { owned: owned.toLocaleString() })
                    : priced
                      ? t('industry.sourcingSplit', {
                          owned: owned.toLocaleString(),
                          bought: material.remainingQuantity.toLocaleString(),
                          price: formatIsk(material.unitPrice ?? 0),
                        })
                      : t('industry.sourcingSplitUnpriced', {
                          owned: owned.toLocaleString(),
                          bought: material.remainingQuantity.toLocaleString(),
                        })}
                </span>
              )}
            </span>
          );
        },
      },
    ],
    [t, nameFor, sourcing, pricesReady, onSourcingChange]
  );

  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        rows={materials}
        rowKey={(material) => material.typeID}
        label={t('industry.materials')}
        density="compact"
      />
    </div>
  );
}
