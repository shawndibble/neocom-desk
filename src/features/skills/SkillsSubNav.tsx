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
 * Sub-navigation between the three Skills views. Real navigation (routes), not
 * a `Tabs` widget — but it sits in the same slot and reads as the same control,
 * so it borrows `Tabs`' own classes rather than approximating them.
 */
export function SkillsSubNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.skills')} className={tabListClassName}>
      <NavLink to="/skills" end className={subNavClass}>
        {t('skills.trainedTab')}
      </NavLink>
      <NavLink to="/skills/plans" className={subNavClass}>
        {t('skills.plansTab')}
      </NavLink>
      <NavLink to="/skills/compare" className={subNavClass}>
        {t('skills.compareTab')}
      </NavLink>
    </nav>
  );
}
