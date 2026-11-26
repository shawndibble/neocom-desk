import { useTranslation } from 'react-i18next';
import { TypeIcon } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';

export interface RemovableTypeIconProps {
  typeId: number;
  itemName: string;
  onRemove: (typeId: number) => void;
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
          event.stopPropagation();
          onRemove(typeId);
        }}
        className={cx(
          "absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-line-bright bg-panel-2 text-text after:absolute after:-inset-x-3.5 after:-top-0.5 after:-bottom-5 after:content-[''] md:after:-inset-1 hover:border-accent hover:text-accent",
          interactiveClassName,
          focusRingClassName
        )}
      >
        <Icon.Close className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}
