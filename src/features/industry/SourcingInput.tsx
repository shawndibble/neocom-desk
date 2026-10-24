import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/ui';
import { cx } from '@/lib/cx';
import { maskNumber } from '@/lib/numberMask';

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
  /** The first character typed on the value that opened this field; starts the draft with it. */
  seed?: string;
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
  seed,
  parse,
  onCommit,
}: SourcingInputProps) {
  const [draft, setDraft] = useState<string | null>(seed ?? null);
  const [editing, setEditing] = useState(false);
  // Leaving the page mid-edit (Back, a shortcut, a row scrolled out of a
  // virtualized list) unmounts the field without a blur, which would drop the
  // edit. The ref mirrors the uncommitted draft synchronously — cleared in the
  // same handler that commits on blur, so an unmount right after a blur never
  // commits twice — and the latest props, read only at unmount.
  const pendingRef = useRef<string | null>(seed ?? null);
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
      onFocus={(event) => {
        setEditing(true);
        // A seeded draft keeps typing after the seed, not before it.
        if (seed !== undefined) {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }
      }}
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
