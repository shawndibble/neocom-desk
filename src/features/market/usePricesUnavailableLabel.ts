import { useTranslation } from 'react-i18next';
import { useOnline } from '@/stores/network';

/**
 * The neutral placeholder for a price that could not be fetched: "offline"
 * when the browser knows it has no connection, "right now" for an outage with
 * the connection up (a Fuzzwork or ESI failure). One owner, so every
 * placeholder site words the same fact the same way.
 */
export function usePricesUnavailableLabel(): string {
  const { t } = useTranslation();
  const online = useOnline();
  return online ? t('common.pricesUnavailable') : t('common.pricesUnavailableOffline');
}
