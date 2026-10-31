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

/**
 * Module-level so `useLockedRoutes`' memo — keyed on `[granted, paths]` —
 * survives a re-render. Only `/clones` is gated (routeScopes.ts); `/overview`,
 * `/employment-history` and `/srp` are UNGATED and can never appear in the result.
 */
const TAB_PATHS = [
  '/overview',
  '/clones',
  '/employment-history',
  '/srp',
] as const satisfies readonly AppRoutePath[];

/** The Clones tab; wears the re-auth marker and tooltip when its scope is missing. */
function ClonesTab({ locked }: { locked: boolean }) {
  const { t } = useTranslation();
  const tab = (
    <NavLink to="/clones" className={subNavClass}>
      {t('nav.clones')}
      {locked && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />}
    </NavLink>
  );
  // A span carries the tooltip: `NavLink`'s class is a function, which Tooltip's
  // className merge would stringify.
  return locked ? (
    <Tooltip content={t('reauth.navLocked')}>
      <span className="inline-flex">{tab}</span>
    </Tooltip>
  ) : (
    tab
  );
}

/**
 * Sub-navigation across the Character-overview views (SRP joins them while the corporation has SRP on). Real navigation
 * (routes), not a `Tabs` widget — same reasoning as `SkillsSubNav`, and the
 * paths stay top-level rather than nesting under `/overview`, so each view
 * keeps its own `ScopeGate` and every existing bookmark still resolves.
 *
 * `trailing` sits at the bar's right end: the view's data age, drawn on the
 * tab row rather than beside the name so it reads as the data's, not the
 * pilot's.
 */
export function OverviewSubNav({ trailing }: { trailing?: ReactNode }) {
  const { t } = useTranslation();
  const locked = useLockedRoutes(TAB_PATHS);
  // Hidden, never locked or dimmed, unless the pilot's corporation has SRP on (`NavSubView.visible`).
  const srpVisible = useSrpNavVisible();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // On a phone the strip outgrows its frame and opens at scroll 0, so landing
  // on a later view cut its own tab off (or hid SRP entirely). Slide the
  // current link into view on landing, on every route change, and when the
  // strip or its tabs resize: the `trailing` data-age badge arrives with the
  // data and narrows the strip after landing. A no-op when the link already
  // fits, and a swipe resizes nothing, so it never fights the reader.
  // `srpVisible` too: the SRP tab mounts after landing.
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
    return () => observer?.disconnect();
  }, [pathname, srpVisible]);

  return (
    <div className="flex items-stretch">
      <div ref={scrollerRef} className={cx(tabScrollerClassName, 'min-w-0 flex-1')}>
        <nav aria-label={t('nav.overview')} className={tabListClassName}>
          <NavLink to="/overview" className={subNavClass}>
            {t('nav.overview')}
          </NavLink>
          {/*
          The rail used to carry this marker for /clones; the tab has to keep it
          now that the rail no longer lists the route. Informational only, and it
          is a dot inside the link with a tooltip on a wrapper, so the link stays
          named "Clones" — see `NavItem` in Layout.tsx for the full reasoning.
        */}
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
      {/* Outside the scroller, so a narrow phone scrolls the tabs and never hides this. */}
      {trailing && (
        <div className="flex shrink-0 items-center border-b border-line pr-1 pl-2">{trailing}</div>
      )}
    </div>
  );
}
