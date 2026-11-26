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
