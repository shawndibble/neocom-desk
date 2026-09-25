/**
 * The Booster (CONTEXT.md) control: an ordered list of cerebral accelerators
 * a Skill Plan is costed under, one after another — EVE has a single booster
 * slot, so extracted from `PlanEditor.tsx` (#1407, which added the list) into
 * its own component since a single accelerator's editing state (draft text
 * per datetime field, the blur-commit rule, quick picks) multiplies by row
 * count and was crowding the editor that owns a dozen other concerns.
 *
 * Fully controlled: `boosters` is the resolved list (`resolvePlanBoosters`)
 * and every edit calls `onChange` with the next list — except one that would
 * make two rows overlap, which is rejected inline (`hasOverlappingBoosters`)
 * rather than ever reaching the plan. `clampBoosterOverlaps` still runs at
 * read time (`toBoosters`) as a backstop for a value that reached this shape
 * some other way (synced from an older build, restored from an import), but
 * this component's whole point is to stop the user from typing one.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, TextInput, Checkbox } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { PlanBooster } from '@/db';
import { buildMarketGroupParams } from '@/engine/market/urlState';
import { BOOSTER_MARKET_GROUP_ID } from './plannerMarketGroups';
import {
  BOOSTER_QUICK_PICKS,
  DEFAULT_PLAN_BOOSTER,
  MAX_BOOSTER_BONUS,
  boosterExpiryFromInput,
  boosterExpiryFromNow,
  boosterExpiryToInput,
  clampBoosterBonus,
  hasOverlappingBoosters,
} from './planBooster';

interface BoosterListProps {
  boosters: readonly PlanBooster[];
  /** From `attributeBaseline.ts`; prefills the first row and drives the "detected" notice. */
  detectedAccelerator: number | null;
  /** Never called with a list `hasOverlappingBoosters` — the caller can trust every commit. */
  onChange: (boosters: PlanBooster[]) => void;
}

/**
 * A `datetime-local` field bound to a nullable instant, with the round-33
 * blur-commit rule: a value that parses commits immediately, an emptied
 * field commits `null` only on blur (a native `datetime-local` reports `''`
 * for any incomplete state, including mid-retype of an already-complete
 * value, so committing on `change` would erase a saved instant while the
 * user is still typing), and anything else left on blur is simply dropped,
 * leaving the committed value standing.
 *
 * `onCommit` returns whether the value actually applied — a row-level commit
 * that `hasOverlappingBoosters` rejects returns `false`, and the draft is
 * kept rather than cleared so the user's rejected input stays on screen
 * beside the inline error, instead of snapping back to the last-good value.
 */
function useInstantField(
  committedValue: number | null,
  draftKeyBase: string,
  onCommit: (value: number | null) => boolean
) {
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const key = `${draftKeyBase}:${committedValue ?? ''}`;
  const inputValue =
    (draft?.key === key ? draft.text : null) ?? boosterExpiryToInput(committedValue);

  const onChange = (raw: string): void => {
    const value = boosterExpiryFromInput(raw);
    if (value === null) {
      setDraft({ key, text: raw });
      return;
    }
    setDraft(onCommit(value) ? null : { key, text: raw });
  };

  const onBlur = (): void => {
    if (draft === null) return;
    if (draft.text === '' && committedValue !== null && onCommit(null)) {
      setDraft(null);
      return;
    }
    setDraft(null);
  };

  return { inputValue, onChange, onBlur };
}

interface BoosterRowProps {
  row: PlanBooster;
  rowKey: string;
  detectedAccelerator: number | null;
  /** Whether this row shows its Starts field. */
  showStart: boolean;
  overlaps: boolean;
  onPatch: (patch: Partial<PlanBooster>) => boolean;
  onRemove: () => void;
}

function BoosterRow({
  row,
  rowKey,
  detectedAccelerator,
  showStart,
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

  const startsAtField = useInstantField(row.startsAt, `${rowKey}:startsAt`, (startsAt) =>
    patch({ startsAt })
  );
  const expiresAtField = useInstantField(row.expiresAt, `${rowKey}:expiresAt`, (expiresAt) =>
    patch({ expiresAt })
  );

  // eslint-disable-next-line react-hooks/purity -- display-only "expired" hint, same as PlanEditor's own clock read
  const expired = row.enabled && row.expiresAt !== null && row.expiresAt <= Date.now();

  return (
    <div className="space-y-2 border-l border-line pl-2">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5">
          <Checkbox checked={row.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          {t('plans.booster')}
        </label>
        <IconButton
          icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
          label={t('plans.boosterRemove')}
          onClick={onRemove}
          size="sm"
          variant="plain"
        />
      </div>
      {row.enabled && (
        <>
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
          {showStart && (
            <label className="flex items-center justify-between gap-2">
              {t('plans.boosterStartsAt')}
              <TextInput
                size="md"
                type="datetime-local"
                placeholder={t('plans.boosterStartsNow')}
                value={startsAtField.inputValue}
                onChange={(e) => startsAtField.onChange(e.target.value)}
                onBlur={startsAtField.onBlur}
                className="min-w-0 flex-1"
              />
            </label>
          )}
          <label className="flex items-center justify-between gap-2">
            {t('plans.boosterExpiresAt')}
            <TextInput
              size="md"
              type="datetime-local"
              value={expiresAtField.inputValue}
              onChange={(e) => expiresAtField.onChange(e.target.value)}
              onBlur={expiresAtField.onBlur}
              className="min-w-0 flex-1"
            />
          </label>
          <div
            role="group"
            aria-label={t('plans.boosterQuickPicks')}
            className="flex flex-wrap gap-1"
          >
            {BOOSTER_QUICK_PICKS.map(({ hours }) => (
              <button
                key={hours}
                type="button"
                onClick={() =>
                  patch({ expiresAt: boosterExpiryFromNow(hours, row.startsAt ?? Date.now()) })
                }
                className={`${tappableRowClassName} rounded-xs border border-line px-1.5 text-[0.6875rem] text-text-dim hover:border-line-bright hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
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
        </>
      )}
    </div>
  );
}

export function BoosterList({ boosters, detectedAccelerator, onChange }: BoosterListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function patchRow(index: number, patch: Partial<PlanBooster>): boolean {
    const next = boosters.map((row, i) => (i === index ? { ...row, ...patch } : row));
    if (hasOverlappingBoosters(next)) return false;
    onChange(next);
    return true;
  }

  function removeRow(index: number): void {
    onChange(boosters.filter((_, i) => i !== index));
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
        <IconButton
          icon={<Icon.Market size={Icon.ICON_SIZE.sm} />}
          label={t('plans.boosterMarketLink')}
          onClick={() =>
            navigate(
              `/market/browser?${new URLSearchParams(buildMarketGroupParams(BOOSTER_MARKET_GROUP_ID)).toString()}`
            )
          }
          size="sm"
          variant="plain"
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
            rowKey={`booster-${index}`}
            row={row}
            detectedAccelerator={detectedAccelerator}
            // A start only matters for an accelerator queued behind another.
            showStart={index > 0 || row.startsAt !== null}
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
