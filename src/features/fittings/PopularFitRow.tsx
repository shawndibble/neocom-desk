import type { ComponentProps, ReactNode } from 'react';
import { disabledClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { isRowOwnEvent } from '@/components/ui/rowEvents';
import { cx } from '@/lib/cx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { RackIconStrip } from './RackIconStrip';

interface PopularFitRowProps {
  /** The row's lead: "6 losses" on zKillboard, the fit's name on EVE Workbench. */
  title: string;
  /** What follows the title, dimmed: " · last seen 2h ago · ~87.5M ISK". */
  meta?: ReactNode;
  modules: ComponentProps<typeof RackIconStrip>['modules'];
  names: ComponentProps<typeof RackIconStrip>['names'];
  /** Lines under the icons: a sighting, a failure. */
  children?: ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}

/**
 * One Popular fit's card body, shared by the zKillboard and EVE Workbench tabs.
 * The whole card opens the fit; the blue title is its keyboard and screen-reader
 * control, and a tap on a module icon shows the module's name instead
 * (`isRowOwnEvent`) — but only under a finger; with a mouse the hover has shown
 * it, so a click on an icon opens the card too.
 *
 * Renders into a parent `li` (`FIT_ROW_CLASS`), reaching over its padding so
 * the click area is the whole card.
 */
export function PopularFitRow({
  title,
  meta,
  modules,
  names,
  children,
  disabled = false,
  onOpen,
}: PopularFitRowProps) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  return (
    <div
      onClick={(event) => {
        if (disabled) return;
        // A module icon is a tooltip trigger. With a mouse its name is already on
        // hover, so a click is the card's; a finger has no hover, so its tap names it.
        const onIcon =
          !coarse &&
          event.target instanceof Element &&
          event.target.closest('[data-row-control][role="img"]');
        if (onIcon || isRowOwnEvent(event)) onOpen();
      }}
      className={cx(
        '-mx-2 -my-1.5 min-w-0 flex-1 px-2 py-1.5',
        disabled ? 'cursor-not-allowed' : cx(rowInteractiveClassName, 'cursor-pointer')
      )}
    >
      {/* -mx/px: room inside the truncating box for the title's focus ring. */}
      <p className="-mx-1 truncate border-b border-line/50 px-1 pt-1 pb-2 text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpen}
          className={entityLinkClassName(disabledClassName)}
        >
          {title}
        </button>
        <span className="text-text-dim">{meta}</span>
      </p>
      <RackIconStrip modules={modules} names={names} />
      {children}
    </div>
  );
}
