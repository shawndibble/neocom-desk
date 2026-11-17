/**
 * The member list behind "Review a member": rows, filtering, who cannot be picked, and the role
 * suggestions. Pure; `useReviewRoster.ts` reads the roster, `MemberCombobox.tsx` draws it.
 */

export interface RosterMember {
  characterId: number;
  name: string;
  /** The member's first corp title, when titles could be read. */
  title?: string;
  /** Last seen (epoch ms), when member tracking could be read. */
  lastSeenMs?: number;
  /** Already has a review waiting: when it was asked, and by whom when the overview says. */
  waiting?: { at: number; by?: string };
  /** The officer themself. */
  you?: boolean;
}

/** Common EVE corporation roles, offered after the corp's own titles. */
export const EVE_ROLE_SUGGESTIONS = [
  'Director',
  'Personnel Manager',
  'Accountant',
  'Junior Accountant',
  'Station Manager',
  'Security Officer',
] as const;

/** A member with a review waiting, or the officer themself, stays listed but is not pickable. */
export function pickable(member: RosterMember): boolean {
  return !member.waiting && !member.you;
}

/** Flags the officer and members who already have a review waiting. */
export function markMembers(
  members: readonly RosterMember[],
  context: { selfId: number | null; waiting: ReadonlyMap<number, { at: number; by?: string }> }
): RosterMember[] {
  return members.map((member) => {
    const waiting = context.waiting.get(member.characterId);
    return {
      ...member,
      ...(waiting ? { waiting } : {}),
      ...(member.characterId === context.selfId ? { you: true } : {}),
    };
  });
}

/** Names starting with the query first, then names containing it; all members, by name, when empty. */
export function narrowMembers(members: readonly RosterMember[], query: string): RosterMember[] {
  const q = query.trim().toLowerCase();
  const byName = [...members].sort((a, b) => a.name.localeCompare(b.name));
  if (q === '') return byName;
  const starts = byName.filter((member) => member.name.toLowerCase().startsWith(q));
  const inside = byName.filter(
    (member) => !member.name.toLowerCase().startsWith(q) && member.name.toLowerCase().includes(q)
  );
  return [...starts, ...inside];
}

/** A name split around the query's first match, so the match can be bold. */
export function matchParts(
  name: string,
  query: string
): { before: string; match: string; after: string } {
  const q = query.trim();
  const at = q === '' ? -1 : name.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return { before: name, match: '', after: '' };
  return {
    before: name.slice(0, at),
    match: name.slice(at, at + q.length),
    after: name.slice(at + q.length),
  };
}

/** Role chips: the corp's titles first, then EVE roles that are not a title; typing narrows both. */
export function roleSuggestions(
  value: string,
  corpTitles: readonly string[],
  eveRoles: readonly string[] = EVE_ROLE_SUGGESTIONS
): { titles: string[]; roles: string[] } {
  const q = value.trim().toLowerCase();
  const fit = (list: readonly string[]) =>
    list.filter((role) => role.toLowerCase().includes(q) && role.toLowerCase() !== q);
  const titleKeys = new Set(corpTitles.map((title) => title.toLowerCase()));
  return {
    titles: fit(corpTitles),
    roles: fit(eveRoles.filter((role) => !titleKeys.has(role.toLowerCase()))),
  };
}
