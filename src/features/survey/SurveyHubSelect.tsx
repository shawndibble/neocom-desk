import { useTranslation } from 'react-i18next';
import { HubField } from '@/features/market/HubMenu';

export function SurveyHubSelect() {
  const { t } = useTranslation();
  return (
    <HubField
      area="mining"
      side="sell"
      size="sm"
      className="min-w-0"
      label={t('survey.priceHub')}
    />
  );
}
