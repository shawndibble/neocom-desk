import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
} from '@/components/ui/tabStyles';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return cx(tabItemClassName, isActive ? tabItemActiveClassName : tabItemIdleClassName);
}

/**
 * The Corp section's frame, not the Overview page's chrome.
 *
 * It carries one entry today and is built for more: `/corp/members` (#297)
 * hangs off it next, and the events view (#299) after that. Real navigation
 * (routes) rather than a `Tabs` widget, matching `SkillsSubNav` and
 * `OverviewSubNav` — it sits in the same slot and reads as the same control, so
 * it borrows their classes rather than approximating them.
 *
 * No lock markers, unlike `OverviewSubNav`. Corp views hide rather than lock
 * (CONTEXT.md round 35), and this whole nav renders only for a Character whose
 * Corp Access is `ready` — so there is no locked state left for an entry here
 * to mark.
 */
export function CorpSubNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.corp')} className={tabListClassName}>
      <NavLink to="/corp" end className={subNavClass}>
        {t('corp.overviewTab')}
      </NavLink>
    </nav>
  );
}
