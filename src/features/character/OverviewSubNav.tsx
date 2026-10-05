import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLockedRoutes } from '@/app/useGrantedScopes';
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

function subNavClass({ isActive }: { isActive: boolean }): string {
  return cx(tabItemClassName, 'gap-1.5', isActive ? tabItemActiveClassName : tabItemIdleClassName);
}

/**
 * Module-level so `useLockedRoutes`' memo — keyed on `[granted, paths]` —
 * survives a re-render. Only `/clones` is gated (routeScopes.ts); `/overview`
 * and `/employment-history` are UNGATED and can never appear in the result.
 */
const TAB_PATHS = [
  '/overview',
  '/clones',
  '/employment-history',
] as const satisfies readonly AppRoutePath[];

/**
 * Sub-navigation across the three Character-overview views. Real navigation
 * (routes), not a `Tabs` widget — same reasoning as `SkillsSubNav`, and the
 * paths stay top-level rather than nesting under `/overview`, so each view
 * keeps its own `ScopeGate` and every existing bookmark still resolves.
 */
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

export function OverviewSubNav() {
  const { t } = useTranslation();
  const locked = useLockedRoutes(TAB_PATHS);

  return (
    <div className={tabScrollerClassName}>
      <nav aria-label={t('nav.overview')} className={tabListClassName}>
        <NavLink to="/overview" className={subNavClass}>
          {t('nav.overview')}
        </NavLink>
        {/*
          The rail used to carry this marker for /clones; the tab has to keep it
          now that the rail no longer lists the route. Informational only, and it
          rides on `title` rather than extra text so the link stays named
          "Clones" — see `NavItem` in Layout.tsx for the full reasoning.
        */}
        <ClonesTab locked={locked.has('/clones')} />
        <NavLink to="/employment-history" className={subNavClass}>
          {t('nav.employmentHistory')}
        </NavLink>
      </nav>
    </div>
  );
}
