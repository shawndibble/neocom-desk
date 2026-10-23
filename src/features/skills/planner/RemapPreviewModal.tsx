import { Fragment, useState } from 'react';
import { romanLevel } from '@/engine/projection';
import { useTranslation } from 'react-i18next';
import { Button, Eyebrow, Modal, SegmentedControl } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { Ascending, Descending } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import type { OptimizeForMeResult, RemapSegment } from '@/engine/optimizer';
import type { StepKey } from '@/engine/skills/skillPlanSchedule';
import type { Implants, PlanStep } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { useTimeZone } from '@/lib/timeFormat';
import { yearlyRemapAfterNote } from './optimizeHelpers';
import type { OptimizeVerdict } from './optimizeVerdict';
import { compareOrders, type CurrentCompareRow, type ProposedCompareRow } from './optimizeCompare';
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
  /** The plan as it stands, in training order: the "Current" side. */
  currentOrder: readonly PlanStep[];
  /** The plan's current total, shown as the "before" of the before/after line. */
  totalSeconds: number;
  nameFor: (skillTypeID: number) => string;
  stepLabel: (step: PlanStep) => string;
  implants: Implants;
  onAccept: () => void;
  onReject: () => void;
}

type CompareSide = 'current' | 'proposed';

/** Words for a screen reader and the tooltip-free eye alike: the arrow is never the only cue. */
function MovedPill({ from, position }: { from: number; position: number }) {
  const { t } = useTranslation();
  const up = position < from;
  const Icon = up ? Ascending : Descending;
  const count = Math.abs(from - position);
  return (
    <Pill tone="warning" className="inline-flex shrink-0 items-center gap-0.5">
      <Icon aria-hidden size={10} />
      <span aria-hidden>{count}</span>
      <span className="sr-only">
        {t(up ? 'plans.compareMovedUp' : 'plans.compareMovedDown', { count })}
      </span>
    </Pill>
  );
}

/**
 * Rows of both lists share one grid so a row is as tall on the left as on the
 * right: a Remap Marker in Optimized gets a blank spacer opposite it in
 * Current, and the pilot never reads a taller row as a skill added from nowhere.
 * Below `md` only the chosen side shows, so the other side's cells are hidden.
 */
const ROW_BASE = 'flex min-h-8 items-center gap-2 border-b border-line px-2 py-1 text-xs';
const sideClass = (own: CompareSide, shown: CompareSide) =>
  cx(own === 'current' ? 'md:col-start-1' : 'md:col-start-2', own !== shown && 'max-md:hidden');

function CurrentRow({
  row,
  gridRow,
  shown,
  nameFor,
}: {
  row: CurrentCompareRow;
  gridRow: number;
  shown: CompareSide;
  nameFor: (id: number) => string;
}) {
  const { t } = useTranslation();
  const { step, position, movesTo } = row;
  return (
    <li
      style={{ gridRow }}
      className={cx(ROW_BASE, sideClass('current', shown), movesTo !== null && 'bg-warning/10')}
    >
      <span className="w-5 shrink-0 tabular-nums text-text-dim">{position}</span>
      <span className={cx('min-w-0 flex-1 truncate', movesTo !== null && 'font-semibold')}>
        {nameFor(step.skillTypeID)} {romanLevel(step.level)}
      </span>
      {movesTo !== null && (
        <span className="shrink-0 text-text-dim">
          {t('plans.compareMovesTo', { position: movesTo })}
        </span>
      )}
    </li>
  );
}

function ProposedRow({
  row,
  gridRow,
  shown,
  nameFor,
  stepLabel,
  implants,
}: {
  row: ProposedCompareRow;
  gridRow: number;
  shown: CompareSide;
  nameFor: (id: number) => string;
  stepLabel: (step: PlanStep) => string;
  implants: Implants;
}) {
  const { t } = useTranslation();
  if (row.kind === 'remap') {
    return (
      <li
        style={{ gridRow }}
        className={cx(
          'border-b border-dashed border-accent bg-accent/10 px-2 py-1 text-xs text-accent',
          sideClass('proposed', shown)
        )}
      >
        <span className="font-semibold">{t('plans.compareNewMarker')}</span>{' '}
        {t('plans.segmentRemap', {
          skill: stepLabel(row.before),
          attributes: remapInstruction(row.segment.attributes, implants),
        })}
      </li>
    );
  }
  const moved = row.from !== null;
  return (
    <li
      style={{ gridRow }}
      className={cx(ROW_BASE, sideClass('proposed', shown), moved && 'bg-warning/10')}
    >
      <span className="w-5 shrink-0 tabular-nums text-text-dim">{row.position}</span>
      <span className={cx('min-w-0 flex-1 truncate', moved && 'font-semibold')}>
        {nameFor(row.step.skillTypeID)} {romanLevel(row.step.level)}
      </span>
      {row.from !== null && <MovedPill from={row.from} position={row.position} />}
    </li>
  );
}

/**
 * The "Optimize for me" Accept/Reject preview: the plan as it is and as the
 * optimizer would leave it, side by side (stacked behind a switch on a phone),
 * so the pilot sees what moved and where the remap markers land.
 */
export function OptimizeForMeModal({
  preview,
  currentOrder,
  totalSeconds,
  nameFor,
  stepLabel,
  implants,
  onAccept,
  onReject,
}: OptimizeForMeModalProps) {
  const { t } = useTranslation();
  const [side, setSide] = useState<CompareSide>('proposed');
  const rows = preview ? compareOrders(currentOrder, preview.order, preview.remaps.segments) : null;
  const before = formatCountdown(totalSeconds);
  const after = preview ? formatCountdown(preview.remaps.totalSeconds) : '';
  const saved = preview ? totalSeconds - preview.remaps.totalSeconds : 0;
  const moved = rows ? rows.current.filter((r) => r.movesTo !== null).length : 0;
  const markers = rows ? rows.proposed.filter((r) => r.kind === 'remap').length : 0;
  return (
    <Modal
      open={preview !== null}
      onClose={onReject}
      title={t('plans.optimizeForMeTitle')}
      placement="wide"
      footer={
        preview && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              <span className="font-semibold text-success">
                {t('plans.optimizeForMeTotal', { before, after })}
              </span>
              <span className="text-text-dim">
                {saved > 0 && ` · ${t('plans.compareSaves', { duration: formatCountdown(saved) })}`}
                {` · ${t('plans.compareMoved', { count: moved })}`}
                {` · ${t('plans.compareMarkers', { count: markers })}`}
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onAccept}>
                {t('plans.remapAccept')}
              </Button>
              <Button size="sm" onClick={onReject}>
                {t('plans.remapReject')}
              </Button>
            </div>
          </div>
        )
      }
    >
      {rows && (
        <div className="space-y-2">
          <div className="md:hidden">
            <SegmentedControl
              label={t('plans.compareView')}
              fill
              value={side}
              onChange={setSide}
              options={[
                { value: 'current', label: t('plans.compareCurrentTab') },
                { value: 'proposed', label: t('plans.compareOptimizedTab') },
              ]}
            />
          </div>
          <div className="grid md:grid-cols-[1fr_1fr] md:gap-x-4">
            <Eyebrow
              className={cx('col-start-1 row-start-1 pb-1', side !== 'current' && 'max-md:hidden')}
            >
              {t('plans.compareCurrent', { total: before })}
            </Eyebrow>
            <Eyebrow
              className={cx(
                'col-start-1 row-start-1 pb-1 md:col-start-2',
                side !== 'proposed' && 'max-md:hidden'
              )}
            >
              {t('plans.compareOptimized', { total: after })}
            </Eyebrow>
            <ol className="contents">
              {(() => {
                // Current's row k sits opposite Optimized's row k; a marker row has a spacer opposite.
                let currentIndex = 0;
                return rows.proposed.map((row, k) => {
                  const gridRow = k + 2;
                  const current = row.kind === 'step' ? rows.current[currentIndex++] : undefined;
                  return (
                    <Fragment key={k}>
                      {current ? (
                        <CurrentRow
                          row={current}
                          gridRow={gridRow}
                          shown={side}
                          nameFor={nameFor}
                        />
                      ) : (
                        <li
                          aria-hidden
                          style={{ gridRow }}
                          className="md:col-start-1 max-md:hidden"
                        />
                      )}
                      <ProposedRow
                        row={row}
                        gridRow={gridRow}
                        shown={side}
                        nameFor={nameFor}
                        stepLabel={stepLabel}
                        implants={implants}
                      />
                    </Fragment>
                  );
                });
              })()}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
