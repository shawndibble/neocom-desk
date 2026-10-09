/**
 * Does the account own a Survey? A Survey names the Character that started it;
 * the account owns it when it holds a Character of that name. The name is a
 * hint (anyone could write any name), so this only picks which prompt to show.
 */
const normal = (name: string): string => name.trim().toLowerCase();

export function ownsSurvey(owner: string | null, characterNames: readonly string[]): boolean {
  if (owner === null) return false;
  const wanted = normal(owner);
  return characterNames.some((name) => normal(name) === wanted);
}
