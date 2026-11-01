/**
 * The editable fields of one cerebral accelerator (GLOSSARY.md **Accelerator**):
 * its bonus and when it runs out, entered as time left (EVE's own tooltip) or as
 * the date and time it ends. Shared by the Skill Plan's Booster rows and the
 * Characters table's popover, so the two can never drift apart.
 *
 * Stateless about where the value lives: the caller owns it and `onExpiresChange`
 * reports whether the edit applied (a plan row rejects one that would overlap
 * its neighbour). The expiry is always an instant; the two modes only differ in
 * how it is typed.
 *
 * Duration boxes follow the blur-commit rule: a set that adds up to something
 * commits at once (a blank box counts as zero); one that adds up to nothing
 * commits `null` only when focus leaves the group and every box is blank,
 * because clearing a box to retype it must not erase a saved expiry.
 */
import { useId, useState, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, TextInput } from '@/components/ui';
import {
  disabledClassName,
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useTimeZone } from '@/lib/timeFormat';
import { inputValueToInstant, instantToInputValue } from '@/lib/zonedInput';
import {
  BOOSTER_QUICK_PICKS,
  MAX_BOOSTER_BONUS,
  boosterDurationBase,
  boosterExpiryFromNow,
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
  startsAt: number | null,
  onCommit: (expiresAt: number | null) => boolean
) {
  // `syncedTo` is the committed expiry the draft was typed against: a draft
  // for any other value (a quick pick, a sync, the row in front moving) is stale.
  const [draft, setDraft] = useState<{ syncedTo: number | null; text: DurationDraft } | null>(null);
  // eslint-disable-next-line react-hooks/purity -- display-only: the time left reads the clock
  const now = Date.now();
  let text: DurationDraft = { days: '', hours: '', minutes: '' };
  if (draft !== null && draft.syncedTo === expiresAt) {
    text = draft.text;
  } else if (expiresAt !== null) {
    const d = splitBoosterDuration(expiresAt, startsAt, now);
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
    const nextExpiry = boosterDurationBase(startsAt, Date.now()) + duration;
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

export interface AcceleratorFieldsProps {
  bonus: number;
  expiresAt: number | null;
  /** When the accelerator before it ends, for a queued Booster; null runs from now. */
  startsAt: number | null;
  onBonusChange: (bonus: number) => void;
  /** Returns whether the new expiry applied. */
  onExpiresChange: (expiresAt: number | null) => boolean;
  /** `aria-invalid` and friends, spread onto each input while the caller rejects the value. */
  invalidProps?: { 'aria-invalid': true; 'aria-describedby': string };
}

export function AcceleratorFields({
  bonus,
  expiresAt,
  startsAt,
  onBonusChange,
  onExpiresChange,
  invalidProps,
}: AcceleratorFieldsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const modeId = useId();
  const [mode, setMode] = useState<EntryMode>('remaining');
  const expiresIn = useDurationFields(expiresAt, startsAt, onExpiresChange);

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <TextInput
          size="md"
          type="number"
          min={1}
          max={MAX_BOOSTER_BONUS}
          value={bonus}
          onChange={(e) => onBonusChange(clampBoosterBonus(Number(e.target.value)))}
          {...invalidProps}
          className="field-no-spinner w-16 text-center"
        />
      </label>
      <SegmentedControl<EntryMode>
        label={t('accelerator.entryMode')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'remaining', label: t('accelerator.modeRemaining') },
          { value: 'expires', label: t('accelerator.modeExpires') },
        ]}
      />
      {mode === 'remaining' ? (
        <div role="group" aria-label={t('plans.boosterExpiresIn')} onBlur={expiresIn.onBlur}>
          <div className="flex items-center justify-between gap-2">
            {t('plans.boosterExpiresIn')}
            <div className="flex items-center gap-1">
              {DURATION_UNITS.map((unit) => (
                <label key={unit} className="flex items-center gap-1 text-text-dim">
                  <TextInput
                    size="md"
                    type="text"
                    inputMode="numeric"
                    aria-label={t(`plans.boosterUnit.${unit}`)}
                    placeholder="0"
                    value={expiresIn.text[unit]}
                    onChange={(e) => expiresIn.onChange(unit, e.target.value)}
                    {...invalidProps}
                    className="w-12 text-center"
                  />
                  <span aria-hidden>{t(`plans.boosterUnitShort.${unit}`)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <label className="flex items-center justify-between gap-2" htmlFor={modeId}>
          {t('accelerator.expiresAt')}
          <TextInput
            id={modeId}
            size="md"
            type="datetime-local"
            value={expiresAt === null ? '' : instantToInputValue(expiresAt, timeZone)}
            onChange={(e) => {
              const at = inputValueToInstant(e.target.value, timeZone);
              if (at !== null) onExpiresChange(at);
            }}
            {...invalidProps}
            className="w-auto"
          />
        </label>
      )}
      <div role="group" aria-label={t('plans.boosterQuickPicks')} className="flex flex-wrap gap-1">
        {BOOSTER_QUICK_PICKS.map(({ hours }) => (
          <button
            key={hours}
            type="button"
            onClick={() => onExpiresChange(boosterExpiryFromNow(hours, startsAt, Date.now()))}
            className={cx(
              tappableRowClassName,
              'rounded-xs border px-1.5 text-[0.6875rem]',
              toggleChipStateClassName(false),
              interactiveClassName,
              focusRingClassName,
              disabledClassName
            )}
          >
            {hours % 24 === 0
              ? t('plans.boosterQuickPickDays', { days: hours / 24 })
              : t('plans.boosterQuickPickHours', { hours })}
          </button>
        ))}
      </div>
    </div>
  );
}
