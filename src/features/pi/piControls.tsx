/**
 * Controls the Advisor's "How you play" column and the Goal Planner's rail
 * share, so the two tabs ask the same questions the same way.
 *
 * - `Assume`: a label and its control on one line.
 * - `CadenceRow`: one of the two cadence habits, as a select of offered days.
 * - `PercentInput`: a percentage box that holds what is typed. Rendering the
 *   parsed value straight back made decimals unreachable ("12." parses to 12
 *   and React restores "12"). `commitOn="change"` writes every valid
 *   keystroke (the Advisor's behaviour); `"blur"` writes on blur or Enter
 *   only, so a half-typed figure never reprices the page mid-typing.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import type { ControlSize } from '@/components/ui';
import { PI_CADENCE_DAYS, type PiCadenceDays } from './cadencePref';
import { parseDecimal } from './goalPlannerFormat';

/** A label and its control, on one line. */
export function Assume({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-text-dim">{label}</span>
      {children}
    </div>
  );
}

/**
 * One cadence, as a sentence with a hole in it. Two controls, not one:
 * restarting an extractor does not empty the Launchpad, and hauling does not
 * reinstall a program — see `cadencePref.ts`.
 */
export function CadenceRow({
  label,
  hint,
  value,
  onChange,
  size = 'sm',
  describedBy,
}: {
  label: string;
  hint: string;
  value: PiCadenceDays;
  onChange: (days: PiCadenceDays) => void;
  size?: ControlSize;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  return (
    <Assume
      label={
        <>
          {label}
          <InfoTooltip label={t('common.aboutLabel', { label })} content={hint} />
        </>
      }
    >
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next) as PiCadenceDays)}
      >
        <SelectTrigger
          size={size}
          aria-label={label}
          aria-describedby={describedBy}
          className="w-24 border-accent/70 bg-accent/10"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PI_CADENCE_DAYS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t('piAdvisor.cadenceDays', { count: days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Assume>
  );
}

/** A typed rate in [0, 100] (comma or dot decimals), or null. */
function parsePercent(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value <= 100 ? value : null;
}

export interface PercentInputProps {
  /** The rate in force, as a percentage; null shows the box empty (with `placeholder`). */
  value: number | null;
  onCommit: (percent: number) => void;
  commitOn: 'change' | 'blur';
  'aria-label': string;
  'aria-describedby'?: string;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  size?: ControlSize;
  className?: string;
}

export function PercentInput({
  value,
  onCommit,
  commitOn,
  placeholder,
  autoFocus,
  id,
  size = 'sm',
  className = 'w-16',
  ...aria
}: PercentInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const shown = text ?? (value === null ? '' : String(value));

  /** Checks the text, says so when it is not a rate, and commits one that is. */
  const settle = (raw: string, commit: boolean) => {
    if (raw.trim() === '') {
      setInvalid(false);
      return;
    }
    const percent = parsePercent(raw);
    setInvalid(percent === null);
    if (commit && percent !== null && percent !== value) onCommit(percent);
  };

  const describedBy = [aria['aria-describedby'], invalid ? errorId : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <span className="inline-flex flex-col">
      <TextInput
        id={id}
        size={size}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={aria['aria-label']}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        className={`${className} text-right tabular-nums ${invalid ? 'border-danger' : ''}`}
        value={shown}
        onChange={(event) => {
          setText(event.target.value);
          // Every keystroke is checked, so "150" says it is out of range
          // instead of quietly leaving "15" stored; only `change` commits here.
          settle(event.target.value, commitOn === 'change');
        }}
        onBlur={(event) => {
          if (commitOn === 'blur') settle(event.target.value, true);
          setText(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && commitOn === 'blur') settle(event.currentTarget.value, true);
        }}
      />
      {invalid && (
        <span id={errorId} className="mt-0.5 text-[0.6875rem] text-danger">
          {t('piPlan.percentInvalid')}
        </span>
      )}
    </span>
  );
}
