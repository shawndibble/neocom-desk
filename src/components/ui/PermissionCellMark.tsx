import { useId, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { focusRingClassName, gripHitAreaClassName } from './controlStyles';
import * as Icon from './icons';
import { NeedsConnection } from './NeedsConnection';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

export type PermissionCellMarkStatus = 'granted' | 'missing' | 'dismissed';

export interface PermissionCellMarkProps {
  status: PermissionCellMarkStatus;
  character: string;
  permissions: readonly string[];
  why: string;
  onGrant: () => void;
  onDismiss: () => void;
  settingsLink: ReactNode;
  defaultOpen?: boolean;
  title?: string;
  grantLabel?: string;
}

const stop = (event: SyntheticEvent) => event.stopPropagation();
const stopRowEvents = {
  onClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onKeyDown: stop,
};

export function PermissionCellMark({
  status,
  character,
  permissions,
  why,
  onGrant,
  onDismiss,
  settingsLink,
  defaultOpen = false,
  title,
  grantLabel,
}: PermissionCellMarkProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const whyId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (status !== 'missing') return null;
  const named = permissions.join(', ');
  const dismiss = () => {
    const home = triggerRef.current?.parentElement?.closest<HTMLElement>(
      '[tabindex]:not([tabindex="-1"])'
    );
    onDismiss();
    if (home) requestAnimationFrame(() => home.focus());
  };
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={t('permissions.mark.label', { character, permissions: named })}
          {...stopRowEvents}
          className={cx(
            gripHitAreaClassName,
            '-m-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle text-warning hover:text-warning/80',
            focusRingClassName
          )}
        >
          <Icon.Warn aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={{ top: 8, right: 8, bottom: 80, left: 8 }}
        aria-labelledby={titleId}
        aria-describedby={whyId}
        className="w-72 max-w-[calc(100vw-2rem)] p-3 text-sm"
        {...stopRowEvents}
      >
        <p id={titleId} className="font-semibold text-warning">
          {title ?? t('reauth.missingTitle', { character, permissions: named })}
        </p>
        <p id={whyId} className="mt-1 text-xs text-text-dim">
          {why}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NeedsConnection>
            <Button variant="primary" size="sm" onClick={onGrant}>
              {grantLabel ?? t('reauth.grantAction')}
            </Button>
          </NeedsConnection>
          <Button size="sm" onClick={dismiss}>
            {t('permissions.mark.dontAsk')}
          </Button>
        </div>
        <p className="mt-3 text-xs">{settingsLink}</p>
      </PopoverContent>
    </Popover>
  );
}
