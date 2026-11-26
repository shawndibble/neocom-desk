import * as Icon from './icons';

export function RowCaret() {
  return (
    <Icon.Descend
      size={Icon.ICON_SIZE.sm}
      className="shrink-0 text-text-faint group-hover:text-accent group-focus-visible:text-accent"
      aria-hidden="true"
    />
  );
}
