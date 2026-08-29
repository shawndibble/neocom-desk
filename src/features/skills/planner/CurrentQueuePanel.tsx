import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, Panel, Spinner } from '@/components/ui';
import { computeSchedule } from '@/engine/schedule';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { Attributes, Implants, PlanStep, ScheduledStep } from '@/engine/types';
import { loadCharacterSkillQueue, type CachedResult } from '../data';
import type { SkillCatalog } from '../skillMap';
import { ComputedQueue } from './ComputedQueue';
import { formatDuration } from './duration';

interface CurrentQueuePanelProps {
  characterId: number;
  catalog: SkillCatalog;
  attributes: Attributes;
  implants: Implants;
}

/**
 * The character's actual in-game skill queue (not a Skill Plan): "what am I
 * training right now, and for how long." Surfaced above the plan list since
 * "see my current queue" is a primary use of this page.
 */
export function CurrentQueuePanel({
  characterId,
  catalog,
  attributes,
  implants,
}: CurrentQueuePanelProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<CachedResult<SkillQueueEntry[]> | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    void loadCharacterSkillQueue(characterId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  const { scheduled, error, queuedSkillTypeIDs } = useMemo(() => {
    if (!result?.data) {
      return {
        scheduled: [] as ScheduledStep[],
        error: null as string | null,
        queuedSkillTypeIDs: new Set<number>(),
      };
    }
    // The in-game queue is already a validated, ordered sequence: schedule its
    // rows directly rather than running them back through normalizePlan.
    const steps: PlanStep[] = [...result.data]
      .sort((a, b) => a.queue_position - b.queue_position)
      .filter((row) => catalog.engineSkills.has(row.skill_id))
      .map((row) => ({ skillTypeID: row.skill_id, level: row.finished_level }));
    try {
      const scheduled = computeSchedule(steps, { attributes, implants }, catalog.engineSkills);
      return {
        scheduled,
        error: null,
        queuedSkillTypeIDs: new Set(steps.map((s) => s.skillTypeID)),
      };
    } catch (err) {
      return {
        scheduled: [],
        error: err instanceof Error ? err.message : String(err),
        queuedSkillTypeIDs: new Set<number>(),
      };
    }
  }, [result, catalog, attributes, implants]);

  const nameFor = (skillTypeID: number): string =>
    catalog.bySkillTypeID.get(skillTypeID)?.name ?? `#${skillTypeID}`;
  const totalSeconds = scheduled.length > 0 ? scheduled[scheduled.length - 1].cumulativeSeconds : 0;

  return (
    <Panel
      title={t('plans.currentQueueTitle')}
      actions={
        <span className="flex items-center gap-2 text-[11px] text-text-dim">
          {result?.fetchedAt && <DataAgeBadge date={result.fetchedAt} />}
          {scheduled.length > 0 && (
            <span className="tabular-nums">{formatDuration(totalSeconds)}</span>
          )}
        </span>
      }
    >
      {result === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : error ? (
        <p className="text-xs text-danger">{t('plans.computeError', { message: error })}</p>
      ) : !result?.data || scheduled.length === 0 ? (
        <EmptyState title={t('plans.currentQueueEmpty')} className="py-4" />
      ) : (
        <ComputedQueue steps={scheduled} nameFor={nameFor} userSkillTypeIDs={queuedSkillTypeIDs} />
      )}
    </Panel>
  );
}
