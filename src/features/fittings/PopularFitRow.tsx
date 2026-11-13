import type { ComponentProps, ReactNode } from 'react';
import { disabledClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { isRowOwnEvent } from '@/components/ui/rowEvents';
import { cx } from '@/lib/cx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { useTranslation } from 'react-i18next';
import type { FitSource } from './popularFitList';
import { RackIconStrip } from './RackIconStrip';

interface PopularFitRowProps {
  /** Where the fit comes from: a group of zKillboard losses, or an EVE Workbench guide. */
  source: FitSource;
  /** The row's lead: "6 losses" on zKillboard, the fit's name on EVE Workbench. */
  title: string;
  /** What follows the title, dimmed and truncated with it: " · last seen 2h ago". */
  meta?: ReactNode;
  /** The fit's ISK, after the title and never truncated: the title gives way first. */
  price?: ReactNode;
  /** At the end of the title line, never truncated: the can-fly verdict. */
  verdict?: ReactNode;
  /** Opened under the icons by the verdict: the skills the fit still needs. */
  details?: ReactNode;
  modules: ComponentProps<typeof RackIconStrip>['modules'];
  names: ComponentProps<typeof RackIconStrip>['names'];
  /** Module types the active Character can't use yet: their icons are tinted. */
  unusable?: ComponentProps<typeof RackIconStrip>['unusable'];
  /** Lines under the icons: a sighting, a failure. */
  children?: ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}

/**
 * One Popular fit's card body, the same for a group of losses and a guide.
 * The whole card opens the fit; the blue title is its keyboard and screen-reader
 * control, and a tap on a module icon or the verdict shows its tooltip instead
 * (`isRowOwnEvent`) — but only under a finger; with a mouse the hover has shown
 * it, so a click on an icon opens the card too.
 *
 * Renders into a parent `li` (`FIT_ROW_CLASS`), reaching over its padding so
 * the click area is the whole card.
 */
export function PopularFitRow({
  source,
  title,
  meta,
  price,
  verdict,
  details,
  modules,
  names,
  unusable,
  children,
  disabled = false,
  onOpen,
}: PopularFitRowProps) {
  const { t } = useTranslation();
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  return (
    <div
      onClick={(event) => {
        if (disabled) return;
        // A module icon or the verdict is a tooltip trigger. With a mouse it has
        // already shown on hover, so a click is the card's; a finger has no hover.
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
      {/* Wraps at a phone's width: the verdict drops below rather than squeezing the title. */}
      <div className="-mx-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/50 px-1 pt-1 pb-2">
        <span className="w-12 shrink-0 border border-line py-px text-center text-[0.6875rem] font-semibold tracking-wider text-text-dim uppercase">
          {t(`fittings.popular.tag.${source}`)}
        </span>
        {/* -mx/px: room inside the truncating box for the title's focus ring. */}
        <p className="-mx-1 min-w-0 flex-1 basis-40 truncate px-1 text-sm">
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
        {price !== undefined && (
          <span className="shrink-0 text-sm text-text tabular-nums">{price}</span>
        )}
        {verdict}
      </div>
      <RackIconStrip modules={modules} names={names} unusable={unusable} />
      {children}
      {details !== undefined && (
        // A row control: a click in the list's blank space doesn't open the fit.
        <div data-row-control className="mt-2 cursor-auto border border-line bg-bg/60 p-2">
          {details}
        </div>
      )}
    </div>
  );
}
