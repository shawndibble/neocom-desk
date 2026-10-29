import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useTranslation } from 'react-i18next';
import { getDecimalMark } from '@/lib/numberLocale';
import { formatIsk, maskIsk, maskIskTyping, parseIskAmount } from '@/lib/isk';
import { FieldError } from './FieldError';
import { FieldNoteContext, mergeDescribedBy } from './fieldNote';
import { TextInput } from './TextInput';

/** A digit or the decimal mark: what the caret position is counted in, since grouping marks come and go. */
const isAmountChar = (ch: string) => /\d/.test(ch) || ch === getDecimalMark();

/** How long typing pauses before invalid text shows its error. */
const ERROR_PAUSE_MS = 600;

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
  /**
   * Group the digits with the display format's separator as they are typed, so
   * the field itself shows the figure and needs no echo under it.
   */
  mask?: boolean;
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
  mask = false,
  defaultAmount,
  onParseableChange,
  onBlur,
  placeholder,
  className = '',
  'aria-describedby': describedBy,
  ...rest
}: IskInputProps) {
  const { t } = useTranslation();
  const echoId = useId();
  const errorId = useId();
  const noteId = useContext(FieldNoteContext);
  // A committed value is a plain `1500000.5`, whatever the display mark: it is formatted, not re-read as typed text.
  const toDisplay = (amount: string) =>
    mask && amount !== '' && Number.isFinite(Number(amount)) ? maskIsk(Number(amount)) : amount;
  const [text, setText] = useState(toDisplay(value));
  // The last value this field itself committed: a `value` that differs came
  // from outside (Clear, a URL change) and replaces what was typed.
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(toDisplay(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Typing re-groups the text, which moves the caret: it is put back after the same count of digits.
  const field = useRef<HTMLInputElement | null>(null);
  const caretDigits = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = field.current;
    const digits = caretDigits.current;
    caretDigits.current = null;
    if (!el || digits === null || document.activeElement !== el) return;
    let seen = 0;
    let at = 0;
    while (at < text.length && seen < digits) {
      if (isAmountChar(text[at])) seen += 1;
      at += 1;
    }
    el.setSelectionRange(at, at);
  }, [text]);
  // The text the error is armed for: set after typing pauses or on blur, so a
  // half-typed "1." never flashes (and announces) an error on the way to "1.5b".
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const parsed = text.trim() === '' ? null : parseIskAmount(text);
  const parseable = text.trim() === '' || parsed !== null;
  const showError = !parseable && errorFor === text;
  const showEcho = echo && !mask && parsed !== null;
  useEffect(() => {
    // A trailing "." is incomplete until blur.
    if (parseable || text.trim().endsWith('.')) return;
    const timer = setTimeout(() => setErrorFor(text), ERROR_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [parseable, text]);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <TextInput
        {...rest}
        ref={field}
        type="text"
        inputMode="decimal"
        placeholder={
          placeholder ?? (defaultAmount !== undefined ? maskIsk(defaultAmount) : undefined)
        }
        className="w-full tabular-nums aria-[invalid=true]:border-danger"
        aria-invalid={parseable ? undefined : true}
        aria-describedby={mergeDescribedBy(
          describedBy,
          noteId,
          showEcho ? echoId : undefined,
          showError ? errorId : undefined
        )}
        value={text}
        onBlur={(event) => {
          if (!parseable) setErrorFor(text);
          onBlur?.(event);
        }}
        onChange={(event) => {
          let next = event.target.value;
          if (mask) {
            const masked = maskIskTyping(next);
            if (masked !== next) {
              const caret = event.target.selectionStart ?? next.length;
              caretDigits.current = [...next.slice(0, caret)].filter(isAmountChar).length;
              next = masked;
            }
          }
          setText(next);
          const amount = next.trim() === '' ? '' : parseIskAmount(next);
          onParseableChange?.(amount !== null);
          if (amount === null) return;
          const nextValue = String(amount);
          committed.current = nextValue;
          onChange(nextValue);
        }}
      />
      {showError && (
        <FieldError id={errorId} className="text-[0.6875rem]">
          {t('common.iskInvalid')}
        </FieldError>
      )}
      {showEcho && (
        <span id={echoId} className="text-[0.6875rem] text-text-dim">
          {t('common.iskAmountHint', { amount: formatIsk(parsed) })}
        </span>
      )}
    </div>
  );
}
