export function skillNameOrFallback(
  id: number,
  skillNames: Readonly<Record<number, string>>
): string {
  return skillNames[id] ?? `#${id}`;
}
