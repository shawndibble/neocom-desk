export interface RosterMember {
  characterId: number;
  name: string;
  title?: string;
  lastSeenMs?: number;
  waiting?: { at: number; by?: string };
  you?: boolean;
}

export const EVE_ROLE_SUGGESTIONS = [
  'Director',
  'Personnel Manager',
  'Accountant',
  'Junior Accountant',
  'Station Manager',
  'Security Officer',
] as const;

export function pickable(member: RosterMember): boolean {
  return !member.waiting && !member.you;
}

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
