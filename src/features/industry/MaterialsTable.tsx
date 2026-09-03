import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, TextInput, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type {
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { materialRowState } from './materialRow';
import { suggestedOwnedQuantity } from '@/engine/industry/ownedStock';
import { OwnedStockHint } from './OwnedStockHint';
import type { OwnedStockDetection } from './ownedStockDetection';

interface MaterialsTableProps {
  /** Engine cost lines — already resolved against the plan's sourcing overrides and hub prices. */
  materials: readonly MaterialCostLine[];
  nameFor: (typeID: number) => string;
  /** The plan's raw overrides. Needed to tell an override apart from a hub price of the same value. */
  sourcing: MaterialSourcingMap | undefined;
  /** False when the market snapshot couldn't be fetched — hub prices fall back to placeholder text. */
  pricesReady: boolean;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /** ESI-detected owned stock (issue #181); omitted where no detection ran. Never written by itself. */
  detection?: OwnedStockDetection;
  /** Wraps each row in the shared item context menu; omitted where the caller has no menu to offer. */
  rowContextMenu?: (material: MaterialCostLine, tr: ReactElement) => ReactElement;
  /** Make-or-buy verdicts by material typeID. A material with no entry has no advice to show; omitted entirely where the caller can't price recipes. */
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>;
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
 * The row's make-or-buy verdict (CONTEXT.md round 29). Two distinct glyphs
 * rather than one glyph in two tones: the verdict has to survive greyscale
 * and a screen reader (docs/DESIGN.md §7), so the shape carries it and the
 * label spells it out with both prices. Deliberately not a control — it has
 * nothing to click, so it takes no tab stop from the sourcing inputs on the
 * same row.
 */
function MakeOrBuyMarker({ advice, remaining }: { advice: MakeOrBuy; remaining: number }) {
  const { t } = useTranslation();
  const building = advice.verdict === 'build';
  const method = advice.method === 'manufacturing' ? 'Manufacturing' : 'Planetary';
  const sentences = [
    // Two decimals on the unit prices, unlike the whole-ISK columns beside
    // them: the verdict turns on the gap between these two numbers, and
    // rounding a 5.4-vs-5.6 call to "5 against 5" would make it unreadable.
    t(`industry.makeOrBuy.${building ? 'build' : 'buy'}${method}`, {
      make: formatIsk(advice.makeUnitPrice, 2),
      buy: formatIsk(advice.buyUnitPrice, 2),
      me: advice.me,
    }),
  ];
  // Nothing is riding on a fully owned row: there is no remainder to spend
  // the difference on either way.
  if (remaining > 0 && advice.savings > 0) {
    sentences.push(
      t('industry.makeOrBuy.savings', {
        amount: formatIsk(advice.savings),
        quantity: remaining.toLocaleString(),
      })
    );
  }
  const label = sentences.join(' ');
  const Glyph = building ? Icon.Build : Icon.Buy;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx('shrink-0', building ? 'text-isk-pos' : 'text-text-dim')}
    >
      <Glyph size={Icon.ICON_SIZE.sm} />
    </span>
  );
}

/**
 * Materials table: name, effective quantity, the two sourcing overrides (units
 * already owned, manual unit price), unit price and line total.
 *
 * Three pricing states have to be told apart — hub-priced, owned-free, manually
 * overridden — and they are not mutually exclusive: a row can be half owned and
 * overridden at once. So every cue is text, never colour alone (WCAG 1.4.1, and
 * docs/DESIGN.md §7): a Hub/Override tag beside the unit price, and an
 * owned/bought split spelled out beneath a partly-owned row's blended total.
 * `materialRow.ts` decides what each row shows, so the CSV export can't drift
 * from it.
 */
export function MaterialsTable({
  materials,
  nameFor,
  sourcing,
  pricesReady,
  onSourcingChange,
  detection,
  rowContextMenu,
  makeOrBuy,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<MaterialCostLine>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        render: (material) => {
          const advice = makeOrBuy?.get(material.typeID);
          return (
            <span className="inline-flex items-center gap-1.5">
              {advice && <MakeOrBuyMarker advice={advice} remaining={material.remainingQuantity} />}
              {nameFor(material.typeID)}
            </span>
          );
        },
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
        render: (material) => {
          const stock = detection?.stockFor(material.typeID);
          const owned = sourcing?.[material.typeID]?.ownedQuantity;
          // A row already holding what the action would write has nothing left
          // to apply — compared against the clamped suggestion, not the raw
          // detected total, or the affordance would linger on every row whose
          // requirement is smaller than the stock behind it.
          const suggestion = stock ? suggestedOwnedQuantity(stock.quantity, material.quantity) : 0;
          return (
            <span className="flex flex-col items-end gap-0.5">
              <SourcingInput
                value={owned}
                label={t('industry.ownedQuantityFor', { material: nameFor(material.typeID) })}
                step={1}
                widthClassName="w-20"
                parse={parseCount}
                onCommit={(ownedQuantity) => onSourcingChange(material.typeID, { ownedQuantity })}
              />
              {stock && detection && (
                <OwnedStockHint
                  stock={stock}
                  detection={detection}
                  materialName={nameFor(material.typeID)}
                  suggestion={suggestion}
                  canApply={owned !== suggestion}
                  onApply={() => onSourcingChange(material.typeID, { ownedQuantity: suggestion })}
                />
              )}
            </span>
          );
        },
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
          const state = materialRowState(material, sourcing, pricesReady);
          if (state.unitPrice === null) {
            // A fully owned material costs nothing, so a missing price for it
            // is not a problem worth a warning — only a real remainder is.
            return state.fullyOwned ? (
              <span className="text-text-dim">{t('industry.priceSourceOwned')}</span>
            ) : (
              <span className="text-warning">{t('industry.unpriced')}</span>
            );
          }
          const overridden = state.priceSource === 'override';
          return (
            <span className="inline-flex items-baseline justify-end gap-1">
              {formatIsk(state.unitPrice)}
              <span
                className={cx('text-[0.6875rem]', overridden ? 'text-accent' : 'text-text-dim')}
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
          const state = materialRowState(material, sourcing, pricesReady);
          const owned = material.ownedQuantity;
          return (
            <span className="flex flex-col items-end">
              <span>
                {state.lineCost === null ? t('common.unknown') : formatIsk(state.lineCost)}
              </span>
              {owned > 0 && (
                <span className="text-[0.6875rem] text-text-dim">
                  {state.fullyOwned
                    ? t('industry.sourcingAllOwned', { owned: owned.toLocaleString() })
                    : state.unitPrice !== null
                      ? t('industry.sourcingSplit', {
                          owned: owned.toLocaleString(),
                          bought: material.remainingQuantity.toLocaleString(),
                          price: formatIsk(state.unitPrice),
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
    [t, nameFor, sourcing, pricesReady, onSourcingChange, detection, makeOrBuy]
  );

  return (
    <div className="overflow-x-auto">
      <DataTable
        columns={columns}
        rows={materials}
        rowKey={(material) => material.typeID}
        label={t('industry.materials')}
        density="compact"
        rowContextMenu={rowContextMenu}
      />
    </div>
  );
}
