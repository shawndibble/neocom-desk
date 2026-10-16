import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import type { HaulingFlag } from '@/engine/market/haulingMarket';

/** The `market.hauling.flags` key for each flag; its tooltip is the same key plus `Tip`. */
const FLAG_KEY: Record<HaulingFlag, 'thin' | 'crowded' | 'outlier' | 'lowMargin'> = {
  thin: 'thin',
  crowded: 'crowded',
  outlier: 'outlier',
  'low-margin': 'lowMargin',
};

/**
 * A Hauling row's heads-up as a word ("Thin market", "Crowded") in small
 * warning-coloured text, its meaning behind the dotted underline (`HintText`).
 * Its own component so the table can show the same words as the item detail.
 */
export function HaulingFlagWord({ flag }: { flag: HaulingFlag }) {
  const { t } = useTranslation();
  const key = FLAG_KEY[flag];
  return (
    <HintText
      content={t(`market.hauling.flags.${key}Tip`)}
      className="shrink-0 text-[0.6875rem] whitespace-nowrap text-warning"
    >
      {t(`market.hauling.flags.${key}`)}
    </HintText>
  );
}
