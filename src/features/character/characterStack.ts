/**
 * Most faces the Character picker's "All characters" trigger draws from `md`
 * up; the rest is a "+N" chip. Below `md` the trigger draws
 * `STACK_MAX_FACES_NARROW`, so a phone header keeps room for its title.
 */
export const STACK_MAX_FACES = 3;
export const STACK_MAX_FACES_NARROW = 2;

/**
 * The faces on the "All characters" trigger: the Characters "All" covers
 * (`onlyIds` when the page names its own set, else the whole roster, minus
 * any named in `missingNames`), the active one first and then roster order,
 * capped at `maxFaces`; `extra` is how many more are covered than drawn. An
 * id in `onlyIds` the roster doesn't know yet goes after the known ones.
 */
export function characterStack(
  roster: readonly { characterId: number; name: string }[],
  activeCharacterId: number | null,
  missingNames: readonly string[] = [],
  maxFaces: number = STACK_MAX_FACES,
  onlyIds?: readonly number[]
): { faces: number[]; extra: number } {
  const missing = new Set(missingNames);
  const only = onlyIds ? new Set(onlyIds) : null;
  const known = new Set(roster.map((c) => c.characterId));
  const included = [
    ...roster
      .filter((c) => !missing.has(c.name) && (only === null || only.has(c.characterId)))
      .map((c) => c.characterId),
    ...(onlyIds ?? []).filter((id) => !known.has(id)),
  ];
  const ordered =
    activeCharacterId !== null && included.includes(activeCharacterId)
      ? [activeCharacterId, ...included.filter((id) => id !== activeCharacterId)]
      : included;
  const faces = ordered.slice(0, maxFaces);
  return { faces, extra: ordered.length - faces.length };
}
