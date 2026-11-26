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
import { maskIsk, maskIskTyping, parseIskAmount } from '@/lib/isk';
import { FieldError } from './FieldError';
import { FieldNoteContext, mergeDescribedBy } from './fieldNote';
import { TextInput } from './TextInput';

const isAmountChar = (ch: string) => /\d/.test(ch) || ch === getDecimalMark();

const ERROR_PAUSE_MS = 600;

interface IskInputProps extends Omit<
  ComponentProps<typeof TextInput>,
  'type' | 'inputMode' | 'value' | 'onChange' | 'defaultValue'
> {
  value: string;
  onChange: (value: string) => void;
  defaultAmount?: number;
  onParseableChange?: (parseable: boolean) => void;
}

export function IskInput({
  value,
  onChange,
  defaultAmount,
  onParseableChange,
  onBlur,
  placeholder,
  className = '',
  'aria-describedby': describedBy,
  ...rest
}: IskInputProps) {
  const { t } = useTranslation();
  const errorId = useId();
  const noteId = useContext(FieldNoteContext);
  const toDisplay = (amount: string) =>
    amount !== '' && Number.isFinite(Number(amount)) ? maskIsk(Number(amount)) : amount;
  const [text, setText] = useState(toDisplay(value));
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(toDisplay(value));
    }
  }, [value]);
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
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const parsed = text.trim() === '' ? null : parseIskAmount(text);
  const parseable = text.trim() === '' || parsed !== null;
  const showError = !parseable && errorFor === text;
  useEffect(() => {
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
        aria-describedby={mergeDescribedBy(describedBy, noteId, showError ? errorId : undefined)}
        value={text}
        onBlur={(event) => {
          if (!parseable) setErrorFor(text);
          else if (parsed !== null && parseIskAmount(maskIsk(parsed)) === parsed)
            setText(maskIsk(parsed));
          onBlur?.(event);
        }}
        onChange={(event) => {
          let next = event.target.value;
          const masked = maskIskTyping(next);
          if (masked !== next) {
            const caret = event.target.selectionStart ?? next.length;
            caretDigits.current = [...next.slice(0, caret)].filter(isAmountChar).length;
            next = masked;
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
    </div>
  );
}
