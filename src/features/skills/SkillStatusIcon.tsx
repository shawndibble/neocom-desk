import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { SkillTrainingStatus } from './skillStatus';

/**
 * The 3-state trained/partial/missing glyph, shared by Fit Check's rows and
 * Market's Required Skills section — same convention the in-game Mastery tab
 * uses (green tick / partial / red X), so it reads the same wherever a skill
 * requirement shows up.
 */
export function SkillStatusIcon({ status }: { status: SkillTrainingStatus }) {
  const { t } = useTranslation();
  if (status === 'trained') {
    return (
      <span className="text-success" aria-label={t('skills.status.trained')}>
        <Icon.SeverityClear size={Icon.ICON_SIZE.sm} />
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="text-warning" aria-label={t('skills.status.partial')}>
        <Icon.Warn size={Icon.ICON_SIZE.sm} />
      </span>
    );
  }
  return (
    <span className="text-danger" aria-label={t('skills.status.missing')}>
      <Icon.Close size={Icon.ICON_SIZE.sm} />
    </span>
  );
}
