/**
 * The editable fields of one cerebral accelerator (GLOSSARY.md **Accelerator**):
 * when it runs out, entered as time left (EVE's own tooltip) or, behind a quiet
 * switch, as the date and time it ends; then its bonus, unless the attribute sheet
 * already gave it (the caller shows that once, as a fact). Time comes first: it is
 * the one value EVE never reports, and nothing saves without it. Shared by the
 * Skill Plan's Accelerator section and the Characters table's popover, so the
 * two can never drift apart.
 *
 * Stateless about where the value lives: the caller owns it and `onExpiresChange`
 * reports whether the edit applied. The expiry is always an instant; the two modes only differ in
 * how it is typed.
 *
 * Duration boxes follow the blur-commit rule: a set that adds up to something
 * commits at once (a blank box counts as zero); one that adds up to nothing
 * commits `null` only when focus leaves the group and every box is blank,
 * because clearing a box to retype it must not erase a saved expiry.
 *
 * Once a time is set, the time and the bonus read as text (`EditableValue`)
 * until clicked: one click on the time opens all three boxes. A field closes
 * when focus leaves it; Enter closes it too, Escape restores the value it
 * opened with, and both hand focus back to the text.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EditableValue, TextInput } from '@/components/ui';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { inputValueToInstant, instantToInputValue } from '@/lib/zonedInput';
import {
  MAX_BOOSTER_BONUS,
  clampBoosterBonus,
  joinBoosterDuration,
  splitBoosterDuration,
} from '@/features/skills/planner/planBooster';

const DURATION_UNITS = ['days', 'hours', 'minutes'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
type DurationDraft = Record<DurationUnit, string>;
type EntryMode = 'remaining' | 'expires';

function useDurationFields(
  expiresAt: number | null,
  onCommit: (expiresAt: number | null) => boolean
) {
  // `syncedTo` is the committed expiry the draft was typed against: a draft
  // for any other value (a sync, the row in front moving) is stale.
  const [draft, setDraft] = useState<{ syncedTo: number | null; text: DurationDraft } | null>(null);
  // eslint-disable-next-line react-hooks/purity -- display-only: the time left reads the clock
  const now = Date.now();
  let text: DurationDraft = { days: '', hours: '', minutes: '' };
  if (draft !== null && draft.syncedTo === expiresAt) {
    text = draft.text;
  } else if (expiresAt !== null) {
    const d = splitBoosterDuration(expiresAt, now);
    text = { days: String(d.days), hours: String(d.hours), minutes: String(d.minutes) };
  }

  const onChange = (unit: DurationUnit, raw: string): void => {
    if (!/^\d{0,5}$/.test(raw)) return;
    const next = { ...text, [unit]: raw };
    const duration = joinBoosterDuration({
      days: Number(next.days),
      hours: Number(next.hours),
      minutes: Number(next.minutes),
    });
    if (duration <= 0) {
      setDraft({ syncedTo: expiresAt, text: next });
      return;
    }
    const nextExpiry = Date.now() + duration;
    setDraft({ syncedTo: onCommit(nextExpiry) ? nextExpiry : expiresAt, text: next });
  };

  const onBlur = (event: FocusEvent<HTMLElement>): void => {
    // Tabbing between the boxes is still editing the same value.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    if (draft !== null && DURATION_UNITS.every((unit) => draft.text[unit] === '')) {
      if (expiresAt !== null) onCommit(null);
    }
    setDraft(null);
  };

  return { text, onChange, onBlur };
}

/**
 * The end-time box. A `datetime-local` reports every segment as it is typed
 * (the year runs 0002, 0020, 0202, 2026), so a parseable value is often one in
 * the past: that is never saved (it would end a live accelerator mid-typing),
 * the text stays as typed, and `ended` says why nothing applied.
 */
function useEndTimeField(
  expiresAt: number | null,
  timeZone: 'UTC' | undefined,
  onCommit: (expiresAt: number | null) => boolean
) {
  const [draft, setDraft] = useState<{ syncedTo: number | null; text: string } | null>(null);
  const typing = draft !== null && draft.syncedTo === expiresAt;
  const text = typing
    ? draft.text
    : expiresAt === null
      ? ''
      : instantToInputValue(expiresAt, timeZone);
  const typedAt = typing ? inputValueToInstant(draft.text, timeZone) : null;
  // eslint-disable-next-line react-hooks/purity -- display-only: whether the typed time has passed
  const ended = typedAt !== null && typedAt <= Date.now();

  const onChange = (raw: string): void => {
    const at = inputValueToInstant(raw, timeZone);
    if (at === null || at <= Date.now()) {
      setDraft({ syncedTo: expiresAt, text: raw });
      return;
    }
    setDraft({ syncedTo: onCommit(at) ? at : expiresAt, text: raw });
  };

  // Leaving the box keeps what was typed (and why it didn't apply); only a mode switch drops it.
  return { text, ended, onChange, reset: () => setDraft(null) };
}

export interface AcceleratorFieldsProps {
  bonus: number;
  expiresAt: number | null;
  /** The bonus is known (detected from the attribute sheet): shown, not editable. */
  bonusLocked?: boolean;
  onBonusChange: (bonus: number) => void;
  /** Returns whether the new expiry applied. */
  onExpiresChange: (expiresAt: number | null) => boolean;
  /** `aria-invalid` and friends, spread onto each input while the caller rejects the value. */
  invalidProps?: { 'aria-invalid': true; 'aria-describedby': string };
  /** A note under the time, such as why it still needs setting. */
  hint?: ReactNode;
  /** Controls at the end of the bottom row, beside the entry-mode switch (Clear). */
  actions?: ReactNode;
}

type Editing = 'time' | 'bonus' | null;

export function AcceleratorFields({
  bonus,
  expiresAt,
  bonusLocked = false,
  onBonusChange,
  onExpiresChange,
  invalidProps,
  hint,
  actions,
}: AcceleratorFieldsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const modeId = useId();
  const hintId = useId();
  // Read with the time boxes, so a screen reader hears why the time is needed.
  const describedBy = hint ? { 'aria-describedby': hintId } : {};
  const [mode, setMode] = useState<EntryMode>('remaining');
  // Once a time is set the values read as text; the one being edited shows its
  // field(s) while focus stays in them. Unset, the whole thing is a form.
  const [editing, setEditing] = useState<Editing>(null);
  // What Escape restores: the value as it was when its field opened.
  const [snapshot, setSnapshot] = useState<{ expiresAt: number | null; bonus: number } | null>(
    null
  );
  // Focus the field just opened from its text, and hand focus back on Enter or Escape.
  const focusField = useRef(false);
  const [returnFocus, setReturnFocus] = useState<Exclude<Editing, null>>();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const expiresIn = useDurationFields(expiresAt, onExpiresChange);
  const endsAt = useEndTimeField(expiresAt, timeZone, onExpiresChange);
  const endedId = useId();
  const isSet = expiresAt !== null;

  useEffect(() => {
    if (!focusField.current) return;
    focusField.current = false;
    firstFieldRef.current?.focus();
  });

  const startEditing = (which: Exclude<Editing, null>): void => {
    if (editing !== which) setSnapshot({ expiresAt, bonus });
    setEditing(which);
  };
  const open = (which: Exclude<Editing, null>, seed?: string): void => {
    startEditing(which);
    focusField.current = true;
    if (seed === undefined) return;
    if (which === 'bonus') onBonusChange(clampBoosterBonus(Number(seed)));
    else if (mode === 'remaining') expiresIn.onChange('days', seed);
  };
  const close = (): void => {
    setEditing(null);
    setSnapshot(null);
  };
  const onFieldKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape' && snapshot !== null) {
      if (editing === 'bonus') onBonusChange(snapshot.bonus);
      else if (snapshot.expiresAt !== expiresAt) onExpiresChange(snapshot.expiresAt);
    }
    if (isSet && editing !== null) setReturnFocus(editing);
    close();
  };
  const closeOnLeave = (event: FocusEvent<HTMLElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    close();
  };
  const restFocus = (which: Exclude<Editing, null>) => ({
    focusOnMount: returnFocus === which,
    onFocused: () => setReturnFocus(undefined),
  });

  // A typed end time that has already passed stays on screen with its warning.
  const showTimeFields = !isSet || editing === 'time' || (mode === 'expires' && endsAt.ended);
  const showBonusField = !isSet || editing === 'bonus';
  const restText = (() => {
    if (!isSet) return '';
    if (mode === 'expires') return formatTimestamp(new Date(expiresAt), timeZone);
    // eslint-disable-next-line react-hooks/purity -- display-only: the time left reads the clock
    const d = splitBoosterDuration(expiresAt, Date.now());
    return DURATION_UNITS.map((unit) => `${d[unit]}${t(`plans.boosterUnitShort.${unit}`)}`).join(
      ' '
    );
  })();

  let time: ReactNode;
  if (!showTimeFields) {
    time = (
      <div className="flex items-center justify-between gap-2">
        {mode === 'remaining' ? t('plans.boosterExpiresIn') : t('accelerator.expiresAt')}
        <EditableValue
          label={mode === 'remaining' ? t('accelerator.editTimeLeft') : t('accelerator.editEndsAt')}
          onEdit={(seed) => open('time', seed)}
          {...restFocus('time')}
        >
          {restText}
        </EditableValue>
      </div>
    );
  } else if (mode === 'remaining') {
    time = (
      <div
        role="group"
        aria-label={t('plans.boosterExpiresIn')}
        onFocus={() => startEditing('time')}
        onBlur={(event) => {
          expiresIn.onBlur(event);
          closeOnLeave(event);
        }}
        onKeyDown={onFieldKeyDown}
      >
        <div className="flex items-center justify-between gap-2">
          {t('plans.boosterExpiresIn')}
          <div className="flex items-center gap-1">
            {DURATION_UNITS.map((unit, index) => (
              <label key={unit} className="flex items-center gap-1 text-text-dim">
                <TextInput
                  ref={index === 0 ? firstFieldRef : undefined}
                  size="md"
                  type="text"
                  inputMode="numeric"
                  aria-label={t(`plans.boosterUnit.${unit}`)}
                  value={expiresIn.text[unit]}
                  onChange={(e) => expiresIn.onChange(unit, e.target.value)}
                  {...describedBy}
                  {...invalidProps}
                  className="w-12 text-center"
                />
                <span aria-hidden>{t(`plans.boosterUnitShort.${unit}`)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  } else {
    time = (
      <div className="space-y-1">
        <label className="flex items-center justify-between gap-2" htmlFor={modeId}>
          {t('accelerator.expiresAt')}
          <TextInput
            ref={firstFieldRef}
            id={modeId}
            size="md"
            type="datetime-local"
            value={endsAt.text}
            onChange={(e) => endsAt.onChange(e.target.value)}
            onFocus={() => startEditing('time')}
            onBlur={closeOnLeave}
            onKeyDown={onFieldKeyDown}
            {...describedBy}
            {...invalidProps}
            {...(endsAt.ended
              ? {
                  'aria-invalid': true,
                  'aria-describedby': [
                    invalidProps?.['aria-describedby'] ?? describedBy['aria-describedby'],
                    endedId,
                  ]
                    .filter(Boolean)
                    .join(' '),
                }
              : {})}
            className="w-auto"
          />
        </label>
        {endsAt.ended && (
          <p id={endedId} className="text-[0.6875rem] text-warning">
            {t('accelerator.alreadyEnded')}
          </p>
        )}
      </div>
    );
  }

  let bonusRow: ReactNode = null;
  if (bonusLocked) {
    // The caller shows a detected bonus once, as a fact.
  } else if (!showBonusField) {
    bonusRow = (
      <div className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <EditableValue
          label={t('accelerator.editBonus')}
          onEdit={(seed) => open('bonus', seed)}
          {...restFocus('bonus')}
        >
          {bonus}
        </EditableValue>
      </div>
    );
  } else {
    bonusRow = (
      <label className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <TextInput
          ref={isSet ? firstFieldRef : undefined}
          size="md"
          type="number"
          min={1}
          max={MAX_BOOSTER_BONUS}
          value={bonus}
          onChange={(e) => onBonusChange(clampBoosterBonus(Number(e.target.value)))}
          onFocus={() => startEditing('bonus')}
          onBlur={closeOnLeave}
          onKeyDown={onFieldKeyDown}
          {...invalidProps}
          className="field-no-spinner w-16 text-center"
        />
      </label>
    );
  }

  return (
    <div className="space-y-2">
      {time}
      {hint && <div id={hintId}>{hint}</div>}
      {bonusRow}
      <div className="flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            endsAt.reset();
            setMode(mode === 'remaining' ? 'expires' : 'remaining');
            // Switching how the time is typed is asking to type it.
            if (isSet) open('time');
          }}
        >
          {mode === 'remaining' ? t('accelerator.useEndTime') : t('accelerator.useTimeLeft')}
        </Button>
        {actions}
      </div>
    </div>
  );
}
