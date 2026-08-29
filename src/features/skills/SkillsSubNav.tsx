import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LINK =
  'inline-flex h-8 items-center border-b-2 px-3 text-xs font-semibold tracking-widest uppercase transition-colors';
const ACTIVE = 'border-accent text-text';
const IDLE = 'border-transparent text-text-dim hover:text-text';

function subNavClass({ isActive }: { isActive: boolean }): string {
  return `${LINK} ${isActive ? ACTIVE : IDLE}`;
}

/** Sub-navigation between the two Skills views. Real navigation (routes), not a Tabs widget. */
export function SkillsSubNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.skills')} className="flex gap-1 border-b border-line">
      <NavLink to="/skills" end className={subNavClass}>
        {t('skills.trainedTab')}
      </NavLink>
      <NavLink to="/skills/plans" className={subNavClass}>
        {t('skills.plansTab')}
      </NavLink>
    </nav>
  );
}
