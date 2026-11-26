import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';

export function usePricesUnavailableLabel(): string {
  const { t } = useTranslation();
  const online = useOnline();
  return online ? t('common.pricesUnavailable') : t('common.pricesUnavailableOffline');
}
