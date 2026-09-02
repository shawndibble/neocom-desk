import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLockedRoutes } from '@/app/useGrantedScopes';
import type { AppRoutePath } from '@/app/routeScopes';

const LINK =
  'inline-flex h-8 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold tracking-widest uppercase transition-colors';
const ACTIVE = 'border-accent text-text';
const IDLE = 'border-transparent text-text-dim hover:text-text';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return `${LINK} ${isActive ? ACTIVE : IDLE}`;
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
export function OverviewSubNav() {
  const { t } = useTranslation();
  const locked = useLockedRoutes(TAB_PATHS);

  return (
    <nav aria-label={t('nav.overview')} className="flex gap-1 border-b border-line">
      <NavLink to="/overview" className={subNavClass}>
        {t('nav.overview')}
      </NavLink>
      {/*
        The rail used to carry this marker for /clones; the tab has to keep it
        now that the rail no longer lists the route. Informational only, and it
        rides on `title` rather than extra text so the link stays named
        "Clones" — see `NavItem` in Layout.tsx for the full reasoning.
      */}
      <NavLink
        to="/clones"
        className={subNavClass}
        title={locked.has('/clones') ? t('reauth.navLocked') : undefined}
      >
        {t('nav.clones')}
        {locked.has('/clones') && (
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
        )}
      </NavLink>
      <NavLink to="/employment-history" className={subNavClass}>
        {t('nav.employmentHistory')}
      </NavLink>
    </nav>
  );
}
