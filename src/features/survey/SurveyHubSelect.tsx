import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useSurveyPriceHub } from './surveyPref';
import { useHydratedStore } from '@/lib/useHydratedStore';

/**
 * The Trade Hub the Survey's ISK figures are priced at, beside the copy
 * button. Unlabelled: the aria-label names it. Jita until the pilot picks
 * another, and the browser keeps the pick.
 */
export function SurveyHubSelect() {
  const { t } = useTranslation();
  const hub = useSurveyPriceHub((s) => s.value);
  const setHub = useSurveyPriceHub((s) => s.setValue);
  useHydratedStore(useSurveyPriceHub);
  return (
    <Select value={hub} onValueChange={(value) => void setHub(value as TradeHub['id'])}>
      <SelectTrigger aria-label={t('survey.priceHub')} size="sm" className="min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_HUBS.map((tradeHub) => (
          <SelectItem key={tradeHub.id} value={tradeHub.id}>
            {tradeHub.systemName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
