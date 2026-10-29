import type { ComponentProps, ReactNode } from 'react';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { isRowOwnEvent } from '@/components/ui/rowEvents';
import { cx } from '@/lib/cx';
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
 * (`isRowOwnEvent`). Renders into a parent `li` (`FIT_ROW_CLASS`), reaching
 * over its padding so the click area is the whole card.
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
  return (
    <div
      onClick={(event) => {
        if (!disabled && isRowOwnEvent(event)) onOpen();
      }}
      className={cx(
        '-mx-2 -my-1.5 min-w-0 flex-1 px-2 py-1.5',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-panel-2 active:bg-panel'
      )}
    >
      <p className="truncate border-b border-line pb-1 text-sm">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpen}
          className={entityLinkClassName('disabled:opacity-40')}
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
