import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui';
import { InlinePercent } from './InlinePercent';
import type { useRefiningSetup } from './useRefiningSetup';

/**
 * The Refining Setup's two settings fields, Facility Yield and Reprocessing
 * Tax, for a Settings-style form: Settings › Market and the Appraisal page
 * settings render the same pair.
 */
export function RefiningSetupFields({
  refining,
}: {
  refining: ReturnType<typeof useRefiningSetup>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('settings.refiningYieldLabel')} note={t('settings.refiningYieldHint')}>
        <InlinePercent
          fraction={refining.setup.stationRate}
          name={t('settings.refiningYieldLabel')}
          min={1}
          max={100}
          onCommit={(fraction) => void refining.setYieldRate(fraction)}
        />
      </Field>
      <Field label={t('settings.refiningTaxLabel')} note={t('settings.refiningTaxHint')}>
        <InlinePercent
          fraction={refining.setup.taxRate}
          name={t('settings.refiningTaxLabel')}
          min={0}
          max={100}
          onCommit={(fraction) => void refining.setTaxRate(fraction)}
        />
      </Field>
    </>
  );
}
