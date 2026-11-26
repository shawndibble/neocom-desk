import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { SkillTrainingStatus } from './skillStatus';

export function SkillStatusIcon({ status }: { status: SkillTrainingStatus }) {
  const { t } = useTranslation();
  if (status === 'trained') {
    return (
      <span role="img" className="text-success" aria-label={t('skills.status.trained')}>
        <Icon.SeverityClear size={Icon.ICON_SIZE.sm} />
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span role="img" className="text-warning" aria-label={t('skills.status.partial')}>
        <Icon.Warn size={Icon.ICON_SIZE.sm} />
      </span>
    );
  }
  return (
    <span role="img" className="text-danger" aria-label={t('skills.status.missing')}>
      <Icon.Close size={Icon.ICON_SIZE.sm} />
    </span>
  );
}
