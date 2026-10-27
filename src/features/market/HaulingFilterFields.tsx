import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FilterField,
  IskInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Tooltip,
  useFilterSurface,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { TRADE_HUBS } from '@/market/hubs';
import { HAULING_CATEGORY_OPTIONS } from './haulingCategories';
import { HAUL_MODES, type HaulMode } from './haulingData';
import { ANY_HUB, type HaulingHubChoice } from './haulingHubs';

/** A hub picker. Uncaptioned: the → button between From and To (which swaps them) says which is which; the name is its `aria-label`. */
export function HubField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HaulingHubChoice;
  onChange: (id: HaulingHubChoice) => void;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as HaulingHubChoice)}>
      <SelectTrigger size="sm" aria-label={label} className="w-24 sm:w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_HUBS.map((h) => (
          <SelectItem key={h.id} value={h.id}>
            {h.systemName}
          </SelectItem>
        ))}
        <SelectItem value={ANY_HUB}>{t('market.hauling.anyHub')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** A typed ISK cap not yet committed: none, a whole figure (null = no limit), or a fraction that can't commit. */
type HeldIsk = 'none' | 'partial' | { amount: number | null };

/**
 * An ISK cap in the filters — Max price per item, Max spend. Blank is no
 * limit. Only a whole, positive figure commits: the URL holds whole ISK.
 * It commits on blur or Enter, not per keystroke, in the box and the sheet
 * alike: `250m` passes through 2 ISK, which would hide every row and drop the
 * selection.
 */
export function IskCapField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  // Inline the field has no caption, so its placeholder names it; in the sheet the caption does.
  const inSheet = useFilterSurface() === 'sheet';
  // `IskInput`'s own last parse, unrounded, handed back as its `value`: a
  // rounded figure (`2.01m` = 2009999.99… → 2010000) would read as an outside
  // change and reset the typed text. The URL lands in a transition, so `value` lags.
  const [typedText, setTypedText] = useState<string | null>(null);
  // What the typed text says, not yet committed: a whole figure (or null, no
  // limit) waiting for blur/Enter, or a fraction that can't commit.
  const [held, setHeld] = useState<HeldIsk>('none');
  const [lastSent, setLastSent] = useState<number | null>(value);
  const [prevValue, setPrevValue] = useState(value);
  // A value this field did not send (Reset, a link) replaces what was typed.
  if (prevValue !== value) {
    setPrevValue(value);
    if (value !== lastSent) {
      setTypedText(null);
      setHeld('none');
    }
  }
  const shown = typedText ?? (value === null ? '' : String(value));
  function commit(next: number | null) {
    setHeld('none');
    if (next === value) return;
    setLastSent(next);
    onChange(next);
  }
  /** Blur/Enter: commit a held figure; a fraction reverts to the committed value. */
  function settle() {
    if (held === 'partial') {
      setTypedText(null);
      setHeld('none');
    } else if (held !== 'none') commit(held.amount);
  }
  return (
    <FilterField label={label}>
      <IskInput
        size="sm"
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintId}
        placeholder={inSheet ? t('market.hauling.filters.noLimit') : label}
        // Inline the echo rides beside the box, not under it, so the row keeps one height.
        className={inSheet ? 'w-40' : 'flex-row! items-center [&>input]:w-40'}
        value={shown}
        onChange={(text) => {
          setTypedText(text);
          const amount = Number(text);
          const whole = text === '' ? null : Math.round(amount);
          // Shorthand's float noise rounds away; a real fraction (`1.5`, on its way to `1.5b`) waits.
          const usable =
            whole === null ||
            (Math.abs(amount - whole) < 0.001 && Number.isSafeInteger(whole) && whole > 0);
          if (!usable) setHeld('partial');
          else setHeld({ amount: whole });
        }}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') settle();
        }}
      />
      {hint !== undefined && (
        <span id={hintId} className={inSheet ? 'text-[0.6875rem] text-text-dim' : 'sr-only'}>
          {hint}
        </span>
      )}
    </FilterField>
  );
}

/**
 * In the route row Category and Sell by give way before the row wraps: they
 * break the line at a smaller basis and grow back to their full width, so the
 * filter funnel stays on the route's line beside the trip rail.
 */
const ROUTE_ROW_SELECT = 'grow basis-36';

/** The market category to scan — in the route row on a wide screen, in the filter sheet on a narrow one. */
export function CategorySelect({
  value,
  onChange,
  nameOf,
  inRouteRow = false,
}: {
  value: number;
  onChange: (cat: number) => void;
  nameOf: (id: number) => string;
  inRouteRow?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger
        size="sm"
        aria-label={t('market.hauling.category')}
        className={inRouteRow ? `${ROUTE_ROW_SELECT} max-w-52` : 'w-52'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HAULING_CATEGORY_OPTIONS.map((id) => (
          <SelectItem key={id} value={String(id)}>
            {nameOf(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** How the load is sold at the destination — placed like `CategorySelect`. */
export function ModeSelect({
  value,
  onChange,
  inRouteRow = false,
}: {
  value: HaulMode;
  onChange: (mode: HaulMode) => void;
  inRouteRow?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as HaulMode)}>
      <SelectTrigger
        size="sm"
        aria-label={t('market.hauling.mode')}
        className={inRouteRow ? `${ROUTE_ROW_SELECT} max-w-48` : 'w-48'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HAUL_MODES.map((m) => (
          <SelectItem key={m} value={m}>
            {t(`market.hauling.modes.${m}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The quantity to bring, typed by hand. Keeps what is being typed in its own
 * state so the box can be emptied and retyped: the planned quantity it would
 * otherwise echo back is clamped and re-sized on every keystroke. Emptying it
 * or typing 0 unticks the row. `title` says what capped the suggestion (the
 * row's detail says it too, for touch).
 */
export function BringInput({
  card,
  label,
  title,
  value,
  onCommit,
}: {
  /** On the dense card rather than in a table row. */
  card: boolean;
  label: string;
  title?: string;
  value: string;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = (
    <TextInput
      size="sm"
      inputMode="numeric"
      aria-label={label}
      // Shorter and narrower on the card: its height sets the meta line's,
      // and a 360px card still fits it beside that line. 28px is under the
      // touch tier's 36px on purpose (DESIGN.md §3); `max-md:` because the
      // `sm` field is already 28px from `md` up.
      className={cx('text-right tabular-nums', card ? 'w-16 max-md:h-7' : 'w-20')}
      value={draft ?? value}
      onChange={(event) => {
        const raw = event.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        onCommit(raw === '' ? 0 : Number(raw));
      }}
      onBlur={() => setDraft(null)}
    />
  );
  return title ? <Tooltip content={title}>{input}</Tooltip> : input;
}
