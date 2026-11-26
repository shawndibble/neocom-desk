import { useEffect, useRef, useState } from 'react';
import { TextInput } from '@/components/ui';
import { cx } from '@/lib/cx';
import { maskNumber } from '@/lib/numberMask';

interface SourcingInputProps {
  value: number | undefined;
  label: string;
  inputMode: 'numeric' | 'decimal';
  widthClassName: string;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  mine?: boolean;
  autoFocus?: boolean;
  seed?: string;
  onSettle?: (how: 'enter' | 'escape') => void;
  parse: (raw: string) => number | undefined;
  onCommit: (value: number | undefined) => void;
}

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
  onSettle,
  parse,
  onCommit,
}: SourcingInputProps) {
  const [draft, setDraft] = useState<string | null>(seed ?? null);
  const [editing, setEditing] = useState(false);
  const pendingRef = useRef<string | null>(seed ?? null);
  const settledRef = useRef<'enter' | 'escape' | null>(null);
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
      className={cx(widthClassName, 'text-left tabular-nums sm:text-right', mine && 'text-accent!')}
      autoFocus={autoFocus}
      value={draft ?? (value === undefined ? '' : editing ? String(value) : maskNumber(value))}
      onFocus={(event) => {
        setEditing(true);
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
        const settled = settledRef.current;
        settledRef.current = null;
        const next = settled === 'escape' ? value : parse(event.target.value);
        pendingRef.current = null;
        setDraft(null);
        setEditing(false);
        if (next !== value) onCommit(next);
        if (settled) onSettle?.(settled);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          if (onSettle) event.preventDefault();
          settledRef.current = 'enter';
          event.currentTarget.blur();
        }
        if (event.key === 'Escape' && onSettle) {
          event.preventDefault();
          event.stopPropagation();
          settledRef.current = 'escape';
          event.currentTarget.blur();
        }
      }}
    />
  );
}
