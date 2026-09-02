import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { loadCharacterSkillQueue, type CachedResult } from '../data';
import { classifySkillQueue, isQueuePaused, type SkillQueueStatus } from '../queueStatus';
import type { SkillCatalog } from '../skillMap';
import { formatDuration } from '@/lib/duration';

interface CurrentQueuePanelProps {
  characterId: number;
  catalog: SkillCatalog;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** Countdown recompute cadence; the display is minute-grained, so 30s is fresh enough. */
const TICK_MS = 30_000;

const BADGE_STYLE: Record<SkillQueueStatus, string> = {
  training: 'border-accent/50 bg-accent/15 text-accent',
  completed: 'border-success/50 bg-success/15 text-success',
  paused: 'border-warning/50 bg-warning/15 text-warning',
  pending: '',
};

const BADGE_KEY: Record<SkillQueueStatus, string | null> = {
  training: 'plans.queueTrainingBadge',
  completed: 'plans.queueDoneBadge',
  paused: 'plans.queuePausedBadge',
  pending: null,
};

/**
 * The character's actual in-game skill queue (not a Skill Plan): "what am I
 * training right now, and for how long."
 *
 * Times come from ESI's `finish_date`, never from a local recompute. ESI
 * knows the character's real current SP, so its dates are exact where a
 * schedule rebuilt from attributes would only estimate — and showing both
 * would put two disagreeing numbers on one screen.
 */
export function CurrentQueuePanel({ characterId, catalog }: CurrentQueuePanelProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<CachedResult<SkillQueueEntry[]> | null | undefined>(
    undefined
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void loadCharacterSkillQueue(characterId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => classifySkillQueue(result?.data ?? [], now), [result, now]);

  const completedCount = rows.filter((r) => r.status === 'completed').length;
  const paused = isQueuePaused(result?.data ?? []);
  // Time to drain the queue: the last row that still has a finish date.
  const totalSeconds = rows.reduce((max, r) => Math.max(max, r.secondsRemaining ?? 0), 0);

  const nameFor = (skillTypeID: number): string =>
    catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`;

  return (
    <Panel
      title={t('plans.currentQueueTitle')}
      actions={
        <span className="flex items-center gap-2 text-[0.6875rem] text-text-dim">
          {result?.fetchedAt && <DataAgeBadge date={result.fetchedAt} />}
          {totalSeconds > 0 && <span className="tabular-nums">{formatDuration(totalSeconds)}</span>}
        </span>
      }
    >
      {result === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t('plans.currentQueueEmpty')} className="py-4" />
      ) : (
        <div className="space-y-2">
          {completedCount > 0 && (
            // ESI keeps finished entries until the character next logs in, and
            // says /skills is wrong until then. Surfacing them is the fix it
            // documents, not a workaround.
            <p className="text-[0.6875rem] text-success uppercase">
              {t('plans.queueCompletedNote', { count: completedCount })}
            </p>
          )}
          {paused && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('plans.queuePausedNote')}</p>
          )}

          <ul className="rounded-xs border border-line">
            {rows.map(({ entry, status, secondsRemaining }) => {
              const badgeKey = BADGE_KEY[status];
              return (
                <li
                  key={`${entry.skill_id}-${entry.finished_level}-${entry.queue_position}`}
                  className={`flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
                    status === 'completed' ? 'text-text-faint' : ''
                  }`}
                >
                  <span className="flex-1 truncate">
                    {nameFor(entry.skill_id)} {ROMAN[entry.finished_level - 1]}
                  </span>
                  {badgeKey && (
                    <span
                      className={`rounded-xs border px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest uppercase ${BADGE_STYLE[status]}`}
                    >
                      {t(badgeKey)}
                    </span>
                  )}
                  {/* min-w, not w: "112d 12h 26m left" is 17 characters and
                      overran a fixed 6rem box, breaking "left" onto its own
                      line under every long-running skill. Short values still
                      line up at 6rem; a long one grows leftwards into the
                      name, which truncates rather than wrapping. */}
                  <span className="min-w-24 shrink-0 text-right tabular-nums whitespace-nowrap text-text-dim">
                    {secondsRemaining === null
                      ? ''
                      : t('plans.queueRemaining', {
                          duration: formatDuration(secondsRemaining),
                        })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
