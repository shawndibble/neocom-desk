import { romanLevel } from '@/engine/projection';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/components/ui';
import type { OptimizeForMeResult, RemapSegment } from '@/engine/optimizer';
import type { StepKey } from '@/engine/skills/skillPlanSchedule';
import type { Implants, PlanStep } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { useTimeZone } from '@/lib/timeFormat';
import { yearlyRemapAfterNote } from './optimizeHelpers';
import type { OptimizeVerdict } from './optimizeVerdict';
import { remapInstruction } from './remapInstruction';

interface RemapSegmentListProps {
  segments: readonly RemapSegment[];
  /** Resolves a segment's first step: by live-schedule key for an applied order, or directly by `startIndex` for a hypothetical one (Optimize for me's preview, not yet applied). */
  anchorAt: (segment: RemapSegment, index: number) => PlanStep | undefined;
  /** Set only for an Optimize Remaps run that spent the on-cooldown yearly slot. */
  yearlyRemapAfter?: Date;
  stepLabel: (step: PlanStep) => string;
  implants: Implants;
}

// Shared per-segment rendering for both optimize modes: a remapped segment
// gets the remap instruction; the leading current-attributes segment
// (remap: false) is labeled as "keep current attributes" instead.
function RemapSegmentList({
  segments,
  anchorAt,
  yearlyRemapAfter,
  stepLabel,
  implants,
}: RemapSegmentListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const lastRemapIndex = yearlyRemapAfter
    ? segments.reduce((last, segment, index) => (segment.remap ? index : last), -1)
    : -1;
  return (
    <ul className="space-y-1">
      {segments.map((segment, index) => {
        const anchor = anchorAt(segment, index);
        if (!anchor) return null;
        return (
          <li key={index} className="space-y-0.5 border-b border-line pb-1 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{t('plans.segment', { index: index + 1 })}</span>
              <span className="tabular-nums text-text-dim">{formatCountdown(segment.seconds)}</span>
            </div>
            <p className="text-text-dim">
              {segment.remap
                ? t('plans.segmentRemap', {
                    skill: stepLabel(anchor),
                    attributes: remapInstruction(segment.attributes, implants),
                  })
                : t('plans.segmentCurrent', { skill: stepLabel(anchor) })}
            </p>
            {index === lastRemapIndex && yearlyRemapAfter && (
              <p className="text-text-dim">{yearlyRemapAfterNote(t, yearlyRemapAfter, timeZone)}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface RemapPreviewModalProps {
  title: string;
  open: boolean;
  verdict: OptimizeVerdict | null;
  segments: {
    segments: readonly RemapSegment[];
    anchorKeys: readonly (StepKey | undefined)[];
    yearlyRemapAfter?: Date;
  } | null;
  message: string;
  onAccept: () => void;
  onClose: () => void;
  /** The live schedule's steps by key — what each segment's `anchorKeys` entry resolves through. */
  stepByKey: ReadonlyMap<StepKey, PlanStep>;
  stepLabel: (step: PlanStep) => string;
  implants: Implants;
}

/**
 * Shared shape of the two Accept/Reject preview Modals: like
 * "Suggest reorder"'s Modal, this opens on every click, not only when
 * there is something to accept. A `saves` verdict gets the figure, its
 * segments, and both actions; every other verdict gets its explanatory
 * text (and, for "Optimize at my markers", still its segments — see the
 * caller) with a single dismiss action, since there is nothing to accept.
 * `message` and `segments` are resolved by the caller rather than derived
 * here: the same verdict `kind` reads differently depending on which
 * action produced it (e.g. `noGain` blames the entry order for a search,
 * but blames marker placement for markers already placed).
 */
export function RemapPreviewModal({
  title,
  open,
  verdict,
  segments,
  message,
  onAccept,
  onClose,
  stepByKey,
  stepLabel,
  implants,
}: RemapPreviewModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {verdict && (
        <div className="space-y-2 text-xs">
          {verdict.kind === 'saves' ? (
            <p className="font-semibold text-success">
              {t('plans.remapSaves', { duration: formatCountdown(verdict.savingsSeconds) })}
            </p>
          ) : (
            <p className="text-text-dim">{message}</p>
          )}
          {segments && (
            <div className="max-h-56 overflow-y-auto">
              <RemapSegmentList
                segments={segments.segments}
                anchorAt={(_segment, index) => {
                  const key = segments.anchorKeys[index];
                  return key === undefined ? undefined : stepByKey.get(key);
                }}
                yearlyRemapAfter={segments.yearlyRemapAfter}
                stepLabel={stepLabel}
                implants={implants}
              />
            </div>
          )}
          <div className="flex gap-2">
            {verdict.kind === 'saves' && (
              <Button variant="primary" size="sm" onClick={onAccept}>
                {t('plans.remapAccept')}
              </Button>
            )}
            <Button size="sm" onClick={onClose}>
              {verdict.kind === 'saves' ? t('plans.remapReject') : t('plans.remapDismiss')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface OptimizeForMeModalProps {
  /** Null while closed. */
  preview: OptimizeForMeResult | null;
  /** The plan's current total, shown as the "before" of the before/after line. */
  totalSeconds: number;
  nameFor: (skillTypeID: number) => string;
  stepLabel: (step: PlanStep) => string;
  implants: Implants;
  onAccept: () => void;
  onReject: () => void;
}

/** The "Optimize for me" Accept/Reject preview: new order and remap segments together. */
export function OptimizeForMeModal({
  preview,
  totalSeconds,
  nameFor,
  stepLabel,
  implants,
  onAccept,
  onReject,
}: OptimizeForMeModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={preview !== null} onClose={onReject} title={t('plans.optimizeForMeTitle')}>
      {preview && (
        <div className="space-y-2 text-xs">
          <p className="font-semibold text-success">
            {t('plans.optimizeForMeTotal', {
              before: formatCountdown(totalSeconds),
              after: formatCountdown(preview.remaps.totalSeconds),
            })}
          </p>
          <ul className="max-h-56 overflow-y-auto">
            {preview.order.map((step, i) => (
              <li
                key={`${step.skillTypeID}-${step.level}-${i}`}
                className="border-b border-line py-1 last:border-b-0"
              >
                {nameFor(step.skillTypeID)} {romanLevel(step.level)}
              </li>
            ))}
          </ul>
          <div className="max-h-56 overflow-y-auto">
            <RemapSegmentList
              segments={preview.remaps.segments}
              anchorAt={(segment) => preview.order[segment.startIndex]}
              stepLabel={stepLabel}
              implants={implants}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={onAccept}>
              {t('plans.remapAccept')}
            </Button>
            <Button size="sm" onClick={onReject}>
              {t('plans.remapReject')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
