import * as Icon from './icons';

/**
 * The trailing `CaretRight` of a row that navigates (DESIGN.md §6c): faint at
 * rest, accent while the row (a `group`) is hovered or focused.
 */
export function RowCaret() {
  return (
    <Icon.Descend
      size={Icon.ICON_SIZE.sm}
      className="shrink-0 text-text-faint group-hover:text-accent group-focus-visible:text-accent"
      aria-hidden="true"
    />
  );
}
