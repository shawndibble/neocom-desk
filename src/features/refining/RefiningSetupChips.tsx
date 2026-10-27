import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import { InlinePercent } from './InlinePercent';
import { useRefiningSetup } from './useRefiningSetup';

/**
 * The pilot's Facility Yield and Reprocessing Tax, edited where the refined
 * number they move is shown. Two chips, each a number that swaps to a field
 * on click, with a tooltip on where to find it in the client.
 */
export function RefiningSetupChips() {
  const { t } = useTranslation();
  const { setup, setYieldRate, setTaxRate } = useRefiningSetup();
  return (
    <>
      <StatChip
        label={t('market.appraisal.refineYield')}
        tooltip={t('market.appraisal.refineYieldHelp')}
        value={
          <InlinePercent
            fraction={setup.stationRate}
            name={t('market.appraisal.refineYield')}
            min={1}
            max={100}
            onCommit={(fraction) => void setYieldRate(fraction)}
          />
        }
      />
      <StatChip
        label={t('market.appraisal.refineTax')}
        tooltip={t('market.appraisal.refineTaxHelp')}
        value={
          <InlinePercent
            fraction={setup.taxRate}
            name={t('market.appraisal.refineTax')}
            min={0}
            max={100}
            onCommit={(fraction) => void setTaxRate(fraction)}
          />
        }
      />
    </>
  );
}
