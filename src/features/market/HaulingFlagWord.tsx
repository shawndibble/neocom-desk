import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import type { HaulingFlag } from '@/engine/market/haulingMarket';
import { HAULING_FLAG_KEY } from './haulingFlagKeys';

export function HaulingFlagWord({ flag }: { flag: HaulingFlag }) {
  const { t } = useTranslation();
  const key = HAULING_FLAG_KEY[flag];
  return (
    <HintText
      content={t(`market.hauling.flags.${key}Tip`)}
      className="shrink-0 text-[0.6875rem] whitespace-nowrap text-warning"
    >
      {t(`market.hauling.flags.${key}`)}
    </HintText>
  );
}
