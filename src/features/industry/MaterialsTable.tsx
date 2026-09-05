import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, IconButton, TextInput, Tooltip, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type {
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';
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
  const value = unmaskNumber(raw);
  // Materials are consumed in whole units everywhere in the engine, so a
  // typed fraction is floored rather than refused.
  return value === undefined ? undefined : Math.floor(value);
}

const parsePrice = unmaskNumber;

interface SourcingInputProps {
  value: number | undefined;
  /** Accessible name — the column alone cannot name it, a `<th>` does not label a form control. */
  label: string;
  /** Which keypad a phone raises: `numeric` for a whole count, `decimal` where a fraction is legal. */
  inputMode: 'numeric' | 'decimal';
  widthClassName: string;
  /**
   * Shown while the field is empty. Only right where empty means a known
   * default — "0" on a quantity nobody has claimed to own. The price field
   * passes none: empty there means the market has no number for this
   * material, which the tag beside it spells out, and a ghost 0 would read as
   * a price of nothing.
   */
  placeholder?: string;
  /**
   * Pairs with an external `<label htmlFor>` for callers that don't wrap the
   * input in a `<label>`. Only for click-to-focus — `aria-label` above (set
   * from `label`) always wins the accessible name over an id/for
   * association, so this id changes nothing a screen reader announces.
   */
  id?: string;
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
 *
 * It masks at rest and unmasks to edit: a column of prices is unreadable as
 * `338600` beside `6622`, and a box you are typing into is unusable if a
 * formatter rewrites the digits under the caret. So the grouped number shows
 * while the field sits, focus swaps in the plain one, and blur puts the mask
 * back. That costs `type="number"` — an input holding "338,600" is invalid to
 * the browser and reads back as empty — so this is a text field with the
 * numeric keypad asked for explicitly. Nothing is lost: the spin buttons were
 * already suppressed on a phone, Enter still commits, and `unmaskNumber`
 * accepts the separators a pasted number brings with it.
 */
export function SourcingInput({
  value,
  label,
  inputMode,
  widthClassName,
  placeholder,
  id,
  parse,
  onCommit,
}: SourcingInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  return (
    <TextInput
      id={id}
      size="sm"
      type="text"
      inputMode={inputMode}
      aria-label={label}
      placeholder={placeholder}
      // Digits sit right in the table, where they line up with the numeric
      // columns around them; in the stacked card there is no column to line
      // up with, and right-aligned digits would float a width away from the
      // label that names them.
      className={cx(widthClassName, 'text-left tabular-nums sm:text-right')}
      // Three states, and the order matters. A typed draft wins, verbatim — a
      // half-finished "6622." has to survive a keystroke a formatter would
      // eat. Otherwise the prop is shown: plain while focused, masked at rest.
      //
      // Deliberately not "unmask into the draft on focus": that would freeze
      // the number as it stood when the field was entered, and a market
      // refresh landing mid-edit would then be committed on blur as an
      // override of the stale price. Until a key is pressed the prop stays the
      // source of truth, exactly as it was before the mask existed.
      value={draft ?? (value === undefined ? '' : editing ? String(value) : maskNumber(value))}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const next = parse(event.target.value);
        setDraft(null);
        setEditing(false);
        // Tabbing through an untouched field must not rewrite the record.
        // This is also what keeps the price field's market default a default:
        // its `value` is the hub price when nothing is stored, so a field
        // blurred as it was found commits nothing and the row keeps tracking
        // the market.
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
 *
 * The house `Tooltip` reads that same label on hover or touch-and-hold —
 * never a bare `title`, which every other pointer-revealed hint in the app
 * already avoids (docs/DESIGN.md's component table). `Tooltip`'s trigger
 * only needs `asChild`, not focusability: Radix reveals it on pointer
 * movement regardless of tab order, and only wires up its `onFocus` handler,
 * which never fires without a `tabIndex` to focus onto. So wrapping the span
 * costs nothing of the "no tab stop" rule above — there's a test pinning it.
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
    <Tooltip content={label}>
      <span
        role="img"
        aria-label={label}
        className={cx('shrink-0', building ? 'text-isk-pos' : 'text-text-dim')}
      >
        <Glyph size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}

/**
 * Materials table: name, effective quantity, units already owned, price, and
 * line total.
 *
 * Price is one field, not a market column beside an override column. The two
 * said the same thing twice — a row's price is a single number, and which of
 * the two boxes it came from is a detail — while leaving an empty box on every
 * row with nothing to say about what belonged in it. So the field carries the
 * hub price as its value and typing over it is the override: the market number
 * is the default, editing it is the exception, and the revert control beside a
 * changed field puts the market back. `SourcingInput`'s commit rule is what
 * makes that safe — a field blurred as it was found writes nothing, so merely
 * tabbing across a row cannot freeze today's hub price into the plan.
 *
 * Three pricing states have to be told apart — hub-priced, owned-free, manually
 * overridden — and they are not mutually exclusive: a row can be half owned and
 * overridden at once. So every cue is text, never colour alone (WCAG 1.4.1, and
 * docs/DESIGN.md §7): a Hub/Override tag beside the price field, and an
 * owned/bought split spelled out beneath a partly-owned row's blended total.
 * `materialRow.ts` decides what each row shows, so the CSV export can't drift
 * from it.
 *
 * Every cell's own alignment is held behind `sm:`. Below that the row is a
 * stacked card (docs/DESIGN.md §4a) where the header prints into a left gutter
 * and the value starts at a fixed offset — a cell that right-aligns itself
 * escapes that offset, and with every column but the name right-aligned the
 * card came out as a zigzag of labels and values rather than two columns.
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
            <span className="flex flex-col items-start gap-0.5 sm:items-end">
              <SourcingInput
                value={owned}
                label={t('industry.ownedQuantityFor', { material: nameFor(material.typeID) })}
                inputMode="numeric"
                widthClassName="w-20"
                placeholder="0"
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
        id: 'price',
        header: t('industry.price'),
        align: 'right',
        render: (material) => {
          const state = materialRowState(material, sourcing, pricesReady);
          const overridden = state.priceSource === 'override';
          const name = nameFor(material.typeID);
          // Nothing to price a fully owned material at, so a row with no
          // number is not a problem worth a warning — only a real remainder
          // is.
          const tag = overridden
            ? { text: t('industry.priceSourceOverride'), tone: 'text-accent' }
            : state.unitPrice !== null
              ? { text: t('industry.priceSourceHub'), tone: 'text-text-dim' }
              : state.fullyOwned
                ? { text: t('industry.priceSourceOwned'), tone: 'text-text-dim' }
                : { text: t('industry.unpriced'), tone: 'text-warning' };
          return (
            /*
             * Mirrored from `sm` up rather than just right-aligned. The header
             * is right-aligned to the cell, so PRICE sits over whatever the
             * cell's last element is — and with the field first, that was the
             * tag and the revert control, leaving the header floating a
             * `Hub ↺` away from the digits it names. Reversing the row puts
             * the field back on the cell's right edge, where the header is,
             * and hands the trailing elements the leftward room instead.
             *
             * The card keeps the DOM order (field, then what it is, then what
             * to do about it), which is why this is `flex-row-reverse` at one
             * width and not a reordering of the markup. `justify-start` packs
             * to main-start, which reversing moves to the right — so it is the
             * right-edge rule at both widths, and there is no `sm:justify-end`
             * to contradict it.
             *
             * The field's own edges no longer depend on what sits beside it:
             * fixed width against a fixed right edge pins both. That is what
             * the reserved slot used to buy, so it is gone.
             */
            <span className="inline-flex items-center justify-start gap-1 sm:flex-row-reverse">
              <SourcingInput
                value={state.unitPrice ?? undefined}
                label={t('industry.priceFor', { material: name })}
                inputMode="decimal"
                widthClassName="w-24"
                parse={parsePrice}
                onCommit={(overridePrice) => onSourcingChange(material.typeID, { overridePrice })}
              />
              <span className={cx('text-[0.6875rem]', tag.tone)}>{tag.text}</span>
              {overridden && (
                <IconButton
                  size="sm"
                  variant="plain"
                  icon={<Icon.Revert size={Icon.ICON_SIZE.sm} />}
                  label={t('industry.resetPriceFor', { material: name })}
                  onClick={() => onSourcingChange(material.typeID, { overridePrice: undefined })}
                />
              )}
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
            <span className="flex flex-col items-start sm:items-end">
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
