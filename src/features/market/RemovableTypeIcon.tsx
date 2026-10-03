/**
 * An item's icon with a small "×" badge on its top-right corner that drops
 * the item from the Compare Set — the one remove control in both Compare
 * views, Prices rows and the Attributes column headers alike.
 *
 * The badge is drawn small (so it reads as belonging to the icon, not as a
 * toolbar button) but its hit area is padded out by an `after:` box to the
 * 44px touch floor, since a phone has no hover to reveal it and no other way
 * to remove a single item. Always visible, for the same reason.
 */
import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
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
        className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-line-bright bg-panel-2 text-text after:absolute after:-inset-3.5 after:content-[''] hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon.Close size="0.625rem" aria-hidden="true" />
      </button>
    </span>
  );
}
