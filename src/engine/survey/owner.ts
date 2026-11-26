const normal = (name: string): string => name.trim().toLowerCase();

export function ownsSurvey(owner: string | null, characterNames: readonly string[]): boolean {
  if (owner === null) return false;
  const wanted = normal(owner);
  return characterNames.some((name) => normal(name) === wanted);
}
