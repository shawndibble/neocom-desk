/**
 * Filters the Trained Skills groups by skill name, following the Market
 * Browser's search pattern: a group with no matching skill disappears
 * entirely, one with a match stays and shows only its matches. Pure and
 * synchronous — a group list is small enough that the caller filters on
 * every keystroke rather than debouncing.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import type { SkillGroup } from './skillsCsv';

/** Search starts filtering groups at this many characters (CONTEXT.md; matches the Market Browser). */
export const SKILL_GROUP_SEARCH_MIN_QUERY_LENGTH = 3;

export interface SkillGroupFilterResult {
  /** Group names that have at least one matching skill. */
  visibleGroupNames: ReadonlySet<string>;
  /** Matching skills per surviving group, keyed by group name. */
  matchedSkillsByGroup: ReadonlyMap<string, SkillGroup['skills']>;
}

/**
 * Null means "no filter active" (query under SKILL_GROUP_SEARCH_MIN_QUERY_LENGTH) —
 * the caller renders every group at its own collapse state, in full.
 */
export function filterSkillGroups(
  groups: readonly SkillGroup[],
  query: string
): SkillGroupFilterResult | null {
  if (query.trim().length < SKILL_GROUP_SEARCH_MIN_QUERY_LENGTH) return null;

  const visibleGroupNames = new Set<string>();
  const matchedSkillsByGroup = new Map<string, SkillGroup['skills']>();
  for (const group of groups) {
    const matches = rankedSearch(group.skills, query, {
      primary: (skill) => skill.name,
      limit: Infinity,
    });
    if (matches.length === 0) continue;
    visibleGroupNames.add(group.groupName);
    matchedSkillsByGroup.set(group.groupName, matches);
  }
  return { visibleGroupNames, matchedSkillsByGroup };
}
