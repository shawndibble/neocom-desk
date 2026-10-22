/** Most faces the Character picker's "All characters" trigger draws; the rest is a "+N" chip. */
export const STACK_MAX_FACES = 3;

/**
 * The faces on the "All characters" trigger: the Characters "All" covers
 * (the roster minus any named in `missingNames`), the active one first and
 * then roster order, capped at `STACK_MAX_FACES`; `extra` is how many more
 * are covered than drawn.
 */
export function characterStack(
  roster: readonly { characterId: number; name: string }[],
  activeCharacterId: number | null,
  missingNames: readonly string[] = []
): { faces: number[]; extra: number } {
  const missing = new Set(missingNames);
  const included = roster.filter((c) => !missing.has(c.name)).map((c) => c.characterId);
  const ordered =
    activeCharacterId !== null && included.includes(activeCharacterId)
      ? [activeCharacterId, ...included.filter((id) => id !== activeCharacterId)]
      : included;
  const faces = ordered.slice(0, STACK_MAX_FACES);
  return { faces, extra: ordered.length - faces.length };
}
