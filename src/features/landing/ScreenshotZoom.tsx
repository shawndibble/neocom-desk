import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { ICON_SIZE, Search } from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { screenshotSrc, type Screenshot } from './screenshots';

/**
 * The enlarged view of a landing screenshot: one Modal for the section, `shot`
 * null while closed. Shared by the question grid and the showcase.
 */
export function ScreenshotZoom({
  shot,
  onClose,
}: {
  shot: Screenshot | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={shot !== null}
      onClose={onClose}
      title={shot ? t(`login.screenshots.${shot.key}.caption`) : ''}
      placement="media"
    >
      {shot && (
        <img
          src={screenshotSrc(shot)}
          alt={t(`login.screenshots.${shot.key}.alt`)}
          width={shot.size.width}
          height={shot.size.height}
          className="mx-auto block h-auto max-h-[80vh] w-auto max-w-full"
        />
      )}
    </Modal>
  );
}

/**
 * The magnifier in a picture's corner (DESIGN.md §6c "Magnifier badge"). The
 * nearest `group` is either the button itself (`group-focus-visible`) or a
 * wrapper around it (`group-has-[:focus-visible]`); both reveal it on focus.
 */
export function ZoomBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'absolute right-2 bottom-2 rounded-xs border border-line bg-bg/80 p-1 text-text',
        'opacity-0 motion-safe:transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100',
        'touch:opacity-100 [@media(hover:none)]:opacity-100',
        className
      )}
    >
      <Search size={ICON_SIZE.sm} aria-hidden="true" />
    </span>
  );
}
