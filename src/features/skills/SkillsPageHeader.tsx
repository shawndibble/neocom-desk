import type { ComponentProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';
import { SKILLS_VIEWS } from './skillsViews';

/**
 * The Skills routes' `PageHeader`. Skills has four views, so a phone shows the
 * view picker in the title row (`SkillsSubNav` drops its strip to match).
 */
export function SkillsPageHeader(
  props: Omit<ComponentProps<typeof PageHeader>, 'title' | 'views'>
) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const value = SKILLS_VIEWS.find((view) => pathname.startsWith(`/skills/${view.id}`))?.id ?? '';
  return (
    <PageHeader
      {...props}
      title={t('nav.skills')}
      views={{
        tabs: SKILLS_VIEWS.map((view) => ({ id: view.id, label: t(view.labelKey) })),
        value,
        onChange: (id) => navigate(`/skills/${id}`),
      }}
    />
  );
}
