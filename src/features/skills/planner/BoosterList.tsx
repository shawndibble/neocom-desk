/**
 * The Booster (CONTEXT.md) control: an ordered list of cerebral accelerators
 * a Skill Plan is costed under, one after another — EVE has a single booster
 * slot, so extracted from `PlanEditor.tsx` (#1407, which added the list) into
 * its own component since a single accelerator's editing state (draft text
 * per duration box, the blur-commit rule, quick picks) multiplies by row
 * count and was crowding the editor that owns a dozen other concerns.
 *
 * A row's life is edited the way EVE's tooltip shows it — days, hours and
 * minutes left — and stored as the instant that lands on. There is no Starts
 * field: a queued row starts when the one before it expires (`linkBoosterChain`).
 *
 * Fully controlled: `boosters` is the resolved list (`resolvePlanBoosters`)
 * and every edit calls `onChange` with the next list — except one that would
 * make two rows overlap, which is rejected inline (`hasOverlappingBoosters`)
 * rather than ever reaching the plan. `clampBoosterOverlaps` still runs at
 * read time (`toBoosters`) as a backstop for a value that reached this shape
 * some other way (synced from an older build, restored from an import), but
 * this component's whole point is to stop the user from typing one.
 */
import { useState, type FocusEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, TextInput } from '@/components/ui';
import {
  disabledClassName,
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import type { PlanBooster } from '@/db';
import { MarketGroupLink } from './MarketGroupLink';
import { CEREBRAL_ACCELERATORS_MARKET_GROUP_ID } from './plannerMarketGroups';
import {
  BOOSTER_QUICK_PICKS,
  DEFAULT_PLAN_BOOSTER,
  MAX_BOOSTER_BONUS,
  boosterDurationBase,
  boosterExpiryFromNow,
  clampBoosterBonus,
  hasOverlappingBoosters,
  joinBoosterDuration,
  linkBoosterChain,
  rebaseBooster,
  splitBoosterDuration,
} from './planBooster';

interface BoosterListProps {
  boosters: readonly PlanBooster[];
  /** From `attributeBaseline.ts`; prefills the first row and drives the "detected" notice. */
  detectedAccelerator: number | null;
  /** Never called with a list `hasOverlappingBoosters` — the caller can trust every commit. */
  onChange: (boosters: PlanBooster[]) => void;
}

const DURATION_UNITS = ['days', 'hours', 'minutes'] as const;
type DurationUnit = (typeof DURATION_UNITS)[number];
type DurationDraft = Record<DurationUnit, string>;

/**
 * The Expires boxes: days, hours and minutes left, bound to a nullable
 * instant, with the round-33 blur-commit rule. A set of boxes that adds up to
 * something commits immediately (a blank box counts as zero); one that adds up
 * to nothing — including every box emptied — commits `null` only when focus
 * leaves the group and only if all of them are blank, because clearing a box
 * to retype it must not erase a saved expiry mid-edit.
 *
 * The typed text is kept until focus leaves the group, so "30" hours does not
 * reshuffle itself into 1 day 6 hours under the caret; leaving normalizes it.
 *
 * `onCommit` returns whether the value applied (an overlap rejects it); a
 * rejected draft stays on screen beside the inline error.
 */
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

interface BoosterRowProps {
  row: PlanBooster;
  /** 1-based position, naming the row among its siblings. */
  position: number;
  detectedAccelerator: number | null;
  overlaps: boolean;
  onPatch: (patch: Partial<PlanBooster>) => boolean;
  onRemove: () => void;
}

function BoosterRow({
  row,
  position,
  detectedAccelerator,
  overlaps,
  onPatch,
  onRemove,
}: BoosterRowProps) {
  const { t } = useTranslation();

  // `overlaps` (from the committed list) only catches an overlap that
  // already exists in props — it says nothing about a just-typed edit that
  // `onPatch` rejected, which is real but lives only in this row's own
  // uncommitted draft text. This local flag is what actually shows the
  // warning right after that rejection; `overlaps` keeps it showing if the
  // committed state stays overlapping for some other reason (e.g. synced in).
  const [rejected, setRejected] = useState(false);
  const patch = (p: Partial<PlanBooster>): boolean => {
    const ok = onPatch(p);
    setRejected(!ok);
    return ok;
  };

  // The first row has no one to wait for: a start an older build saved on it is ignored.
  const startsAt = position > 1 ? row.startsAt : null;
  const expiresIn = useDurationFields(row.expiresAt, startsAt, (expiresAt) => patch({ expiresAt }));

  // eslint-disable-next-line react-hooks/purity -- display-only "expired" hint, same as PlanEditor's own clock read
  const expired = row.expiresAt !== null && row.expiresAt <= Date.now();

  return (
    <div className="space-y-2 border-l border-line pl-2">
      <div className="flex items-center justify-between gap-2">
        {/* No on/off box: a listed row is live, and the X is how it goes off. */}
        <span>{t('plans.boosterRowLabel', { position })}</span>
        <IconButton
          icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
          label={t('plans.boosterRemove')}
          onClick={onRemove}
          size="sm"
          variant="plain"
          tone="danger"
        />
      </div>
      <label className="flex items-center justify-between gap-2">
        {t('plans.boosterBonus')}
        <TextInput
          size="md"
          type="number"
          min={1}
          max={MAX_BOOSTER_BONUS}
          value={row.bonus}
          onChange={(e) => patch({ bonus: clampBoosterBonus(Number(e.target.value)) })}
          className="field-no-spinner w-16 text-center"
        />
      </label>
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
                  className="w-12 text-center"
                />
                <span aria-hidden>{t(`plans.boosterUnitShort.${unit}`)}</span>
              </label>
            ))}
          </div>
        </div>
        {position > 1 && (
          <p className="mt-1 text-[0.6875rem] text-text-dim">
            {t('plans.boosterStartsAfterPrevious')}
          </p>
        )}
      </div>
      <div role="group" aria-label={t('plans.boosterQuickPicks')} className="flex flex-wrap gap-1">
        {BOOSTER_QUICK_PICKS.map(({ hours }) => (
          <button
            key={hours}
            type="button"
            onClick={() => patch({ expiresAt: boosterExpiryFromNow(hours, startsAt, Date.now()) })}
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
      {(rejected || overlaps) && <p className="text-warning">{t('plans.boosterOverlap')}</p>}
      {detectedAccelerator !== null && row.expiresAt === null && (
        <p className="text-warning">{t('plans.boosterDetectedNoExpiry')}</p>
      )}
      {expired && <p className="text-warning">{t('plans.boosterExpired')}</p>}
    </div>
  );
}

export function BoosterList({ boosters, detectedAccelerator, onChange }: BoosterListProps) {
  const { t } = useTranslation();

  function patchRow(index: number, patch: Partial<PlanBooster>): boolean {
    // Setting the first row's time left means it runs from now, whatever start an older build saved.
    const applied = index === 0 && 'expiresAt' in patch ? { ...patch, startsAt: null } : patch;
    const edited = boosters.map((row, i) => (i === index ? { ...row, ...applied } : row));
    // Later rows keep their length and follow the edited one's new expiry.
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    const next = linkBoosterChain(edited, Date.now());
    if (hasOverlappingBoosters(next)) return false;
    onChange(next);
    return true;
  }

  function removeRow(index: number): void {
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    const now = Date.now();
    const rest = boosters.filter((_, i) => i !== index);
    // Whatever was queued behind the removed row now runs first, from now.
    const reopened =
      index === 0 && rest.length > 0 ? [rebaseBooster(rest[0], null, now), ...rest.slice(1)] : rest;
    onChange(linkBoosterChain(reopened, now));
  }

  function addRow(): void {
    // Starts where the last row's window ends, so appending naturally
    // continues the sequence instead of landing back on "now".
    const previousExpiry = boosters.at(-1)?.expiresAt ?? null;
    onChange([...boosters, { ...DEFAULT_PLAN_BOOSTER, enabled: true, startsAt: previousExpiry }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1.5">
        <span>{t('plans.booster')}</span>
        <MarketGroupLink
          groupId={CEREBRAL_ACCELERATORS_MARKET_GROUP_ID}
          label={t('plans.boosterMarketLink')}
        />
      </div>
      {detectedAccelerator !== null && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('plans.boosterDetected', { bonus: detectedAccelerator })}
        </p>
      )}
      {boosters.map((row, index) => {
        const withoutThis = boosters.filter((_, i) => i !== index);
        const overlaps = hasOverlappingBoosters([...withoutThis, row]);
        return (
          <BoosterRow
            key={index}
            row={row}
            position={index + 1}
            detectedAccelerator={detectedAccelerator}
            overlaps={overlaps}
            onPatch={(patch) => patchRow(index, patch)}
            onRemove={() => removeRow(index)}
          />
        );
      })}
      <Button size="sm" variant="ghost" onClick={addRow}>
        <Icon.AddRow size={Icon.ICON_SIZE.sm} />
        {t('plans.boosterAdd')}
      </Button>
    </div>
  );
}
