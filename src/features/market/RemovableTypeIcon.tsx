/**
 * An item's icon with a small "×" badge on its top-right corner that drops
 * the item from the Compare Set — the one remove control in both Compare
 * views, Prices rows and the Attributes column headers alike.
 *
 * The badge is drawn small (so it reads as belonging to the icon, not as a
 * toolbar button) but below `md` its hit area is padded out by an `after:`
 * box toward the touch floor (DESIGN.md §3's touch tier), since a phone has
 * no hover to reveal it and no other way to remove a single item. That box
 * grows sideways and down, barely up: reaching up would cover the row above
 * and remove the wrong item. Pointer widths get only a few px of slop.
 * Always visible, for the same no-hover reason.
 */
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

export interface RemovableTypeIconProps {
  typeId: number;
  itemName: string;
  onRemove: (typeId: number) => void;
  /** Icon box size classes, e.g. `size-6` or `size-8`. */
  sizeClassName: string;
  className?: string;
}

export function RemovableTypeIcon({
  typeId,
  itemName,
  onRemove,
  sizeClassName,
  className,
}: RemovableTypeIconProps) {
  const { t } = useTranslation();
  return (
    <span className={cx('relative inline-flex shrink-0', sizeClassName, className)}>
      <TypeIcon typeId={typeId} size={64} className={cx(sizeClassName, 'rounded-xs')} />
      <button
        type="button"
        aria-label={t('market.compare.remove', { name: itemName })}
        onClick={(event) => {
          // Inside a clickable row or a context-menu trigger: removing must
          // not also open the row.
          event.stopPropagation();
          onRemove(typeId);
        }}
        className={cx(
          "absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-line-bright bg-panel-2 text-text after:absolute after:-inset-x-3.5 after:-top-0.5 after:-bottom-5 after:content-[''] md:after:-inset-1 hover:border-accent hover:text-accent",
          interactiveClassName,
          focusRingClassName
        )}
      >
        <Icon.Close size="0.625rem" aria-hidden="true" />
      </button>
    </span>
  );
}
