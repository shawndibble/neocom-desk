/**
 * The one rule for "the level this character can use right now" (issue
 * #1236): the lower of the queue-corrected trained level and the
 * queue-corrected active level. PI, industry job cost/time, job slots and
 * the clone jump cooldown all read through this instead of picking one side
 * ad hoc — trained alone overstates an alpha-capped or lapsed-omega
 * character, active alone understates a level the queue just finished but
 * `/skills` hasn't caught up to yet.
 */
export function effectiveSkillLevel(trainedLevel: number, activeLevel: number): number {
  return Math.min(trainedLevel, activeLevel);
}
