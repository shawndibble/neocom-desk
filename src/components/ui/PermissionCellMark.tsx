import { useId, useRef, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { Button } from './Button';
import { focusRingClassName, gripHitAreaClassName } from './controlStyles';
import * as Icon from './icons';
import { NeedsConnection } from './NeedsConnection';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

/** `granted` and `dismissed` render nothing; the caller's own tooltip carries a dismissed fallback. */
export type PermissionCellMarkStatus = 'granted' | 'missing' | 'dismissed';

export interface PermissionCellMarkProps {
  /** Only `missing` draws the mark. */
  status: PermissionCellMarkStatus;
  /** The Character whose grant lacks it: the row's Character, not necessarily the active one. */
  character: string;
  /** The missing Permissions' labels ("Autopilot waypoints"). */
  permissions: readonly string[];
  /** One short line on what the figure or control needs it for. */
  why: string;
  /** Starts that Character's grant at EVE. */
  onGrant: () => void;
  /** Stops asking for these Permissions, for every Character. */
  onDismiss: () => void;
  /** The "Grant missing Permissions" link to Settings › Permissions (`GrantMissingLink`). */
  settingsLink: ReactNode;
  /** Opens on mount, for a story or a screenshot. */
  defaultOpen?: boolean;
}

/**
 * A press on the mark or in its popover is its own: it never also fires the
 * row (§6c, one target, one action). The content is portalled, so React still
 * bubbles these to the row's handlers; the same set `RowActions` stops.
 */
const stop = (event: SyntheticEvent) => event.stopPropagation();
const stopRowEvents = {
  onClick: stop,
  onContextMenu: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onKeyDown: stop,
};

/**
 * The amber mark after a figure or control that needs a Permission the row's
 * Character lacks (issue #6704). No reason text in the layout: a press opens a
 * popover naming who and what, one why line, Grant in EVE for **that**
 * Character, Don't ask again (per Permission, account-wide), and the Grant
 * missing Permissions link. Presentational: `GrantCellMark` (`src/app`) reads
 * the grant and the dismissals and supplies the actions; use that one.
 *
 * A popover at every width, never a bottom sheet on a phone: it is three lines
 * and two buttons anchored to one cell, like the figure openers, and a sheet
 * would lose which row's Character it is about. `max-w` keeps it inside a 390px
 * screen, and the collision padding keeps it clear of the phone's bottom tabs.
 */
export function PermissionCellMark({
  status,
  character,
  permissions,
  why,
  onGrant,
  onDismiss,
  settingsLink,
  defaultOpen = false,
}: PermissionCellMarkProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const whyId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (status !== 'missing') return null;
  const named = permissions.join(', ');
  // Dismissing unmounts the mark with its popover, so focus would fall to <body>:
  // hand it to the nearest focusable ancestor (the row) once the mark is gone.
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
            // 24px hit area around a 14px glyph, pulled back so the row keeps its height (as `InfoTooltip`).
            // On touch an invisible ::before makes it 36px tall (DESIGN.md §3's touch tier, no 44px);
            // only vertically, so it never covers the figure or control right beside it.
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
          {t('reauth.missingTitle', { character, permissions: named })}
        </p>
        <p id={whyId} className="mt-1 text-xs text-text-dim">
          {why}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <NeedsConnection>
            <Button variant="primary" size="sm" onClick={onGrant}>
              {t('reauth.grantAction')}
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
