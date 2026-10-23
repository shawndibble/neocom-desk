import { useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { Button } from './Button';
import * as Icon from './icons';

interface UnsavedChangesBarProps {
  /** @summary Already-translated status line, e.g. "Unsaved changes". Ignored while `problems` is set. */
  message: string;
  /** @summary Already-translated line naming what blocks Save, e.g. "2 problems to fix before saving". Shown instead of `message` when set. */
  problems?: string | null;
  discardLabel: string;
  saveLabel: string;
  onDiscard: () => void;
  onSave: () => void;
  /** @summary A save is running: Save shows its spinner and both buttons ignore clicks. */
  saving?: boolean;
  /** @summary Extra status under the buttons' row, e.g. a failed save's `ActionResult`. */
  children?: ReactNode;
  className?: string;
}

/**
 * Pinned above the phone tab bar, flush with the bottom from `md` up. Publishes
 * `--unsaved-bar-clearance` so a focused field scrolls clear of it (WCAG 2.4.11).
 *
 * @summary Pinned bar for a form with edits not yet saved: a status line, Discard and Save. Save stays focusable but inert while a field is invalid.
 */
export function UnsavedChangesBar({
  message,
  problems = null,
  discardLabel,
  saveLabel,
  onDiscard,
  onSave,
  saving = false,
  children,
  className,
}: UnsavedChangesBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStickyClearance(ref, 'unsaved-bar');
  const blocked = problems !== null;
  return (
    <div
      ref={ref}
      className={cx(
        'sticky bottom-[var(--bottom-nav-clearance)] z-30 rounded-xs border border-line-bright bg-panel p-2 shadow-lg md:bottom-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 basis-full text-sm sm:basis-0 sm:flex-1" role="status">
          {blocked ? (
            <span className="flex items-center gap-1.5 text-danger">
              <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {problems}
            </span>
          ) : (
            message
          )}
        </p>
        <Button
          className="max-sm:flex-1"
          onClick={saving ? undefined : onDiscard}
          aria-disabled={saving ? true : undefined}
        >
          {discardLabel}
        </Button>
        <Button
          className="max-sm:flex-1"
          variant="primary"
          loading={saving}
          aria-disabled={blocked ? true : undefined}
          onClick={blocked ? undefined : onSave}
        >
          {saveLabel}
        </Button>
      </div>
      {children}
    </div>
  );
}
