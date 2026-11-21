import { useTranslation } from 'react-i18next';
import { HubField } from '@/features/market/HubMenu';

/**
 * The Trade Hub the Survey's ISK figures are priced at, beside the copy
 * button: the shared hub menu for the Mining page hub. Unlabelled: the
 * aria-label names it.
 */
export function SurveyHubSelect() {
  const { t } = useTranslation();
  return <HubField area="mining" size="sm" className="min-w-0" label={t('survey.priceHub')} />;
}
