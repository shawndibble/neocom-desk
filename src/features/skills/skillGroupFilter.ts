import { rankedSearch } from '@/lib/rankedSearch';
interface FilterableGroup {
  groupName: string;
  skills: readonly { name: string }[];
}

export const SKILL_GROUP_SEARCH_MIN_QUERY_LENGTH = 3;

export interface SkillGroupFilterResult<G extends FilterableGroup = FilterableGroup> {
  visibleGroupNames: ReadonlySet<string>;
  matchedSkillsByGroup: ReadonlyMap<string, G['skills']>;
}

export function filterSkillGroups<G extends FilterableGroup>(
  groups: readonly G[],
  query: string
): SkillGroupFilterResult<G> | null {
  if (query.trim().length < SKILL_GROUP_SEARCH_MIN_QUERY_LENGTH) return null;

  const visibleGroupNames = new Set<string>();
  const matchedSkillsByGroup = new Map<string, G['skills']>();
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
