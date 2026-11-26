import type { ReactNode } from 'react';

export interface MultiSelectOption<Id> {
  readonly id: Id;
  readonly label: string;
  readonly swatch?: ReactNode;
}

export interface MultiSelectGroup<Id> {
  readonly label: string;
  readonly options: readonly MultiSelectOption<Id>[];
}

export function filterMultiSelectGroups<Id>(
  groups: readonly MultiSelectGroup<Id>[],
  query: string,
  matchHeadings = false
): readonly MultiSelectGroup<Id>[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return groups;
  return groups
    .map((group) =>
      matchHeadings && group.label.toLowerCase().includes(needle)
        ? group
        : {
            label: group.label,
            options: group.options.filter((option) => option.label.toLowerCase().includes(needle)),
          }
    )
    .filter((group) => group.options.length > 0);
}
