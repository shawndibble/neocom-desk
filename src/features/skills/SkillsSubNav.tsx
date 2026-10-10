import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SKILLS_VIEWS } from './skillsViews';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { usesViewPicker } from '@/components/ui';
import {
  tabItemActiveClassName,
  tabItemClassName,
  tabItemIdleClassName,
  tabListClassName,
  tabScrollerClassName,
} from '@/components/ui/tabStyles';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return cx(tabItemClassName, isActive ? tabItemActiveClassName : tabItemIdleClassName);
}

/**
 * Sub-navigation between the Skills views. Real navigation (routes), not
 * a `Tabs` widget — but it sits in the same slot and reads as the same control,
 * so it borrows `Tabs`' own classes rather than approximating them.
 */
export function SkillsSubNav() {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  // A phone's `SkillsPageHeader` carries the views as a picker instead.
  if (usesViewPicker(SKILLS_VIEWS.length, isPhone)) return null;
  return (
    <div className={tabScrollerClassName}>
      <nav aria-label={t('nav.skills')} className={tabListClassName}>
        {SKILLS_VIEWS.map((view) => (
          <NavLink key={view.id} to={`/skills/${view.id}`} className={subNavClass}>
            {t(view.labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
