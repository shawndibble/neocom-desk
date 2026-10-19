import type { PlanEntry } from '@/engine/types';

/**
 * One row of the ESI skill queue (GET /characters/{id}/skillqueue). Only
 * `skill_id`, `finished_level` and `queue_position` are guaranteed present —
 * every date and SP field is absent on a paused queue, so none may be
 * dereferenced without a check.
 */
export interface EsiSkillQueueEntry {
  skill_id: number;
  finished_level: number;
  queue_position: number;
  level_start_sp?: number;
  level_end_sp?: number;
  training_start_sp?: number;
  start_date?: string;
  finish_date?: string;
}

/**
 * Convert an ESI skill queue into plan entries, ordered by queue_position.
 * One entry per queue row; normalizePlan deduplicates overlapping levels.
 */
export function parseSkillQueue(queue: readonly EsiSkillQueueEntry[]): PlanEntry[] {
  if (!Array.isArray(queue)) {
    throw new TypeError('skill queue must be an array');
  }
  return queue
    .map((row) => {
      if (typeof row?.skill_id !== 'number') {
        throw new TypeError('skill queue row missing skill_id');
      }
      if (
        typeof row.finished_level !== 'number' ||
        !Number.isInteger(row.finished_level) ||
        row.finished_level < 1 ||
        row.finished_level > 5
      ) {
        throw new TypeError(`skill queue row has invalid finished_level for skill ${row.skill_id}`);
      }
      return row;
    })
    .sort((a, b) => a.queue_position - b.queue_position)
    .map((row) => ({ skillTypeID: row.skill_id, targetLevel: row.finished_level }));
}
