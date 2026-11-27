import { eyebrowClassName } from './eyebrowClassName';
import { isRowOwnEvent } from './rowEvents';
import { interactiveClassName } from './controlStyles';
import { forwardRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

interface PanelProps {
  /**
   * @summary The panel heading, rendered as an `<h2>`.
   */
  title?: ReactNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** @summary Right-aligned controls in the header row, usually `IconButton`s. */
  actions?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  wrapMeta?: boolean;
  metaOwnRow?: boolean;
  onHeaderToggle?: () => void;
  children: ReactNode;
  /** @summary Set false for flush content like tables; the body then has no inner padding. */
  padded?: boolean;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * @summary The bordered surface every page section sits in: optional title row with meta and actions, then the body.
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  {
    title,
    headingRef,
    actions,
    leading,
    meta,
    wrapMeta = false,
    metaOwnRow = false,
    onHeaderToggle,
    children,
    padded = true,
    fill = false,
    className = '',
    style,
  },
  ref
) {
  const contentClassName = [padded ? 'p-3' : '', fill ? 'flex min-h-0 flex-1 flex-col' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <section
      ref={ref}
      className={`rounded-xs border border-line bg-panel/85 backdrop-blur-sm ${className}`}
      style={style}
    >
      {(title || actions || leading || meta) && (
        <header
          onClick={onHeaderToggle && ((event) => isRowOwnEvent(event) && onHeaderToggle())}
          className={`${onHeaderToggle ? `cursor-pointer hover:bg-panel-2/60 active:bg-panel ${interactiveClassName} ` : ''}flex min-h-9 items-center justify-between gap-2 border-b border-line bg-panel-2 py-1 pr-3 ${metaOwnRow ? 'max-md:flex-wrap' : ''} ${leading ? 'pl-1' : 'pl-3'}`}
        >
          <div
            className={`flex min-w-0 items-center gap-2 text-[0.6875rem] text-text-dim ${wrapMeta ? 'max-md:flex-wrap' : ''} ${metaOwnRow ? 'max-md:contents' : ''}`}
          >
            {leading}
            {title && (
              <h2
                ref={headingRef}
                tabIndex={headingRef ? -1 : undefined}
                className={`${eyebrowClassName} ${
                  headingRef
                    ? 'max-md:min-w-0 max-md:break-words md:whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                    : wrapMeta
                      ? 'max-md:shrink-0 max-md:whitespace-nowrap md:min-w-0 md:truncate'
                      : 'min-w-0 truncate'
                }`}
              >
                {title}
              </h2>
            )}
            {meta}
          </div>
          {actions && (
            <div
              className={`flex shrink-0 items-center gap-1 ${metaOwnRow ? 'max-md:ml-auto' : ''}`}
            >
              {actions}
            </div>
          )}
        </header>
      )}
      {children != null && children !== false && <div className={contentClassName}>{children}</div>}
    </section>
  );
});
