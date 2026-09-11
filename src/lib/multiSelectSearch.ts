export interface MultiSelectOption<Id> {
  readonly id: Id;
  readonly label: string;
}

export interface MultiSelectGroup<Id> {
  readonly label: string;
  readonly options: readonly MultiSelectOption<Id>[];
}

/**
 * Narrows each group's options to those whose label contains `query`
 * (case-insensitive). A group left with zero matches is dropped entirely —
 * shown empty reads as "nothing here" rather than "nothing matches."
 */
export function filterMultiSelectGroups<Id>(
  groups: readonly MultiSelectGroup<Id>[],
  query: string
): readonly MultiSelectGroup<Id>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) => ({
      label: group.label,
      options: group.options.filter((option) => option.label.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.options.length > 0);
}
