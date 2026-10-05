/**
 * The names of the systems a Payee has been mined for, alphabetical, for the
 * row's second line. Ids with no known name are dropped rather than shown as
 * raw numbers.
 */
export function payeeSystemNames(
  systemIds: ReadonlySet<number> | undefined,
  systemNames: ReadonlyMap<number, string> | undefined
): string[] {
  if (!systemIds || !systemNames) return [];
  const names: string[] = [];
  for (const id of systemIds) {
    const name = systemNames.get(id);
    if (name) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}
