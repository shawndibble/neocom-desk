import type { ReactNode } from 'react';

export interface MultiSelectOption<Id> {
  readonly id: Id;
  readonly label: string;
  /** Decoration shown before the label (a colour swatch); not searched. */
  readonly swatch?: ReactNode;
}

export interface MultiSelectGroup<Id> {
  readonly label: string;
  readonly options: readonly MultiSelectOption<Id>[];
}

/**
 * Narrows each group's options to those whose label contains `query`
 * (case-insensitive). A group left with zero matches is dropped entirely —
 * shown empty reads as "nothing here" rather than "nothing matches."
 * With `matchHeadings`, a query naming the group's heading keeps all of its options.
 */
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
