/** `skillNames[id]`, falling back to `#id` when a skill's name hasn't resolved — shared by `RequiredSkillsSection` and ItemDetailModal's attribute-modifier popover. */
export function skillNameOrFallback(
  id: number,
  skillNames: Readonly<Record<number, string>>
): string {
  return skillNames[id] ?? `#${id}`;
}
