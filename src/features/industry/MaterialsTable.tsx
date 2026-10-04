import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Caret,
  DataTable,
  IconButton,
  IskAmount,
  NativeSelect,
  TextInput,
  Toast,
  Tooltip,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { UseTableExport } from '@/components/ui/useTableExport';
import type { MakeMethod, MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { rowVolume } from '@/engine/industry/materialVolume';
import type { MaterialSourcing, MaterialSourcingMap } from '@/engine/industry/types';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { maskNumber, unmaskNumber } from '@/lib/numberMask';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatVolume } from './format';
import { materialRowState } from './materialRow';
import {
  clearEveryOwned,
  ownedStockOffer,
  takeEveryOffer,
  undoOwnedStockChanges,
  type OwnedStockChange,
} from '@/engine/industry/ownedStockOffer';
import { OwnedStockHint } from './OwnedStockHint';
import type { OwnedStockDetection } from './ownedStockDetection';
import { buildRecipe, type MaterialTableRow } from './subBuildPlan';
import { SkillGateMarker } from './SkillGateMarker';
import { MATERIAL_ERRANDS, errandSubtotal, type MaterialErrand } from './materialErrands';
import {
  INITIAL_EDIT_SESSION,
  editSessionGroups,
  shownSections,
  reduceEditSession,
  type SessionToastMessage,
} from './materialsEditSession';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';

interface MaterialsTableProps {
  /** Engine cost lines — already resolved against the plan's sourcing overrides and hub prices. */
  materials: readonly MaterialTableRow[];
  nameFor: (typeID: number) => string;
  /** Per-unit m3 volume for a typeID, baked SDE data; null when unresolvable (issue #874). */
  volumeFor: (typeID: number) => number | null;
  /** The plan's raw overrides. Needed to tell an override apart from a hub price of the same value. */
  sourcing: MaterialSourcingMap | undefined;
  /** False when the market snapshot couldn't be fetched — hub prices fall back to placeholder text. */
  pricesReady: boolean;
  onSourcingChange: (typeID: number, patch: MaterialSourcing) => void;
  /**
   * Writes several rows' owned quantities as one change — "Use all", "Use
   * none" and every Undo. Omitted, each goes through `onSourcingChange`.
   */
  onOwnedStockChange?: (changes: readonly OwnedStockChange[]) => void;
  /** "Use all" / "Use none" for controls the caller renders outside the table. */
  ref?: Ref<MaterialsTableHandle>;
  /** ESI-detected owned stock (issue #181); omitted where no detection ran. Never written by itself. */
  detection?: OwnedStockDetection;
  /** Wraps each row in the shared item context menu; omitted where the caller has no menu to offer. */
  rowContextMenu?: (material: MaterialTableRow, tr: ReactElement) => ReactElement;
  /**
   * Visible "More actions" button for the row (WCAG 2.1.1, issue #1498) —
   * the same item menu `rowContextMenu` opens on right-click/long-press,
   * reachable by keyboard. Rendered in a trailing column; omitted where the
   * caller has no menu to offer.
   */
  rowActions?: (material: MaterialTableRow) => ReactElement;
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
   * ingredient list the Building row's Recipe link opens. Omitted
   * where the caller has no modal to open, which simply drops the link.
   */
  onShowRecipe?: (typeID: number) => void;
  /**
   * Opens the picker/override modal (issue #839) for a Blueprint Acquisition
   * row — present alongside `material.acquisitionTier` exactly where that
   * caption renders. Omitted where the caller has no modal to open, which
   * simply drops the trigger.
   */
  onOpenAcquisitionPicker?: (typeID: number) => void;
  /**
   * Skill-gate verdicts by material typeID, for a sub-build row — a job the
   * plan chose, not the pilot. Only `gated: true` renders anything; omitted
   * entirely drops the marker. `characterNameFor` names the closest character.
   */
  skillGates?: ReadonlyMap<number, SkillGateVerdict>;
  characterNameFor?: (characterId: number) => string;
  /** `useTableExport(...).tableProps` — makes the table exportable from its row menus. */
  exportProps?: UseTableExport<MaterialTableRow>['tableProps'];
}

/**
 * "Use all" / "Use none" over every row on the table, answered by the table's
 * own toast so a row edit and a bulk one share one Undo (issue #2548).
 */
export interface MaterialsTableHandle {
  fillAll: () => void;
  clearAll: () => void;
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
  /** Marks the field invalid and ties it to `describedBy`'s error text (issue #1488). */
  invalid?: boolean;
  describedBy?: string;
  /** The player's own number (a typed price, a claimed owned count): shown in the accent, the app's "you set this" cue. */
  mine?: boolean;
  /** Takes focus on mount — a field the player has just asked to edit. */
  autoFocus?: boolean;
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
  invalid,
  describedBy,
  mine = false,
  autoFocus,
  parse,
  onCommit,
}: SourcingInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Leaving the page mid-edit (Back, a shortcut, a row scrolled out of a
  // virtualized list) unmounts the field without a blur, which would drop the
  // edit. The ref mirrors the uncommitted draft synchronously — cleared in the
  // same handler that commits on blur, so an unmount right after a blur never
  // commits twice — and the latest props, read only at unmount.
  const pendingRef = useRef<string | null>(null);
  const latestRef = useRef({ value, parse, onCommit });
  useEffect(() => {
    latestRef.current = { value, parse, onCommit };
  });
  useEffect(
    () => () => {
      const pending = pendingRef.current;
      if (pending === null) return;
      const { value: current, parse: parseLatest, onCommit: commit } = latestRef.current;
      const next = parseLatest(pending);
      // Only a real number: an emptied or unparseable box on the way out is
      // more likely abandoned than a deliberate clear.
      if (next !== undefined && next !== current) commit(next);
    },
    []
  );
  return (
    <TextInput
      id={id}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      size="sm"
      type="text"
      inputMode={inputMode}
      aria-label={label}
      placeholder={placeholder}
      // Digits sit right in the table, where they line up with the numeric
      // columns around them; in the stacked card there is no column to line
      // up with, and right-aligned digits would float a width away from the
      // label that names them.
      // `!`: the field's base class sets `text-text`, and two colour utilities
      // on one element resolve by stylesheet order, not by class order.
      className={cx(widthClassName, 'text-left tabular-nums sm:text-right', mine && 'text-accent!')}
      autoFocus={autoFocus}
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
      onChange={(event) => {
        pendingRef.current = event.target.value;
        setDraft(event.target.value);
      }}
      onBlur={(event) => {
        const next = parse(event.target.value);
        pendingRef.current = null;
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
  // Already inside the build price above — named so a "buy" verdict on a
  // cheap recipe reads as the blueprint's doing, not a pricing error.
  if (advice.blueprintCost > 0) {
    parts.push(t('industry.makeOrBuy.blueprintCost', { amount: formatIsk(advice.blueprintCost) }));
  }
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
  /** Omitted where there is no verdict — an unpriced recipe input, or nothing that produces this. */
  advice?: MakeOrBuy;
  remaining: number;
  /** What a click does. Omitted on the advice-only marker, which has nothing to click. */
  action?: 'build' | 'buy';
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      {advice && (
        <>
          <span className="font-semibold">{makeOrBuyVerdict(advice, t)}</span>
          <span>{makeOrBuyReason(advice, remaining, t)}</span>
        </>
      )}
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
function MakeOrBuyMarker({
  advice,
  remaining,
  badge = false,
}: {
  advice: MakeOrBuy;
  remaining: number;
  /**
   * A short word in a pill ("PI", "Buy") instead of the glyph — the phone
   * card's form, where there is no hover to explain a bare planet or cart.
   */
  badge?: boolean;
}) {
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
  const tone = planetary ? 'text-accent' : building ? 'text-isk-pos' : 'text-text-dim';
  return (
    <Tooltip content={<MakeOrBuyTooltip advice={advice} remaining={remaining} />} openOnTap>
      <span
        role="img"
        aria-label={label}
        className={cx(
          'shrink-0',
          tone,
          badge &&
            'rounded-xs border border-current px-1 text-[0.5625rem] leading-4 font-bold tracking-widest uppercase'
        )}
      >
        {badge ? (
          t(
            `industry.errands.badge.${building ? (advice.method === 'manufacturing' ? 'build' : advice.method) : 'buy'}`
          )
        ) : (
          <Glyph size={Icon.ICON_SIZE.sm} />
        )}
      </span>
    </Tooltip>
  );
}

/** `xl` (78.125rem, src/styles/index.css) up to `2xl`: where BuildPlanDetail puts Costs & revenue beside Materials. */
const BESIDE_COSTS_QUERY = '(min-width: 78.125rem) and (max-width: 95.999rem)';

/** The phone list's own sort — the header sort buttons are a table's, and a phone gets no table. */
type PhoneSort = 'plan' | 'total' | 'toBuy' | 'name';
const PHONE_SORTS: readonly PhoneSort[] = ['plan', 'total', 'toBuy', 'name'];

/** A material being built here rather than bought. */
function isBuilt(material: MaterialTableRow): boolean {
  return material.subBuilds.length > 0;
}

/** A number in the phone ledger, right-aligned under its section's column header. */
const LEDGER_VALUE = 'flex min-w-0 justify-end text-sm tabular-nums';

/** How long the "moved to …" confirmation stays up — the same beat every other Undo toast in the app keeps. */
const TOAST_MS = 8000;

/**
 * Each section's colour, carried by its heading. Never the only cue
 * (docs/DESIGN.md §7): every heading also names its section in words and,
 * where one exists, carries the errand's own glyph.
 */
const ERRAND_TONE: Record<MaterialErrand, string> = {
  toBuy: 'text-text',
  building: 'text-success',
  blueprint: 'text-blueprint-copy',
  have: 'text-text-dim',
};

const ERRAND_GLYPH: Record<MaterialErrand, typeof Icon.Build | null> = {
  toBuy: Icon.Buy,
  building: Icon.Build,
  blueprint: Icon.Blueprint,
  have: null,
};

const ERRAND_LABEL_KEY: Record<MaterialErrand, string> = {
  toBuy: 'industry.errands.toBuy',
  building: 'industry.errands.building',
  blueprint: 'industry.errands.blueprint',
  have: 'industry.errands.have',
};

type LinkTone = 'accent' | 'build' | 'blueprint' | 'quiet';

/**
 * A row's text action — Recipe, Build instead, Buy instead, Change tier. Text
 * rather than a bare glyph: the hammer/cart button this replaces said what a
 * click did only on hover, and needed a reserved slot beside every name to
 * line the names up, which read as an indent on every row without one.
 */
function linkClassName(tone: LinkTone): string {
  return cx(
    'inline-flex min-h-11 items-center gap-1 rounded-xs text-[0.6875rem] font-semibold whitespace-nowrap underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-0',
    tone === 'accent' && 'text-accent decoration-accent-dim',
    tone === 'build' && 'text-success decoration-success/50',
    tone === 'blueprint' && 'text-blueprint-copy decoration-blueprint-copy/50',
    tone === 'quiet' && 'text-text-dim decoration-line-bright hover:text-text'
  );
}

/**
 * Switches one material between buying and building it here. Shown on every
 * material something here can produce, the way the hammer was: green, with
 * what it saves, when the make-or-buy advice says building is cheaper; quiet
 * otherwise, so it never reads as a recommendation it isn't.
 *
 * The savings sit beside the button rather than inside it, so the button's
 * visible text stays a prefix of its accessible name (WCAG 2.5.3).
 */
function SwapButton({
  material,
  name,
  kind,
  advice,
  onClick,
}: {
  material: MaterialTableRow;
  name: string;
  /** What a click does: start building it, or go back to buying it. */
  kind: 'build' | 'buy';
  advice: MakeOrBuy | undefined;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const savings =
    kind === 'build' &&
    advice?.verdict === 'build' &&
    advice.savings > 0 &&
    material.remainingQuantity > 0
      ? advice.savings
      : null;
  const Glyph = kind === 'build' ? BUILD_GLYPH[advice?.method ?? 'manufacturing'] : Icon.Buy;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <Tooltip
        content={
          <MakeOrBuyTooltip advice={advice} remaining={material.remainingQuantity} action={kind} />
        }
      >
        <button
          type="button"
          data-swap-for={material.typeID}
          data-swap-kind={kind}
          aria-label={t(kind === 'build' ? 'industry.buildHereFor' : 'industry.buyInsteadFor', {
            material: name,
          })}
          className={linkClassName(savings !== null ? 'build' : 'quiet')}
          onClick={onClick}
        >
          <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t(kind === 'build' ? 'industry.errands.buildInstead' : 'industry.errands.buyInstead')}
        </button>
      </Tooltip>
      {savings !== null && (
        <span className="text-[0.6875rem] text-success tabular-nums">
          {t('industry.errands.saves', { amount: formatIsk(savings) })}
        </span>
      )}
    </span>
  );
}

/** A plain "—" for a cell with nothing to say on this kind of row. */
function NotApplicable() {
  return (
    <span className="text-text-faint" aria-hidden="true">
      —
    </span>
  );
}

/**
 * Materials, as a shopping list: one section per errand — To buy, Building,
 * Blueprint, Already have (`materialErrands.ts`) — each headed by its colour,
 * glyph, count and what it still costs.
 *
 * At `sm` and up every section is its own table over one shared column set, so
 * Need − Have = To buy reads left to right and the columns line up from one
 * section to the next. Below `sm` the same sections become a list whose rows
 * spell that subtraction out on one line, with the Have field in it; the
 * labelled card the shared DataTable stacks into put six equal-weight labels
 * on every material.
 *
 * A row changes section when the player's edit changes its errand — owning
 * all of it, or switching it to be built. Two rules keep that from being
 * disorienting:
 *
 * - A section holds its rows in place while focus is inside it, so a Have
 *   commit (which lands on blur, as the player tabs on) never unmounts the
 *   field focus is moving to. Rows move once focus leaves the section.
 * - Every move the player caused is confirmed by a toast with Undo — one
 *   toast and one Undo shared with "Use all" / "Use none" (`fillAll` /
 *   `clearAll` on the `ref`).
 *
 * Both rules, and which toast an edit earns, are the edit session's
 * (`materialsEditSession.ts`); this component renders what it decides and
 * makes the writes.
 *
 * Price is one field, not a market column beside an override column: the hub
 * price is its value and typing over it is the override, with a revert
 * control beside a changed field. `SourcingInput`'s commit rule keeps that
 * safe — a field blurred as it was found writes nothing.
 */
export function MaterialsTable({
  materials,
  nameFor,
  volumeFor,
  sourcing,
  pricesReady,
  onSourcingChange,
  onOwnedStockChange,
  ref,
  detection,
  rowContextMenu,
  rowActions,
  makeOrBuy,
  canBuildHere,
  onToggleBuildHere,
  onShowRecipe,
  onOpenAcquisitionPicker,
  skillGates,
  characterNameFor,
  exportProps,
}: MaterialsTableProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const besideCosts = useMediaQuery(BESIDE_COSTS_QUERY);
  const idPrefix = useId();

  const [session, dispatch] = useReducer(reduceEditSession, INITIAL_EDIT_SESSION);
  const [haveOpen, setHaveOpen] = useState(false);
  const [phoneSort, setPhoneSort] = useState<PhoneSort>('plan');
  // The phone card whose price field is open; every other card shows its
  // price as text.
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  // Same for the ledger's Have number.
  const [editingHave, setEditingHave] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { held } = session;
  const groups = useMemo(() => editSessionGroups(held, materials), [held, materials]);
  const shown = useMemo(() => shownSections(groups), [groups]);
  const ownedFor = useCallback((typeID: number) => sourcing?.[typeID]?.ownedQuantity, [sourcing]);

  // Owned-quantity writes the session makes (bulk, and every Undo) go out as
  // one batch where the caller takes one.
  function writeOwned(changes: readonly OwnedStockChange[]) {
    if (onOwnedStockChange) onOwnedStockChange(changes);
    else for (const { typeID, to } of changes) onSourcingChange(typeID, { ownedQuantity: to });
  }

  // The session confirms the moves an edit caused once they are actually
  // shown, so it watches every render that could have moved a row.
  useEffect(() => {
    dispatch({ type: 'rendered', shown, ownedFor });
  }, [shown, ownedFor]);

  const toast = session.toast;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dispatch({ type: 'toastExpired' }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Runs after every render: the toggled row only reaches its new section
  // once the plan write lands, which can be several renders later.
  useEffect(() => {
    const target = session.focusAfterToggle;
    if (!target) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-swap-for="${target.typeID}"][data-swap-kind="${target.kind}"]`
    );
    if (el) {
      dispatch({ type: 'focusSettled' });
      el.focus();
    } else if (shown.get(target.typeID) !== target.from) {
      // It moved somewhere its control isn't mounted — the folded Already
      // have section. Give up rather than steal focus whenever that opens.
      dispatch({ type: 'focusSettled' });
    }
  });

  function applyBulk(kind: 'all' | 'none', changes: readonly OwnedStockChange[]) {
    if (changes.length > 0) writeOwned(changes);
    dispatch({ type: 'bulkApplied', kind, changes });
  }

  useImperativeHandle(ref, () => ({
    fillAll: () =>
      applyBulk(
        'all',
        takeEveryOffer(materials, ownedFor, detection?.scopedQuantityFor ?? (() => 0))
      ),
    clearAll: () => applyBulk('none', clearEveryOwned(materials, ownedFor)),
  }));

  // Built per render, so Undo writes through the latest props: a write made
  // while the toast was up isn't dropped by a stale callback.
  function undo() {
    const patch = session.toast?.undo;
    if (patch) {
      if (patch.kind === 'owned') writeOwned(undoOwnedStockChanges(patch.changes));
      else onToggleBuildHere?.(patch.typeID);
    }
    dispatch({ type: 'undone' });
  }

  const sectionLabel = useCallback((errand: MaterialErrand) => t(ERRAND_LABEL_KEY[errand]), [t]);

  function toastText(message: SessionToastMessage): string {
    switch (message.kind) {
      case 'moved':
        return t('industry.errands.moved', {
          material: nameFor(message.typeID),
          section: sectionLabel(message.to),
        });
      case 'movedMany':
        return t('industry.errands.movedMany', { count: message.count });
      case 'useAllDone':
      case 'useNoneDone':
        return t(`industry.${message.kind}`, { count: message.count });
      case 'useAllNothing':
      case 'useNoneNothing':
        return t(`industry.${message.kind}`);
    }
  }

  const commitOwned = useCallback(
    (typeID: number, ownedQuantity: number | undefined) => {
      dispatch({
        type: 'haveCommitted',
        typeID,
        before: sourcing?.[typeID]?.ownedQuantity,
        after: ownedQuantity,
      });
      onSourcingChange(typeID, { ownedQuantity });
    },
    [sourcing, onSourcingChange]
  );

  const toggleBuild = useCallback(
    (material: MaterialTableRow) => {
      if (!onToggleBuildHere) return;
      dispatch({
        type: 'buildToggled',
        typeID: material.typeID,
        building: material.subBuilds.length > 0,
      });
      onToggleBuildHere(material.typeID);
    },
    [onToggleBuildHere]
  );

  /** The make-or-buy advice for a row, and whether a Build/Buy instead switch is offered on it. */
  function buildChoice(material: MaterialTableRow) {
    return {
      advice: makeOrBuy?.get(material.typeID),
      toggleable: canBuildHere?.(material.typeID) === true && onToggleBuildHere !== undefined,
    };
  }

  /** What building saves over buying, when the advice says building is cheaper. */
  function buildSavings(material: MaterialTableRow): number | null {
    const { advice } = buildChoice(material);
    return advice?.verdict === 'build' && advice.savings > 0 && material.remainingQuantity > 0
      ? advice.savings
      : null;
  }

  /** The name, any advice/skill marker, and — unless the caller places it itself — the row's text action. */
  function renderName(material: MaterialTableRow, withAction: boolean, badge = false) {
    const name = nameFor(material.typeID);
    const { advice, toggleable } = buildChoice(material);
    const skillGate = isBuilt(material) ? skillGates?.get(material.typeID) : undefined;
    return (
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MarketItemLink typeId={material.typeID}>{name}</MarketItemLink>
          {/* Advice with nothing to act on here — a material something
              else produces. Inline after the name, not in a reserved slot
              before it, so every name starts at the same edge. */}
          {!toggleable && !material.acquisitionTier && advice && (
            <MakeOrBuyMarker advice={advice} remaining={material.remainingQuantity} badge={badge} />
          )}
          {skillGate?.gated && characterNameFor && (
            <SkillGateMarker
              verdict={skillGate}
              nameForSkill={nameFor}
              nameForCharacter={characterNameFor}
            />
          )}
        </span>
        {withAction && renderAction(material)}
      </span>
    );
  }

  /** Recipe · Buy instead, Build instead, or Change tier — whichever this row's errand offers. */
  function renderAction(material: MaterialTableRow, withSavings = true) {
    const name = nameFor(material.typeID);
    if (material.acquisitionTier) {
      return onOpenAcquisitionPicker ? (
        <button
          type="button"
          aria-label={t('industry.errands.changeTierFor', { material: name })}
          className={linkClassName('blueprint')}
          onClick={() => onOpenAcquisitionPicker(material.typeID)}
        >
          {t('industry.errands.changeTier')}
        </button>
      ) : null;
    }
    const { advice, toggleable } = buildChoice(material);
    if (isBuilt(material)) {
      const savings = withSavings ? buildSavings(material) : null;
      if (!onShowRecipe && !toggleable && savings === null) return null;
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {/* What this build is worth, in the same green its heading uses. */}
          {savings !== null && (
            <span className="text-[0.6875rem] text-success tabular-nums">
              {t('industry.errands.savesVsBuying', { amount: formatIsk(savings) })}
            </span>
          )}
          {onShowRecipe && (
            <button
              type="button"
              aria-label={t('industry.errands.recipeFor', { material: name })}
              className={linkClassName('accent')}
              onClick={() => onShowRecipe(material.typeID)}
            >
              {t('industry.errands.recipe')}
            </button>
          )}
          {toggleable && (
            <SwapButton
              material={material}
              name={name}
              kind="buy"
              advice={advice}
              onClick={() => toggleBuild(material)}
            />
          )}
        </span>
      );
    }
    return toggleable ? (
      <SwapButton
        material={material}
        name={name}
        kind="build"
        advice={advice}
        onClick={() => toggleBuild(material)}
      />
    ) : null;
  }

  /** The Have field, with the detected-stock offer under it. A blueprint row only ever says Owned. */
  /**
   * The detected-stock offer ("Use assets") for a row, or nothing. Its own
   * piece so the phone row can put it on the line under the subtraction
   * instead of inside it, where it split Need − Have = To buy over two lines.
   */
  function renderOwnedHint(material: MaterialTableRow) {
    if (!detection) return null;
    // Whether the row offers anything, and what, is the owned-stock offer's
    // call (`ownedStockOffer.ts`) — the same rule "Use all" applies. It
    // respects the plan's owned-stock scope (issue #454).
    const scopedQuantity = detection.scopedQuantityFor(material.typeID);
    const offer = ownedStockOffer(
      material,
      scopedQuantity,
      sourcing?.[material.typeID]?.ownedQuantity
    );
    if (offer === null) return null;
    return (
      <OwnedStockHint
        scopedQuantity={scopedQuantity}
        detection={detection}
        materialName={nameFor(material.typeID)}
        suggestion={offer}
        onApply={() => commitOwned(material.typeID, offer)}
      />
    );
  }

  function renderHave(
    material: MaterialTableRow,
    withHint = true,
    fill = false,
    autoFocus = false
  ) {
    // Blueprint Acquisition (issue #838): ownership comes entirely from the
    // Character's real BPO/BPC, never from a typed quantity — an editable
    // field here would silently do nothing.
    if (material.acquisitionTier) {
      return material.remainingQuantity === 0 ? (
        <span className="text-[0.6875rem] text-text-dim">
          {t('industry.blueprintAcquisitionOwned')}
        </span>
      ) : (
        <NotApplicable />
      );
    }
    const owned = sourcing?.[material.typeID]?.ownedQuantity;
    return (
      <span className={cx('flex flex-col items-start gap-0.5 sm:items-end', fill && 'w-full')}>
        <SourcingInput
          value={owned}
          label={t('industry.errands.haveFor', { material: nameFor(material.typeID) })}
          inputMode="numeric"
          widthClassName={fill ? 'w-full' : 'w-20'}
          autoFocus={autoFocus}
          placeholder="0"
          mine={owned !== undefined && owned > 0}
          parse={parseCount}
          onCommit={(ownedQuantity) => commitOwned(material.typeID, ownedQuantity)}
        />
        {withHint && renderOwnedHint(material)}
      </span>
    );
  }

  /**
   * The price field and what kind of price it holds. A built row has no
   * purchase price at all. `inline` is the phone row's form: "@ [field]" on
   * one line with its tag beside it rather than stacked under it, and no tier
   * caption, which the phone row prints beside Change tier instead.
   */
  function renderPrice(material: MaterialTableRow, inline = false, autoFocus = false) {
    const name = nameFor(material.typeID);
    if (material.subBuilds.length > 0) {
      // "Something under this has no price" is a warning about the plan's
      // totals, not a price — hiding it would quietly understate the cost.
      return material.unpriced ? (
        <span className="text-[0.6875rem] text-warning">{t('industry.unpriced')}</span>
      ) : (
        <NotApplicable />
      );
    }
    const state = materialRowState(material, sourcing, pricesReady);
    const overridden = state.priceSource === 'override';
    const unpriced = !overridden && state.unitPrice === null && !state.fullyOwned;
    // No tag on a plain hub price — that is what every row is unless
    // something says otherwise.
    const tag = overridden
      ? { text: t('industry.priceSourceOverride'), tone: 'text-accent' }
      : state.unitPrice !== null
        ? null
        : state.fullyOwned
          ? { text: t('industry.priceSourceOwned'), tone: 'text-text-dim' }
          : { text: t('industry.unpriced'), tone: 'text-warning' };
    // Only once prices have landed: before then every row reads as unpriced.
    const onFindBlueprint =
      unpriced && pricesReady && material.acquisitionTier && onOpenAcquisitionPicker
        ? () => onOpenAcquisitionPicker(material.typeID)
        : undefined;
    return (
      <span
        className={
          inline
            ? 'inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5'
            : 'flex flex-col items-start gap-0.5 sm:items-end'
        }
      >
        {inline && (
          <span className="text-text-dim" aria-hidden="true">
            {t('industry.errands.at')}
          </span>
        )}
        <SourcingInput
          value={state.unitPrice ?? undefined}
          label={t('industry.priceFor', { material: name })}
          inputMode="decimal"
          widthClassName="w-24"
          mine={overridden}
          autoFocus={autoFocus}
          parse={parsePrice}
          onCommit={(overridePrice) => onSourcingChange(material.typeID, { overridePrice })}
        />
        {inline && <span className="text-text-dim">{t('industry.errands.isk')}</span>}
        {(tag || overridden) && (
          <span className="inline-flex items-center gap-1">
            {onFindBlueprint ? (
              <button
                type="button"
                aria-label={t('industry.blueprintAcquisitionFindFor', { material: name })}
                className={textActionClassName('whitespace-nowrap')}
                onClick={onFindBlueprint}
              >
                {t('industry.blueprintAcquisitionFind')}
              </button>
            ) : (
              tag && <span className={cx('text-[0.6875rem]', tag.tone)}>{tag.text}</span>
            )}
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
        )}
        {!inline && material.acquisitionTier && (
          <span className="text-[0.6875rem] text-text-dim">
            {t('industry.blueprintAcquisitionTier', material.acquisitionTier)}
          </span>
        )}
      </span>
    );
  }

  /** The line total — or, for a built row, its runs: its inputs carry the cost in their own rows. */
  function renderTotal(material: MaterialTableRow) {
    if (material.subBuilds.length > 0) {
      const runs = buildRecipe(material)?.runs ?? 0;
      return <span>{t('industry.subBuildRuns', { runs: runs.toLocaleString() })}</span>;
    }
    const state = materialRowState(material, sourcing, pricesReady);
    return (
      <span>
        {state.lineCost === null ? (
          t('common.unknown')
        ) : (
          // Long press, not tap: the row's own tap belongs to its context menu.
          <IskAmount value={state.lineCost} revealOn="longPress" decimals={0} />
        )}
      </span>
    );
  }

  // Rebuilt every render, deliberately: the cell renderers close over the
  // hold and toggle machinery above, and a stale closure there would commit
  // an edit through an outdated sourcing map.
  const columns: DataTableColumn<MaterialTableRow>[] = [
    {
      id: 'material',
      header: t('industry.material'),
      sortValue: (material) => nameFor(material.typeID),
      render: (material) => renderName(material, true),
    },
    {
      id: 'quantity',
      header: t('industry.errands.need'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-20',
      sortValue: (material) => material.quantity,
      render: (material) => <span>{material.quantity.toLocaleString()}</span>,
    },
    {
      id: 'owned',
      header: t('industry.errands.haveColumn'),
      align: 'right',
      // The field's own width plus the compact cell padding, and no more.
      headerCellClassName: 'w-24',
      render: renderHave,
    },
    {
      id: 'toBuy',
      header: t('industry.errands.toBuyColumn'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-20',
      // A built row is not bought at all, so it sinks rather than sorting as zero.
      sortValue: (material) =>
        material.subBuilds.length > 0 ? undefined : material.remainingQuantity,
      render: (material) =>
        material.subBuilds.length > 0 ? (
          <NotApplicable />
        ) : (
          <span>{material.remainingQuantity.toLocaleString()}</span>
        ),
    },
    {
      id: 'price',
      header: t('industry.price'),
      align: 'right',
      headerCellClassName: 'w-28',
      render: renderPrice,
    },
    {
      id: 'volume',
      header: t('industry.volume'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-24',
      sortValue: (material) =>
        material.subBuilds.length > 0 ? undefined : (rowVolume(material, volumeFor) ?? undefined),
      render: (material) => {
        // A built row's own volume is never hauled at this typeID — its
        // inputs carry it in their own rows.
        if (material.subBuilds.length > 0) return <NotApplicable />;
        const volume = rowVolume(material, volumeFor);
        return <span>{volume === null ? t('common.unknown') : formatVolume(volume)}</span>;
      },
    },
    {
      id: 'lineTotal',
      header: t('industry.errands.total'),
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'w-24',
      sortValue: (material) =>
        material.subBuilds.length > 0
          ? undefined
          : (materialRowState(material, sourcing, pricesReady).lineCost ?? undefined),
      render: renderTotal,
    },
    ...(rowActions
      ? [
          {
            id: 'actions',
            header: '',
            align: 'right',
            cardActions: true,
            headerCellClassName: 'w-11',
            render: (material: MaterialTableRow) => rowActions(material),
          } satisfies DataTableColumn<MaterialTableRow>,
        ]
      : []),
  ];

  // Dropped only where Materials shares its row with Costs & revenue (`xl`
  // up to `2xl`): that panel already totals the plan's volume, and the
  // table has to fit beside it without a sideways scroll (#2165).
  const tableColumns = besideCosts ? columns.filter((column) => column.id !== 'volume') : columns;

  function holdSection(errand: MaterialErrand) {
    dispatch({ type: 'focusEntered', errand, typeIDs: groups[errand].map((row) => row.typeID) });
  }

  function releaseSection(event: FocusEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    dispatch({ type: 'focusLeft' });
  }

  function renderHeading(
    errand: MaterialErrand,
    rows: readonly MaterialTableRow[],
    extra?: ReactNode
  ) {
    const Glyph = ERRAND_GLYPH[errand];
    const headingId = `${idPrefix}-${errand}`;
    const subtotal =
      errand === 'toBuy' || errand === 'blueprint'
        ? errandSubtotal(rows, sourcing, pricesReady)
        : null;
    const saved =
      errand === 'building' ? rows.reduce((sum, row) => sum + (buildSavings(row) ?? 0), 0) : 0;
    const title = (
      <span className="inline-flex items-center gap-1.5">
        {Glyph && <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />}
        {t('industry.errands.heading', { section: sectionLabel(errand), count: rows.length })}
      </span>
    );
    return (
      <div
        className={cx(
          'flex items-center justify-between gap-3 border-b border-line px-2 py-1.5',
          // On a phone the heading is a rule over its cards, not a filled bar
          // — one more box around boxes there.
          !isPhone && 'bg-panel-2'
        )}
      >
        <h3
          id={headingId}
          className={cx(
            'text-[0.6875rem] font-semibold tracking-widest uppercase',
            ERRAND_TONE[errand]
          )}
        >
          {errand === 'have' ? (
            // Folded by default: nothing on these rows needs doing.
            <button
              type="button"
              aria-expanded={haveOpen}
              onClick={() => setHaveOpen((open) => !open)}
              className="inline-flex min-h-11 items-center gap-1 uppercase hover:text-text focus-visible:outline-2 focus-visible:outline-accent md:min-h-0"
            >
              <Caret expanded={haveOpen} />
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        {extra}
        {saved > 0 && (
          <span className="text-[0.6875rem] font-semibold text-success tabular-nums">
            {t('industry.errands.saves', { amount: formatIsk(saved) })}
          </span>
        )}
        {errand === 'have' && !haveOpen ? (
          <span className="min-w-0 truncate text-[0.6875rem] text-text-dim">
            {rows.map((row) => nameFor(row.typeID)).join(', ')}
          </span>
        ) : (
          subtotal && (
            <span className="flex items-baseline gap-2 text-xs font-semibold tabular-nums">
              {subtotal.unpricedCount > 0 && (
                <span className="text-[0.6875rem] font-normal text-warning">
                  {t('industry.errands.unpricedCount', { count: subtotal.unpricedCount })}
                </span>
              )}
              <IskAmount value={subtotal.total} revealOn="longPress" decimals={0} />
            </span>
          )
        )}
      </div>
    );
  }

  /**
   * One phone ledger row, under its section's NEED | HAVE | BUY header: the
   * name and total; the three numbers in the header's columns, Have a dashed
   * number you tap to edit; then the row's action on the left and its price
   * (or what a build saves) on the right. No card and no box — rows are told
   * apart by a zebra tint, so the Materials panel is the only frame. A
   * Blueprint row has no numbers line, and an owned one says Owned instead of
   * a total and a price of 0.
   */
  function renderPhoneRow(material: MaterialTableRow) {
    const building = isBuilt(material);
    const tier = material.acquisitionTier;
    const ownedBlueprint = tier !== undefined && material.remainingQuantity === 0;
    const savings = building ? buildSavings(material) : null;
    const item = (
      <li
        key={material.typeID}
        className={cx(
          'grid grid-cols-3 gap-x-1.5 gap-y-1 px-3 py-2 even:bg-white/[0.025]',
          ownedBlueprint && 'opacity-80'
        )}
      >
        <div className="col-span-3 flex items-center justify-between gap-2">
          <span className="min-w-0 text-sm font-semibold">{renderName(material, false, true)}</span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
            {ownedBlueprint ? (
              <span className="rounded-xs border border-blueprint-copy/50 px-1.5 text-[0.625rem] leading-5 font-bold tracking-widest text-blueprint-copy uppercase">
                {t('industry.blueprintAcquisitionOwned')}
              </span>
            ) : (
              renderTotal(material)
            )}
            {rowActions?.(material)}
          </span>
        </div>
        {!tier && (
          <>
            <span className={LEDGER_VALUE}>{material.quantity.toLocaleString()}</span>
            <span className={LEDGER_VALUE}>{renderPhoneHave(material)}</span>
            <span className={cx(LEDGER_VALUE, 'font-semibold')}>
              {material.remainingQuantity.toLocaleString()}
            </span>
          </>
        )}
        {/* What to do about the row on the left — use what's in the hangar,
            switch build/buy, change the blueprint tier — and on the right its
            price as "@ price", or what building it saves. */}
        <div className="col-span-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-3">
            {renderOwnedHint(material)}
            {renderAction(material, false)}
            {tier && (
              <span className="text-[0.6875rem] text-text-dim">
                {t('industry.blueprintAcquisitionTier', tier)}
              </span>
            )}
          </span>
          {building ? (
            savings !== null ? (
              <span className="ml-auto text-xs text-success tabular-nums">
                {t('industry.errands.saves', { amount: formatIsk(savings) })}
              </span>
            ) : (
              material.unpriced && renderPrice(material)
            )
          ) : (
            !ownedBlueprint && <span className="ml-auto text-xs">{renderPhonePrice(material)}</span>
          )}
        </div>
      </li>
    );
    return rowContextMenu ? (
      <Fragment key={material.typeID}>{rowContextMenu(material, item)}</Fragment>
    ) : (
      item
    );
  }

  /**
   * The ledger's Have: the number with a dashed underline — the price's own
   * "tap to edit" cue — rather than a field stretched across its column. Blue
   * when the player set it, faint at 0. A tap swaps in the field, focused;
   * leaving it swaps the number back. The 44px tap area is an invisible
   * `::after`, so the row stays one line tall.
   */
  function renderPhoneHave(material: MaterialTableRow) {
    if (editingHave === material.typeID) {
      return (
        <span
          className="w-full"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setEditingHave(null);
            }
          }}
        >
          {renderHave(material, false, true, true)}
        </span>
      );
    }
    const owned = sourcing?.[material.typeID]?.ownedQuantity ?? 0;
    return (
      <button
        type="button"
        onClick={() => setEditingHave(material.typeID)}
        className={cx(
          'relative tabular-nums underline decoration-dashed underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[""] focus-visible:outline-2 focus-visible:outline-accent',
          owned > 0 ? 'text-accent decoration-accent-dim' : 'text-text-faint decoration-line-bright'
        )}
      >
        <span className="sr-only">
          {t('industry.errands.haveFor', { material: nameFor(material.typeID) })},{' '}
        </span>
        {owned.toLocaleString()}
      </button>
    );
  }

  /**
   * The phone card's price: "@ 3,320,000 ISK" as light text, the way the
   * mockup drew it, which becomes the field when tapped and goes back to text
   * once focus leaves it. A box on every card made the cards heavy, and gave
   * a card with nothing else on its last line a 44px line just for that box.
   * The tap area is still 44px tall — an invisible `::after` around the text —
   * so it costs no layout height. A row with no price yet stays the field,
   * since there is no number to show.
   */
  function renderPhonePrice(material: MaterialTableRow) {
    const state = materialRowState(material, sourcing, pricesReady);
    if (editingPrice === material.typeID || state.unitPrice === null) {
      return (
        <span
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setEditingPrice(null);
            }
          }}
        >
          {renderPrice(material, true, editingPrice === material.typeID)}
        </span>
      );
    }
    const overridden = state.priceSource === 'override';
    return (
      <button
        type="button"
        onClick={() => setEditingPrice(material.typeID)}
        className={cx(
          'relative text-xs tabular-nums underline decoration-dashed underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[""] focus-visible:outline-2 focus-visible:outline-accent',
          overridden ? 'text-accent decoration-accent-dim' : 'text-text decoration-line-bright'
        )}
      >
        <span className="sr-only">
          {t('industry.priceFor', { material: nameFor(material.typeID) })}:{' '}
        </span>
        {t('industry.errands.atPrice', { price: maskNumber(state.unitPrice) })}
        {overridden && (
          <span className="ml-1.5 text-[0.6875rem] no-underline">
            {t('industry.priceSourceOverride')}
          </span>
        )}
      </button>
    );
  }

  /** Within one section only — a sort never pulls a row out of its errand. */
  function sortForPhone(rows: readonly MaterialTableRow[]): readonly MaterialTableRow[] {
    if (phoneSort === 'plan') return rows;
    const keyed = rows.map((row) => ({
      row,
      key:
        phoneSort === 'name'
          ? nameFor(row.typeID)
          : phoneSort === 'toBuy'
            ? isBuilt(row)
              ? null
              : row.remainingQuantity
            : isBuilt(row)
              ? null
              : materialRowState(row, sourcing, pricesReady).lineCost,
    }));
    keyed.sort((a, b) => {
      // Rows with nothing to sort by sink, as the table's own sort does.
      if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1;
      if (typeof a.key === 'string' && typeof b.key === 'string') return a.key.localeCompare(b.key);
      return (b.key as number) - (a.key as number);
    });
    return keyed.map((entry) => entry.row);
  }

  const visible = MATERIAL_ERRANDS.filter((errand) => groups[errand].length > 0);

  const sortPicker = (
    <NativeSelect
      size="sm"
      className="ml-auto w-32 shrink-0 [&>select]:min-h-11 [&>select]:normal-case"
      aria-label={t('industry.errands.sortLabel')}
      value={phoneSort}
      onChange={(event) => setPhoneSort(event.target.value as PhoneSort)}
    >
      {PHONE_SORTS.map((key) => (
        <option key={key} value={key}>
          {t(`industry.errands.sort.${key}`)}
        </option>
      ))}
    </NativeSelect>
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {visible.map((errand) => {
        const rows = groups[errand];
        const open = errand !== 'have' || haveOpen;
        return (
          <section
            key={errand}
            aria-labelledby={`${idPrefix}-${errand}`}
            onFocus={() => holdSection(errand)}
            onBlur={releaseSection}
          >
            {renderHeading(
              errand,
              rows,
              // The phone's sort picker rides in the first heading rather
              // than taking a row of its own above the list.
              isPhone && errand === visible[0] ? sortPicker : undefined
            )}
            {open &&
              (isPhone ? (
                <>
                  {/* The ledger's column header, printed once per section
                      rather than as a label on every row. A Blueprint section
                      has no numbers to head. */}
                  {errand !== 'blueprint' && (
                    <div
                      className="grid grid-cols-3 gap-x-1.5 border-b border-line px-3 pt-2 pb-1 text-[0.5625rem] font-semibold tracking-widest text-text-dim uppercase"
                      aria-hidden="true"
                    >
                      <span className="text-right">{t('industry.errands.need')}</span>
                      <span className="inline-flex items-center justify-end gap-1">
                        {t('industry.errands.haveColumn')}
                        <Icon.Rename size={10} />
                      </span>
                      <span className="text-right">
                        {t(
                          errand === 'building'
                            ? 'industry.errands.buildColumn'
                            : 'industry.errands.buyColumn'
                        )}
                      </span>
                    </div>
                  )}
                  <ul>{sortForPhone(rows).map((material) => renderPhoneRow(material))}</ul>
                </>
              ) : (
                <div className="overflow-x-auto">
                  <DataTable
                    {...exportProps}
                    columns={tableColumns}
                    rows={rows}
                    // Fixed layout over the same column widths in every
                    // section, so Need, Have and To buy line up from one
                    // section's table to the next; the name takes the rest.
                    className="table-fixed"
                    rowKey={(material) => material.typeID}
                    label={t('industry.errands.tableLabel', { section: sectionLabel(errand) })}
                    density="compact"
                    rowContextMenu={rowContextMenu}
                  />
                </div>
              ))}
          </section>
        );
      })}
      {toast && (
        <Toast
          message={toastText(toast.message)}
          undo={toast.undo ? { label: t('industry.errands.undo'), onUndo: undo } : undefined}
        />
      )}
    </div>
  );
}
