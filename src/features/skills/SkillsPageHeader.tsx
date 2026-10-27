import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui';

/** The Skills routes' `PageHeader`; `SkillsSubNav` sits under it at every width. */
export function SkillsPageHeader(props: Omit<ComponentProps<typeof PageHeader>, 'title'>) {
  const { t } = useTranslation();
  return <PageHeader {...props} title={t('nav.skills')} />;
}
