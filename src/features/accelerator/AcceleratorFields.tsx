/**
 * The editable fields of one cerebral accelerator (GLOSSARY.md **Accelerator**):
 * when it runs out, entered as time left (EVE's own tooltip); then its bonus,
 * unless the attribute sheet already gave it (the caller shows that once, as a
 * fact). Time comes first: it is
 * the one value EVE never reports, and nothing saves without it. Shared by the
 * Skill Plan's Accelerator section and the Characters table's popover, so the
 * two can never drift apart.
 *
 * Stateless about where the value lives: the caller owns it and `onExpiresChange`
 * reports whether the edit applied. The expiry is always an instant.
 *
 * Duration boxes follow the blur-commit rule: a set that adds up to something
 * commits at once (a blank box counts as zero); one that adds up to nothing
 * commits `null` only when focus leaves the group and every box is blank,
 * because clearing a box to retype it must not erase a saved expiry. Blanking
 * every box is how a saved accelerator is forgotten.
 *
 * Once a time is set, the time and the bonus read as text (`EditableValue`)
 * until clicked: one click on the time opens all three boxes. A field closes
 * when focus leaves it; Enter closes it too, Escape restores the value it
 * opened with, and both hand focus back to the text. Not `useInPlaceEdit`: that
 * drafts one string and commits on close, while these fields save as typed.
 */
import {
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { EditableValue, TextInput } from '@/components/ui';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import {
  MAX_BOOSTER_BONUS,
  clampBoosterBonus,
  joinBoosterDuration,
  splitBoosterDuration,
} from '@/features/skills/planner/planBooster';

const DURATION_UNITS = ['days', 'hours', 'minutes'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
type DurationDraft = Record<DurationUnit, string>;

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
  /**
   * Open with the time's boxes showing, so focus lands in the first: the
   * Characters table's pencil, whose whole click is asking to edit the time.
   */
  editTimeOnOpen?: boolean;
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
  editTimeOnOpen = false,
}: AcceleratorFieldsProps) {
  const { t } = useTranslation();
  const hintId = useId();
  // Read with the time boxes, so a screen reader hears why the time is needed.
  const describedBy = hint ? { 'aria-describedby': hintId } : {};
  // Once a time is set the values read as text; the one being edited shows its
  // field(s) while focus stays in them. Unset, the whole thing is a form.
  const [editing, setEditing] = useState<Editing>(editTimeOnOpen ? 'time' : null);
  // What Escape restores: the value as it was when its field opened.
  const [snapshot, setSnapshot] = useState<{ expiresAt: number | null; bonus: number } | null>(
    editTimeOnOpen ? { expiresAt, bonus } : null
  );
  // Focus moves to the field just opened from its text, and back on Enter or Escape.
  // What is typed in the bonus box, so it can be emptied on the way to a new number
  // instead of snapping to the minimum; null shows the committed bonus.
  const [bonusDraft, setBonusDraft] = useState<string | null>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const timeFieldRef = useRef<HTMLInputElement | null>(null);
  const bonusFieldRef = useRef<HTMLInputElement | null>(null);
  const timeTextRef = useRef<HTMLButtonElement | null>(null);
  const bonusTextRef = useRef<HTMLButtonElement | null>(null);
  const expiresIn = useDurationFields(expiresAt, onExpiresChange);
  const isSet = expiresAt !== null;
  // Entered from unset, the whole thing stays a form until focus leaves it, so
  // the first digit saving an expiry doesn't turn the rest into text mid-entry.
  const [formOpen, setFormOpen] = useState(false);

  const startEditing = (which: Exclude<Editing, null>): void => {
    if (editing !== which) setSnapshot({ expiresAt, bonus });
    setEditing(which);
  };
  const open = (which: Exclude<Editing, null>, seed?: string): void => {
    startEditing(which);
    focusAfterCommit(which === 'time' ? timeFieldRef : bonusFieldRef);
    if (seed === undefined) return;
    if (which === 'bonus') onBonusChange(clampBoosterBonus(Number(seed)));
    // A digit typed on the time left starts the days.
    else expiresIn.onChange('days', seed);
  };
  const close = (): void => {
    setEditing(null);
    setSnapshot(null);
  };
  const onFieldKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // Unset, the fields are a plain form: nothing to close or restore.
    if (!isSet || formOpen || editing === null) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    if (event.key === 'Escape' && snapshot !== null) {
      if (editing === 'bonus') onBonusChange(snapshot.bonus);
      else if (snapshot.expiresAt !== expiresAt) onExpiresChange(snapshot.expiresAt);
    }
    focusAfterCommit(editing === 'time' ? timeTextRef : bonusTextRef);
    close();
  };
  const closeOnLeave = (event: FocusEvent<HTMLElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    close();
  };
  const showTimeFields = !isSet || formOpen || editing === 'time';
  const showBonusField = !isSet || formOpen || editing === 'bonus';
  const timeText = (() => {
    if (!isSet) return '';
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
        {t('plans.boosterExpiresIn')}
        <EditableValue
          label={t('accelerator.editTimeLeft')}
          onEdit={(seed) => open('time', seed)}
          ref={timeTextRef}
        >
          {timeText}
        </EditableValue>
      </div>
    );
  } else {
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
                  ref={index === 0 ? timeFieldRef : undefined}
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
  }

  // A detected bonus is shown once by the caller, as a fact: no row here.
  let bonusRow: ReactNode = null;
  if (!bonusLocked && !showBonusField) {
    bonusRow = (
      <div className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <EditableValue
          label={t('accelerator.editBonus')}
          onEdit={(seed) => open('bonus', seed)}
          ref={bonusTextRef}
        >
          {bonus}
        </EditableValue>
      </div>
    );
  } else if (!bonusLocked) {
    bonusRow = (
      <label className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <TextInput
          ref={bonusFieldRef}
          size="md"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_BOOSTER_BONUS}
          value={bonusDraft ?? bonus}
          onChange={(e) => {
            const raw = e.target.value;
            setBonusDraft(raw);
            if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
              onBonusChange(clampBoosterBonus(Number(raw)));
            }
          }}
          onFocus={() => startEditing('bonus')}
          onBlur={(event) => {
            setBonusDraft(null);
            closeOnLeave(event);
          }}
          onKeyDown={onFieldKeyDown}
          {...invalidProps}
          className="field-no-spinner w-16 text-center"
        />
      </label>
    );
  }

  return (
    <div
      className="space-y-2"
      onFocus={() => {
        if (!isSet) setFormOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFormOpen(false);
      }}
    >
      {time}
      {hint && <div id={hintId}>{hint}</div>}
      {bonusRow}
    </div>
  );
}
