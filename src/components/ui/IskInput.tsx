import { useContext, useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIsk, maskIsk, parseIskAmount } from '@/lib/isk';
import { FieldNoteContext, mergeDescribedBy } from './fieldNote';
import { TextInput } from './TextInput';

interface IskInputProps extends Omit<
  ComponentProps<typeof TextInput>,
  'type' | 'inputMode' | 'value' | 'onChange' | 'defaultValue'
> {
  /** The committed amount as a plain digit string; `''` is blank. */
  value: string;
  /** Receives each newly parsed amount as a plain digit string, or `''` when cleared. */
  onChange: (value: string) => void;
  /**
   * Echo the parsed exact figure ("= 1,000,000,000 ISK") under the field.
   * Off only where the layout has no room for a second line.
   */
  echo?: boolean;
  /** What a blank field stands for; shown grouped as the placeholder. */
  defaultAmount?: number;
  /**
   * Whether the typed text currently parses (blank counts). A form that saves
   * the committed value uses this to block saving while the field shows text
   * that value doesn't match.
   */
  onParseableChange?: (parseable: boolean) => void;
}

/**
 * An ISK amount the user types: accepts `1b`/`500m`/`10t` shorthand and
 * grouped digits (`parseIskAmount`), which `type="number"` would silently
 * report as empty. The keypad is `decimal`, so a phone can reach the suffix.
 *
 * The typed text stays the user's; only a parse commits. Text that doesn't
 * parse yet ("1.") leaves the committed value alone, and the committed value
 * is always a plain digit string, so URLs and stored values never see
 * shorthand. Blank commits `''` — a caller whose blank means "use the
 * default" reads it as that (`defaultAmount` shows what it will be).
 */
export function IskInput({
  value,
  onChange,
  echo = true,
  defaultAmount,
  onParseableChange,
  placeholder,
  className = '',
  'aria-describedby': describedBy,
  ...rest
}: IskInputProps) {
  const { t } = useTranslation();
  const echoId = useId();
  const noteId = useContext(FieldNoteContext);
  const [text, setText] = useState(value);
  // The last value this field itself committed: a `value` that differs came
  // from outside (Clear, a URL change) and replaces what was typed.
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);
  const parsed = text.trim() === '' ? null : parseIskAmount(text);
  const showEcho = echo && parsed !== null;
  const parseable = text.trim() === '' || parsed !== null;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <TextInput
        {...rest}
        type="text"
        inputMode="decimal"
        placeholder={
          placeholder ?? (defaultAmount !== undefined ? maskIsk(defaultAmount) : undefined)
        }
        className="w-full tabular-nums"
        aria-invalid={parseable ? undefined : true}
        aria-describedby={mergeDescribedBy(describedBy, noteId, showEcho ? echoId : undefined)}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const amount = next.trim() === '' ? '' : parseIskAmount(next);
          onParseableChange?.(amount !== null);
          if (amount === null) return;
          const nextValue = String(amount);
          committed.current = nextValue;
          onChange(nextValue);
        }}
      />
      {showEcho && (
        <span id={echoId} className="text-[0.6875rem] text-text-dim">
          {t('common.iskAmountHint', { amount: formatIsk(parsed) })}
        </span>
      )}
    </div>
  );
}
