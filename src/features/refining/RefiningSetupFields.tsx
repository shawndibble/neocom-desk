import { useTranslation } from 'react-i18next';
import { Field } from '@/components/ui';
import { facilityBaseYieldFor } from '@/engine/industry/refiningSetup';
import { formatPercent } from './formatPercent';
import { InlinePercent } from './InlinePercent';
import { useReferenceSkillsMultiplier } from './useReferenceSkillsMultiplier';
import type { useRefiningSetup } from './useRefiningSetup';

const ON_COLUMN_EDGE = 'md:-ml-[5px]';

export function RefiningSetupFields({
  refining,
}: {
  refining: ReturnType<typeof useRefiningSetup>;
}) {
  const { t } = useTranslation();
  const multiplier = useReferenceSkillsMultiplier();
  return (
    <>
      {multiplier === null ? (
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
      ) : (
        <Field
          label={t('settings.reprocessingYieldLabel')}
          note={t('settings.reprocessingYieldHint', {
            base: formatPercent(refining.setup.stationRate),
            multiplier: multiplier.toFixed(3),
          })}
        >
          <InlinePercent
            className={ON_COLUMN_EDGE}
            fraction={refining.setup.stationRate * multiplier}
            name={t('settings.reprocessingYieldLabel')}
            min={1}
            max={Math.floor(multiplier * 100)}
            onCommit={(total) => {
              const base = facilityBaseYieldFor(total, multiplier);
              if (base !== null) void refining.setYieldRate(base);
            }}
          />
        </Field>
      )}
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
