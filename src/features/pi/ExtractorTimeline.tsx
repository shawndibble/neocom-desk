/**
 * Every authenticated Character's extractor programs on one worst-first
 * timeline — the surface that answers "when must I next touch this, and on
 * which character".
 *
 * **A CSS grid, not an SVG.** The mockup this came from drew an SVG Gantt;
 * that needs a second, different DOM to work at 390px, and docs/DESIGN.md §4a
 * forbids exactly that pair. Each row is its own grid: one column below `sm`
 * (label above a full-width track), two columns above it (label beside the
 * track). Same DOM at every width — there is no `sm:hidden`/`hidden sm:block`
 * anywhere in this file, and `ExtractorTimeline.test.tsx` asserts that against
 * the source rather than trusting the reading.
 *
 * Ordering is `sortColoniesByAttention`'s, applied to a one-program colony per
 * row, rather than a second ranking invented here that could drift from the
 * colony panels below.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, StatChip } from '@/components/ui';
import { extractorState, colonyStatus, sortColoniesByAttention } from '@/engine/pi/colonyStatus';
import { fractionOfFirstDayRate, hasYieldBaseline } from '@/engine/pi/extraction';
import type { ColonyStatus, ExtractorState } from '@/engine/pi/types';
import { formatDuration } from '@/lib/duration';
import type { PiRosterSnapshot, RosterCharacter, TimelineProgram } from './roster';
import { programBarGeometry, TIMELINE_WINDOW_MS } from './timelineGeometry';

const DAY_MS = 86_400_000;

const FILL: Record<ExtractorState, string> = {
  active: 'bg-success',
  'expiring-soon': 'bg-warning',
  expired: 'bg-danger',
};

const TIME_CLASS: Record<ExtractorState, string> = {
  active: 'text-text-dim',
  'expiring-soon': 'text-warning',
  expired: 'text-danger',
};

interface TimelineRow {
  entry: TimelineProgram;
  status: ColonyStatus;
}

interface TimelineRowProps {
  row: TimelineRow;
  nowMs: number;
}

function ProgramRow({ row, nowMs }: TimelineRowProps) {
  const { t } = useTranslation();
  const { entry, status } = row;
  const expiryMs = entry.program.expiryTimeMs;
  const state = extractorState(expiryMs, nowMs);
  const { leftPercent, widthPercent, capped } = programBarGeometry(expiryMs, nowMs);

  const planetLabel = entry.planetName ?? t('pi.planetLabel', { id: entry.planetId });
  const timeText =
    state === 'expired'
      ? t('pi.expired')
      : t('pi.expiresIn', { duration: formatDuration((expiryMs - nowMs) / 1000) });

  // The bar's colour is never the only signal (docs/DESIGN.md §7): "Expired"
  // is spelled out in the time column, and the two states that outrank a
  // healthy program in the sort — expiring-soon and decayed — say so in words,
  // so a row's position in the list is always explained by its own text.
  // Mirrors `colonyAttention`'s idle → expiring-soon → decayed precedence:
  // an expired program is this row's "idle" (the time column already says
  // "Expired"), so it is checked first and short-circuits before either of
  // the other two — an expired-and-decayed program never doubles up as
  // "Expired · Decayed".
  const tag =
    state === 'expired'
      ? null
      : state === 'expiring-soon'
        ? t('pi.state.expiring-soon')
        : status.decayed === true
          ? t('pi.attention.decayed')
          : null;

  // Bar length alone reads as the only signal, but output decays hard over a
  // program's life (100/55/38/30/24/20/17...9% across 14 days) — a bar with
  // days left can be nearly dead while one with little time left is still
  // the most productive planet on the account. This is the trailing day's
  // output over the program's own first day (`fractionOfFirstDayRate`,
  // #316), i.e. how far this program has fallen from its own peak, not an
  // absolute quantity. Absent a baseline the program carries no such
  // reading at all — never rendered as a misleading 0%.
  const yieldText = hasYieldBaseline(entry.program)
    ? t('pi.timeline.peakShareValue', {
        percent: Math.round(fractionOfFirstDayRate(entry.program, nowMs) * 100),
      })
    : null;

  return (
    <li className="grid grid-cols-1 gap-x-3 gap-y-1 py-1 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-center">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className="truncate text-xs font-medium">{entry.characterName}</span>
        <span className="truncate text-[0.6875rem] text-text-dim">{planetLabel}</span>
        {entry.productName && (
          <span className="truncate text-[0.6875rem] text-text-dim">{entry.productName}</span>
        )}
      </div>
      {/*
        `flex-wrap` (already the label row's pattern above) is what lets a
        third data point — the yield read — drop to its own line rather than
        forcing horizontal scroll at 390px: the track keeps a small `min-w`
        of its own instead of `min-w-0`, so once the row runs out of room the
        browser wraps the overflow item rather than squeezing the track to
        nothing.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <div
          // `overflow-hidden` is a second guard on the clamp: even if the
          // percentage were ever wrong, the bar cannot escape its track.
          className="relative h-2 min-w-[2rem] flex-1 overflow-hidden rounded-xs bg-panel-2"
          aria-hidden="true"
        >
          <div
            // `min-w` is what turns an expired program's zero width into a
            // visible stub at the now-edge.
            className={`absolute inset-y-0 min-w-[3px] rounded-xs ${FILL[state]} motion-safe:transition-[width] motion-safe:duration-300`}
            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
          />
          {capped && <span className="absolute inset-y-0 right-0 w-px bg-line-bright" />}
        </div>
        <span className={`shrink-0 text-[0.6875rem] tabular-nums ${TIME_CLASS[state]}`}>
          {timeText}
        </span>
        {tag && (
          <span className="shrink-0 text-[0.6875rem] tracking-wide text-text-dim uppercase">
            {tag}
          </span>
        )}
        {yieldText && (
          <span className="shrink-0 text-[0.6875rem] tabular-nums text-text-dim">{yieldText}</span>
        )}
      </div>
    </li>
  );
}

function names(characters: readonly RosterCharacter[]): string {
  return characters.map((character) => character.name).join(', ');
}

export interface ExtractorTimelineProps {
  snapshot: PiRosterSnapshot;
  /** The route loader's `loadedAt` — never `Date.now()`, which React forbids in render. */
  nowMs: number;
}

export function ExtractorTimeline({ snapshot, nowMs }: ExtractorTimelineProps) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const withStatus = snapshot.programs.map((entry): TimelineRow => ({
      entry,
      status: colonyStatus([entry.program], nowMs),
    }));
    return sortColoniesByAttention(withStatus, (row) => row.status, nowMs);
  }, [snapshot.programs, nowMs]);

  const idleCount = rows.filter((row) => row.status.idle).length;
  const nextExpiryMs = rows
    .map((row) => row.entry.program.expiryTimeMs)
    .filter((expiryMs) => expiryMs > nowMs)
    .reduce<number | null>((soonest, expiryMs) => Math.min(soonest ?? expiryMs, expiryMs), null);

  return (
    <Panel
      title={t('pi.timeline.title')}
      actions={
        <div className="flex flex-wrap items-center gap-1">
          <StatChip label={t('pi.timeline.coloniesStat')} value={snapshot.colonyCount} />
          <StatChip
            label={t('pi.timeline.idleStat')}
            value={idleCount}
            tone={idleCount > 0 ? 'danger' : 'default'}
          />
          <StatChip
            label={t('pi.timeline.nextExpiryStat')}
            value={
              nextExpiryMs === null
                ? t('pi.timeline.noneValue')
                : formatDuration((nextExpiryMs - nowMs) / 1000)
            }
          />
          <StatChip
            label={t('pi.timeline.skippedStat')}
            value={snapshot.skipped.length}
            tone={snapshot.skipped.length > 0 ? 'warning' : 'default'}
            tooltip={t('pi.timeline.skippedTooltip')}
          />
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('pi.timeline.emptyTitle')}
          hint={t('pi.timeline.emptyHint')}
          className="py-6"
        />
      ) : (
        <>
          <p className="mb-2 text-[0.6875rem] text-text-dim">
            {t('pi.timeline.windowHint', { days: TIMELINE_WINDOW_MS / DAY_MS })}
          </p>
          <ul aria-label={t('pi.timeline.listLabel')} className="divide-y divide-line">
            {rows.map(({ entry, status }) => (
              <ProgramRow
                key={`${entry.characterId}:${entry.planetId}:${entry.program.pinId}`}
                row={{ entry, status }}
                nowMs={nowMs}
              />
            ))}
          </ul>
        </>
      )}

      {/*
        Four different facts, stated as four different lines. A Character with
        nothing cached is not one with no colonies, and neither is one whose
        token never granted planetary access — collapsing any two of them into
        a single "nothing here" is the misreport this panel exists to avoid.
      */}
      {(snapshot.notLoaded.length > 0 ||
        snapshot.noColonies.length > 0 ||
        snapshot.skipped.length > 0 ||
        snapshot.coloniesWithoutDetail > 0) && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-[0.6875rem] text-text-dim">
          {snapshot.notLoaded.length > 0 && (
            <li>{t('pi.timeline.notLoaded', { names: names(snapshot.notLoaded) })}</li>
          )}
          {snapshot.coloniesWithoutDetail > 0 && (
            <li>{t('pi.timeline.coloniesNotLoaded', { count: snapshot.coloniesWithoutDetail })}</li>
          )}
          {snapshot.noColonies.length > 0 && (
            <li>{t('pi.timeline.noColonies', { names: names(snapshot.noColonies) })}</li>
          )}
          {snapshot.skipped.length > 0 && (
            <li className="text-warning">
              {t('pi.timeline.skipped', { names: names(snapshot.skipped) })}
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}
