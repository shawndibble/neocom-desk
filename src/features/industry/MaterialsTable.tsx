import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, IconButton, TextInput, Tooltip, type DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeMethod, MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';
import { materialRowState } from './materialRow';
import { suggestedOwnedQuantity } from '@/engine/industry/ownedStock';
import { OwnedStockHint } from './OwnedStockHint';
import type { OwnedStockDetection } from './ownedStockDetection';
import { buildRecipe, type MaterialTableRow } from './subBuildPlan';

interface MaterialsTableProps {
  /** Engine cost lines — already resolved against the plan's sourcing overrides and hub prices. */
  materials: readonly MaterialTableRow[];
  nameFor: (typeID: number) => string;
  /** The plan's raw overrides. Needed to tell an override apart from a hub price of the same value. */
  sourcing: MaterialSourcingMap | undefined;
  /** False when the market snapshot couldn't be fetched — hub prices fall back to placeholder text. */
  pricesReady: boolean;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /** ESI-detected owned stock (issue #181); omitted where no detection ran. Never written by itself. */
  detection?: OwnedStockDetection;
  /** Wraps each row in the shared item context menu; omitted where the caller has no menu to offer. */
  rowContextMenu?: (material: MaterialTableRow, tr: ReactElement) => ReactElement;
  /** Make-or-buy verdicts by material typeID. A material with no entry has no advice to show; omitted entirely where the caller can't price recipes. */
  makeOrBuy?: ReadonlyMap<number, MakeOrBuy>;
  /**
   * Whether a material can be produced here rather than bought — a blueprint
   * makes it. Deliberately independent of `makeOrBuy`, which needs live prices:
   * the run count and input quantities do not, so an unpriced row can still be
   * expanded. Omitted where the caller cannot look recipes up at all.
   */
  canBuildHere?: (typeID: number) => boolean;
  /** Turns one material's sub-build on or off. Omitted alongside `canBuildHere`. */
  onToggleBuildHere?: (typeID: number) => void;
  /**
   * Opens the "Build it" modal for a material being built here — the runs and
   * ingredient list this flat table no longer nests under the row. Omitted
   * where the caller has no modal to open, which simply drops the link.
   */
  onShowRecipe?: (typeID: number) => void;
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

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** The "build" glyph per method — a fourth method needs an entry here, never another ternary branch at a call site. */
const BUILD_GLYPH: Record<MakeMethod, typeof Icon.Build> = {
  manufacturing: Icon.Build,
  planetary: Icon.Planetary,
  reaction: Icon.Reaction,
};

/**
 * The prose behind a make-or-buy verdict: both unit prices, at ME, and — when
 * there is a remainder left to spend the difference on — what it's worth.
 * Shared by the advice-only marker below and the build-here toggle in the
 * materials column, so a row's tooltip and its control never say something
 * different about the same number.
 */
function makeOrBuyVerdict(advice: MakeOrBuy, t: Translate): string {
  return t('industry.makeOrBuy.suggestion', {
    verdict: t(`industry.makeOrBuy.${advice.verdict === 'build' ? 'actionBuild' : 'actionBuy'}`),
  });
}

/**
 * The reasoning under the verdict: the two unit prices the call turns on, and
 * what the gap is worth. Deliberately terse fragments rather than sentences —
 * this is read at a glance off a hover, where a paragraph is worse than a
 * comparison. One string per method, not one per method-and-verdict: the
 * verdict is the heading now, so the numbers no longer have to restate it.
 */
function makeOrBuyReason(advice: MakeOrBuy, remaining: number, t: Translate): string {
  const method =
    advice.method === 'manufacturing'
      ? 'Manufacturing'
      : advice.method === 'reaction'
        ? 'Reaction'
        : 'Planetary';
  const parts = [
    // Two decimals on the unit prices, unlike the whole-ISK columns beside
    // them: the verdict turns on the gap between these two numbers, and
    // rounding a 5.4-vs-5.6 call to "5 against 5" would make it unreadable.
    t(`industry.makeOrBuy.reason${method}`, {
      make: formatIsk(advice.makeUnitPrice, 2),
      buy: formatIsk(advice.buyUnitPrice, 2),
      me: advice.me,
    }),
  ];
  // Nothing is riding on a fully owned row: there is no remainder to spend
  // the difference on either way.
  if (remaining > 0 && advice.savings > 0) {
    parts.push(
      t('industry.makeOrBuy.savings', {
        amount: formatIsk(advice.savings),
        quantity: remaining.toLocaleString(),
      })
    );
  }
  return parts.join(' ');
}

/** Plain text for an accessible name, which cannot take a node. */
function makeOrBuyLabel(advice: MakeOrBuy, remaining: number, t: Translate): string {
  return `${makeOrBuyVerdict(advice, t)}. ${makeOrBuyReason(advice, remaining, t)}`;
}

/**
 * The advice as a tooltip bubble: the suggestion on its own line, bold, the
 * reasoning under it, and — where the trigger is the toggle rather than the
 * advisory glyph — what clicking will do.
 *
 * The suggestion leads because it is the only part a player needs every time
 * — "which of these two should I be doing" — and it used to be inferable only
 * from which of six phrasings the sentence happened to start with. Bold and
 * on its own line, it survives a glance; the prices below it are there for
 * when the answer is close enough to want checking.
 *
 * `action` is the row's *current* state inverted, never the suggestion: a row
 * already being built is clicked to go back to buying, whatever the advice
 * says. Keeping the two apart is the whole point of spelling the click out —
 * "Suggestion: Build It" over "Click to Buy" is a row that is already right,
 * which is exactly the case a single line of text used to render as a
 * contradiction.
 */
function MakeOrBuyTooltip({
  advice,
  remaining,
  action,
}: {
  advice: MakeOrBuy;
  remaining: number;
  /** What a click does. Omitted on the advice-only marker, which has nothing to click. */
  action?: 'build' | 'buy';
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      <span className="font-semibold">{makeOrBuyVerdict(advice, t)}</span>
      <span>{makeOrBuyReason(advice, remaining, t)}</span>
      {action && (
        <span>{t(`industry.makeOrBuy.${action === 'build' ? 'clickBuild' : 'clickBuy'}`)}</span>
      )}
    </span>
  );
}

/**
 * The row's make-or-buy verdict (CONTEXT.md round 29). Distinct glyphs
 * rather than one glyph in several tones: the verdict has to survive greyscale
 * and a screen reader (docs/DESIGN.md §7), so the shape carries it and the
 * label spells it out with both prices. Deliberately not a control — it has
 * nothing to click, so it takes no tab stop from the sourcing inputs on the
 * same row. (A material something here can build gets the interactive
 * version of this same glyph instead — see the materials column below.)
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
  const label = makeOrBuyLabel(advice, remaining, t);
  // Four glyphs, not two: "build" covers three different errands. A hammer
  // sends the player to an industry slot, a planet to a colony, a flask to a
  // refinery, and none of the three are interchangeable — nothing about the
  // manufacturing icon told a player which one a "build" row meant. The
  // tooltip already said so; the marker now says it at a glance. Planetary
  // keeps its own tone (`text-accent`, the app's blue) rather than sharing
  // manufacturing's green, so that one split reads without hovering; reaction
  // shares manufacturing's green — both are "run an industry job", and the
  // flask glyph alone (not a third colour) is what tells them apart, which is
  // the shape-carries-meaning half of docs/DESIGN.md §7, not the colour half.
  const planetary = building && advice.method === 'planetary';
  const Glyph = building ? BUILD_GLYPH[advice.method] : Icon.Buy;
  return (
    <Tooltip content={<MakeOrBuyTooltip advice={advice} remaining={remaining} />} openOnTap>
      <span
        role="img"
        aria-label={label}
        className={cx(
          'shrink-0',
          planetary ? 'text-accent' : building ? 'text-isk-pos' : 'text-text-dim'
        )}
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
  canBuildHere,
  onToggleBuildHere,
  onShowRecipe,
}: MaterialsTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<DataTableColumn<MaterialTableRow>[]>(
    () => [
      {
        id: 'material',
        header: t('industry.material'),
        render: (material) => {
          const advice = makeOrBuy?.get(material.typeID);
          const name = nameFor(material.typeID);
          const building = material.subBuilds.length > 0;
          // Offered on every row: a recipe input a build introduced is
          // exactly as buildable as the plan's own materials, which is what
          // lets a player keep drilling down as many levels as the recipe
          // tree actually has (docs/context/decisions).
          const toggle = canBuildHere?.(material.typeID) ? onToggleBuildHere : undefined;
          const actionLabel = t(building ? 'industry.buyInsteadFor' : 'industry.buildHereFor', {
            material: name,
          });
          // The price rationale is the hover tooltip, not the accessible
          // name: this control is icon-only (no visible text WCAG 2.5.3
          // could mismatch) and, unlike `MakeOrBuyMarker`'s span, a real tab
          // stop — keeping `label` to the short action is what keeps a
          // keyboard/screen-reader user from hearing a whole paragraph on
          // every Tab. `undefined` falls back to `label` (IconButton's own
          // rule), so a row with no advice still just shows the short action.
          // The bubble is the advice, not a restatement of the action: the
          // glyph already shows what clicking does, and `label` (the
          // accessible name) still says it in words. What a player cannot get
          // from either is which way they *should* go — so the verdict leads,
          // and it now shows on a row already being built too, where it used
          // to vanish and leave the bare action reading as a recommendation
          // to undo the build (`buyPricedLine`).
          const tooltip = advice ? (
            <MakeOrBuyTooltip
              advice={advice}
              remaining={material.remainingQuantity}
              action={building ? 'buy' : 'build'}
            />
          ) : undefined;
          return (
            // Flat — no indent, no depth. Every row is one material the plan
            // needs, whether the plan's blueprint asked for it or a build
            // deeper down did, and its quantity is the whole plan's
            // (`subBuildPlan`). Which job introduced a quantity is the "Build
            // it" modal's question, not a shape for this list to carry.
            <span className="inline-flex items-center gap-1.5">
              {/*
                One fixed-width slot, always rendered, sized to the toggle
                (`IconButton size="sm"` is `size-9 md:size-7`) — so every
                material name in the column starts at the same x whether its
                row carries the toggle button, the smaller advisory glyph, or
                nothing at all. Without it the three cases were three
                different left edges, and the leaf rows a build introduced sat
                visibly left of the plan's own materials above them: a ragged
                margin that read as an indent nobody meant.
              */}
              <span className="inline-flex w-9 shrink-0 items-center justify-center md:w-7">
                {toggle ? (
                  // The slot's occupant is the control itself on a material
                  // something here can produce — hammer to start building it,
                  // cart to go back to buying it, the same two glyphs and
                  // tones the advice-only marker uses for those two errands:
                  // the hammer is always `positive` (green) and the cart
                  // always the default dim, the same way regardless of which
                  // one this row currently shows — the tone rides with the
                  // glyph, not with the row's toggle state, so it stays a
                  // fixed "this action means build" / "this action means buy"
                  // cue rather than flipping meaning from row to row. There is
                  // nothing left to say in a second, separate icon once this
                  // one already reads as "switch this row to that": the plan's
                  // own context menu (`ItemContextMenu`'s "Add material
                  // components") reaches the identical toggle for a
                  // right-click or long-press.
                  <IconButton
                    size="sm"
                    variant="plain"
                    tone={building ? 'default' : 'positive'}
                    icon={
                      building ? (
                        <Icon.Buy size={Icon.ICON_SIZE.sm} />
                      ) : (
                        <Icon.Build size={Icon.ICON_SIZE.sm} />
                      )
                    }
                    label={actionLabel}
                    tooltip={tooltip}
                    onClick={() => toggle(material.typeID)}
                  />
                ) : (
                  advice && (
                    <MakeOrBuyMarker advice={advice} remaining={material.remainingQuantity} />
                  )
                )}
              </span>
              {name}
            </span>
          );
        },
      },
      {
        id: 'quantity',
        header: t('industry.quantity'),
        align: 'right',
        className: 'tabular-nums',
        // The requirement, and — once the player says they own some — what is
        // actually left to get. That subtraction is the number a shopping list
        // is really made of, and doing it in your head down a column of six
        // figures is exactly the arithmetic this table exists to save. Only
        // shown when it differs from the quantity above it.
        render: (material) => (
          <span className="flex flex-col items-start sm:items-end">
            <span>{material.quantity.toLocaleString()}</span>
            {material.ownedQuantity > 0 && (
              <span className="text-[0.6875rem] whitespace-nowrap text-text-dim">
                {t('industry.needAfterOwned', {
                  quantity: material.remainingQuantity.toLocaleString(),
                })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'owned',
        header: t('industry.ownedQuantity'),
        align: 'right',
        render: (material) => {
          // Unfiltered — the breakdown popover always shows every placement,
          // galaxy-wide, regardless of the plan's owned-stock scope.
          const stock = detection?.stockFor(material.typeID);
          const owned = sourcing?.[material.typeID]?.ownedQuantity;
          // The offer respects the plan's owned-stock scope (issue #454): a
          // row already holding what the action would write has nothing left
          // to apply — compared against the clamped suggestion, not the raw
          // detected total, or the affordance would linger on every row whose
          // requirement is smaller than the stock behind it.
          const scopedQuantity = detection?.scopedQuantityFor(material.typeID) ?? 0;
          const suggestion = stock ? suggestedOwnedQuantity(scopedQuantity, material.quantity) : 0;
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
                  scopedQuantity={scopedQuantity}
                  detection={detection}
                  materialName={nameFor(material.typeID)}
                  suggestion={suggestion}
                  // Scoping (issue #454) can leave a material with real
                  // galaxy-wide stock but nothing inside the plan's selected
                  // locations — `suggestion` is then 0, and "use 0" is not a
                  // real offer to make regardless of what the row holds.
                  canApply={owned !== suggestion && suggestion > 0}
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
          const name = nameFor(material.typeID);
          // A material being produced has no purchase price at all — it is
          // not bought at one — so this cell carries the row's *state* and the
          // way into the job behind it instead: "Built", as the link that
          // opens the recipe. That link used to sit after the material name
          // while a rolled-up unit cost sat here, which spent two cells and a
          // wrapped line per built row to say one thing. The unit cost itself
          // is in the modal, next to the runs and inputs that explain it.
          if (material.subBuilds.length > 0) {
            return (
              <span className="flex flex-col items-start gap-0.5 sm:items-end">
                {onShowRecipe ? (
                  <button
                    type="button"
                    // Named for its own row: a column of identical "Built"
                    // links tells a screen-reader user nothing about which
                    // material they are on. The visible word leads the
                    // accessible name rather than being replaced by it.
                    aria-label={t('industry.buildRecipe.actionFor', { material: name })}
                    className="text-[0.6875rem] whitespace-nowrap text-accent uppercase hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={() => onShowRecipe(material.typeID)}
                  >
                    {t('industry.priceSourceBuilt')}
                  </button>
                ) : (
                  <span className="text-[0.6875rem] text-text-dim">
                    {t('industry.priceSourceBuilt')}
                  </span>
                )}
                {/* Kept even though the numbers went: "something under this
                    has no price" is a warning about the plan's totals, not a
                    price, and hiding it would quietly understate the cost. */}
                {material.unpriced && (
                  <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
                )}
              </span>
            );
          }
          const state = materialRowState(material, sourcing, pricesReady);
          const overridden = state.priceSource === 'override';
          // Nothing to price a fully owned material at, so a row with no
          // number is not a problem worth a warning — only a real remainder
          // is.
          //
          // No tag at all on a plain hub price: that is what every row is
          // unless something says otherwise, so "Hub" repeated down a table
          // this long was a word per row that ruled nothing out. The tags
          // that survive are the exceptions — a price the player typed, a row
          // that costs nothing because they own it, and a row the market has
          // no number for.
          const tag = overridden
            ? { text: t('industry.priceSourceOverride'), tone: 'text-accent' }
            : state.unitPrice !== null
              ? null
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
            <span className="flex flex-col items-start gap-0.5 sm:items-end">
              <SourcingInput
                value={state.unitPrice ?? undefined}
                label={t('industry.priceFor', { material: name })}
                inputMode="decimal"
                widthClassName="w-24"
                parse={parsePrice}
                onCommit={(overridePrice) => onSourcingChange(material.typeID, { overridePrice })}
              />
              {/* Under the field, not beside it: the source tag is a caption
                  on the number, and beside it the column outgrew the table.
                  The whole line is dropped on an untagged row rather than left
                  as an empty one, so a plain hub-priced row is a single line
                  tall. */}
              {(tag || overridden) && (
                <span className="inline-flex items-center gap-1">
                  {tag && <span className={cx('text-[0.6875rem]', tag.tone)}>{tag.text}</span>}
                  {overridden && (
                    <IconButton
                      size="sm"
                      variant="plain"
                      icon={<Icon.Revert size={Icon.ICON_SIZE.sm} />}
                      label={t('industry.resetPriceFor', { material: name })}
                      onClick={() =>
                        onSourcingChange(material.typeID, { overridePrice: undefined })
                      }
                    />
                  )}
                </span>
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
          // A built row puts no purchase total here: its ingredients have
          // rows of their own in this flat list, so a rolled-up figure would
          // be counted twice by anyone reading down the column. Runs is the
          // one number worth a glance — the job fee, the per-run yield and
          // the spare units are all in the "Built" modal beside it, which is
          // where a player goes when the runs count raises a question.
          if (material.subBuilds.length > 0) {
            const runs = buildRecipe(material)?.runs ?? 0;
            return <span>{t('industry.subBuildRuns', { runs: runs.toLocaleString() })}</span>;
          }
          // The total, and nothing else. What it is made of — units owned,
          // units still to buy, the price they are bought at — is already in
          // the three cells to the left of it, and restating it here put a
          // second line under every part-owned row in a table long enough
          // that the repeat cost more than it explained. "Need:" under the
          // quantity is the one piece of that arithmetic worth keeping,
          // because it is the only number not already on the row.
          const state = materialRowState(material, sourcing, pricesReady);
          return (
            <span>{state.lineCost === null ? t('common.unknown') : formatIsk(state.lineCost)}</span>
          );
        },
      },
    ],
    [
      t,
      nameFor,
      sourcing,
      pricesReady,
      onSourcingChange,
      detection,
      makeOrBuy,
      canBuildHere,
      onToggleBuildHere,
      onShowRecipe,
    ]
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
