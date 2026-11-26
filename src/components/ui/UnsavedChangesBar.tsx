import { useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { Button } from './Button';
import * as Icon from './icons';

interface UnsavedChangesBarProps {
  message: string;
  problems?: string | null;
  discardLabel: string;
  saveLabel: string;
  onDiscard: () => void;
  onSave: () => void;
  saving?: boolean;
  children?: ReactNode;
  className?: string;
}

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
