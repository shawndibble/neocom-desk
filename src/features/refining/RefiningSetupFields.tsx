import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui';
import { InlinePercent } from './InlinePercent';
import type { useRefiningSetup } from './useRefiningSetup';

/**
 * Pulls the value's text onto the control column's edge (the hint and the
 * selects sit there): the button's 1px border and `px-1` are 5px of inset, so
 * its hover box hangs into the gutter instead. Phone rows keep the inset.
 */
const ON_COLUMN_EDGE = 'md:-ml-[5px]';

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
          className={ON_COLUMN_EDGE}
          fraction={refining.setup.stationRate}
          name={t('settings.refiningYieldLabel')}
          min={1}
          max={100}
          onCommit={(fraction) => void refining.setYieldRate(fraction)}
        />
      </Field>
      <Field label={t('settings.refiningTaxLabel')} note={t('settings.refiningTaxHint')}>
        <InlinePercent
          className={ON_COLUMN_EDGE}
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
