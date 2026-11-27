import { useCallback, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { AlertsBell } from './AlertsBell';
import { PageHeaderClusterContext } from './pageHeaderCluster';
import { usePageHeaderSlot } from './pageHeaderSlot';

interface PageHeaderProps {
  /**
   * @summary Already-translated page title, rendered as the route's one `<h1>`.
   */
  title: string;
  meta?: ReactNode;
  /**
   * @summary The page's Character picker, first in the right-hand cluster; locks the header to one line.
   */
  scope?: ReactNode;
  /**
   * @summary Right-aligned control cluster: text actions, icon actions (Export, then Refresh), then ⋮ or gear.
   */
  actions?: ReactNode;
  subNav?: ReactNode;
  className?: string;
}

/**
 * @summary A route's top line: the one `<h1>`, its data age beside it, and the page controls at the right.
 */
export function PageHeader({
  title,
  meta,
  scope,
  actions,
  subNav,
  className = '',
}: PageHeaderProps) {
  const { register, unregister } = usePageHeaderSlot();
  const mine = useRef<HTMLElement | null>(null);
  const slotRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) {
        mine.current = el;
        register(el);
      } else if (mine.current) {
        unregister(mine.current);
        mine.current = null;
      }
    },
    [register, unregister]
  );
  const singleLine = scope !== undefined && scope !== null && scope !== false;
  const h1 = (
    <h1
      tabIndex={-1}
      className={cx(
        'max-w-full text-xl font-semibold tracking-widest uppercase focus:outline-none',
        singleLine ? 'min-w-12 truncate' : 'min-w-0 shrink-0 break-words'
      )}
    >
      {title}
    </h1>
  );
  return (
    <header
      className={cx(
        'flex min-h-9 flex-wrap gap-2',
        singleLine && 'md:flex-nowrap',
        subNav ? 'items-end md:gap-x-5 border-b border-line' : 'items-center',
        className
      )}
    >
      <div
        className={cx(
          'flex min-w-0 flex-1 items-center gap-2 self-stretch md:contents',
          singleLine ? 'flex-nowrap' : 'flex-wrap'
        )}
      >
        {h1}
        {singleLine
          ? meta && (
              <div className="-m-1 flex min-w-10 shrink-[4] items-center gap-2 overflow-hidden p-1 whitespace-nowrap empty:hidden has-[>:only-child:empty]:hidden max-md:has-[>.hidden:only-child]:hidden">
                {meta}
              </div>
            )
          : meta}
        <div
          className={cx(
            'ml-auto flex items-center justify-end gap-1.5 md:order-1',
            singleLine ? 'shrink-0 flex-nowrap' : 'max-w-full min-w-0 flex-wrap',
            subNav ? 'md:pb-1' : undefined
          )}
        >
          <PageHeaderClusterContext.Provider value={true}>
            {scope}
          </PageHeaderClusterContext.Provider>
          {actions}
          <span ref={slotRef} className="contents" />
          <AlertsBell />
        </div>
      </div>
      {subNav && (
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">{subNav}</div>
      )}
    </header>
  );
}
