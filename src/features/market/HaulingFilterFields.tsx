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

type HeldIsk = 'none' | 'partial' | { amount: number | null };

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
  const inSheet = useFilterSurface() === 'sheet';
  const [typedText, setTypedText] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldIsk>('none');
  const [lastSent, setLastSent] = useState<number | null>(value);
  const [prevValue, setPrevValue] = useState(value);
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
  function settle() {
    if (held === 'partial') {
      setTypedText(null);
      setHeld('none');
    } else if (held !== 'none') commit(held.amount);
  }
  return (
    <FilterField captionInline label={label}>
      <IskInput
        size="sm"
        aria-label={label}
        aria-describedby={hint === undefined ? undefined : hintId}
        placeholder={inSheet ? t('market.hauling.filters.noLimit') : label}
        className="w-40"
        value={shown}
        onChange={(text) => {
          setTypedText(text);
          const amount = Number(text);
          const whole = text === '' ? null : Math.round(amount);
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

const ROUTE_ROW_SELECT = 'grow basis-36';

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

export function BringInput({
  card,
  label,
  title,
  value,
  onCommit,
}: {
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
