import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLockedRoutes } from '@/app/useGrantedScopes';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';
import type { AppRoutePath } from '@/app/routeScopes';
import { cx } from '@/lib/cx';
import { Tooltip } from '@/components/ui';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';
import { revealInScroller } from '@/components/ui/tabScroll';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return cx(tabItemClassName, 'gap-1.5', isActive ? tabItemActiveClassName : tabItemIdleClassName);
}

const TAB_PATHS = [
  '/overview',
  '/clones',
  '/employment-history',
  '/srp',
] as const satisfies readonly AppRoutePath[];

function ClonesTab({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const tab = (
    <NavLink to="/clones" className={subNavClass}>
      {t('nav.clones')}
      {locked && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />}
    </NavLink>
  );
  return locked ? (
    <Tooltip content={t('reauth.navLocked')}>
      <span className="inline-flex">{tab}</span>
    </Tooltip>
  ) : (
    tab
  );
}

export function OverviewSubNav({ trailing }: { trailing?: ReactNode }) {
  const { t } = useTranslation();
  const locked = useLockedRoutes(TAB_PATHS);
  const srpVisible = useSrpNavVisible();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const reveal = () => {
      const current = scroller.querySelector('[aria-current="page"]');
      if (current) revealInScroller(scroller, current);
    };
    reveal();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    observer?.observe(scroller);
    const list = scroller.firstElementChild;
    if (list) observer?.observe(list);
    const stop = () => observer?.disconnect();
    scroller.addEventListener('pointerdown', stop, { passive: true });
    scroller.addEventListener('wheel', stop, { passive: true });
    return () => {
      stop();
      scroller.removeEventListener('pointerdown', stop);
      scroller.removeEventListener('wheel', stop);
    };
  }, [pathname, srpVisible]);

  return (
    <div className="flex items-stretch">
      <div ref={scrollerRef} className={cx(tabScrollerClassName, 'min-w-0 flex-1')}>
        <nav aria-label={t('nav.overview')} className={tabListClassName}>
          <NavLink to="/overview" className={subNavClass}>
            {t('nav.overview')}
          </NavLink>
          <ClonesTab locked={locked.has('/clones')} />
          <NavLink to="/employment-history" className={subNavClass}>
            {t('nav.employmentHistory')}
          </NavLink>
          {srpVisible && (
            <NavLink to="/srp" className={subNavClass}>
              {t('nav.srp')}
            </NavLink>
          )}
        </nav>
      </div>
      {trailing && (
        <div className="flex shrink-0 items-center border-b border-line pr-1 pl-2">{trailing}</div>
      )}
    </div>
  );
}
