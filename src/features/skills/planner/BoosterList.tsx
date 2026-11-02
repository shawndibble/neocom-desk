/**
 * The Booster (GLOSSARY.md) control: an ordered list of cerebral accelerators
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
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import * as Icon from '@/components/ui/icons';
import type { PlanBooster } from '@/db';
import { AcceleratorFields } from '@/features/accelerator/AcceleratorFields';
import { MarketGroupLink } from './MarketGroupLink';
import { CEREBRAL_ACCELERATORS_MARKET_GROUP_ID } from './plannerMarketGroups';
import {
  DEFAULT_PLAN_BOOSTER,
  hasOverlappingBoosters,
  linkBoosterChain,
  rebaseBooster,
} from './planBooster';

interface BoosterListProps {
  boosters: readonly PlanBooster[];
  /** From `attributeBaseline.ts`; prefills the first row and drives the "detected" notice. */
  detectedAccelerator: number | null;
  /** Never called with a list `hasOverlappingBoosters` — the caller can trust every commit. */
  onChange: (boosters: PlanBooster[]) => void;
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
  const overlapId = useId();

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

  // eslint-disable-next-line react-hooks/purity -- display-only "expired" hint, same as PlanEditor's own clock read
  const expired = row.expiresAt !== null && row.expiresAt <= Date.now();

  const overlapping = rejected || overlaps;
  const overlapProps = overlapping
    ? { 'aria-invalid': true as const, 'aria-describedby': overlapId }
    : undefined;

  return (
    <div className="space-y-2 border-l border-line pl-2">
      <div className="flex items-center justify-between gap-2">
        {/* No on/off box: a listed row is live, and the X is how it goes off. */}
        <span>{t('plans.boosterRowLabel', { position })}</span>
        <IconButton
          icon={<Icon.Close size={Icon.ICON_SIZE.sm} />}
          data-booster-remove={position}
          label={t('plans.boosterRemoveNamed', { position })}
          tooltip={t('plans.boosterRemove')}
          onClick={onRemove}
          size="sm"
          variant="plain"
          tone="danger"
        />
      </div>
      <AcceleratorFields
        bonus={row.bonus}
        expiresAt={row.expiresAt}
        startsAt={startsAt}
        onBonusChange={(bonus) => patch({ bonus })}
        onExpiresChange={(expiresAt) => patch({ expiresAt })}
        invalidProps={overlapProps}
      />
      {position > 1 && (
        <p className="text-[0.6875rem] text-text-dim">{t('plans.boosterStartsAfterPrevious')}</p>
      )}
      {overlapping && (
        <p id={overlapId} role="alert" className="text-warning">
          {t('plans.boosterOverlap')}
        </p>
      )}
      {detectedAccelerator !== null && row.expiresAt === null && (
        <p className="text-warning">{t('plans.boosterDetectedNoExpiry')}</p>
      )}
      {expired && <p className="text-warning">{t('plans.boosterExpired')}</p>}
    </div>
  );
}

export function BoosterList({ boosters, detectedAccelerator, onChange }: BoosterListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const focusAfterCommit = useFocusAfterCommit();

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
    // The row's Remove button is gone: the previous row's, else "Add accelerator" (WCAG 2.4.3).
    focusAfterCommit(
      () => listRef.current?.querySelector<HTMLElement>(`[data-booster-remove="${index}"]`),
      () => listRef.current?.querySelector<HTMLElement>('[data-booster-add]')
    );
  }

  function addRow(): void {
    // Starts where the last row's window ends, so appending naturally
    // continues the sequence instead of landing back on "now".
    const previousExpiry = boosters.at(-1)?.expiresAt ?? null;
    onChange([...boosters, { ...DEFAULT_PLAN_BOOSTER, enabled: true, startsAt: previousExpiry }]);
  }

  return (
    <div ref={listRef} className="space-y-2">
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
      <Button size="sm" variant="ghost" onClick={addRow} data-booster-add>
        <Icon.AddRow size={Icon.ICON_SIZE.sm} />
        {t('plans.boosterAdd')}
      </Button>
    </div>
  );
}
