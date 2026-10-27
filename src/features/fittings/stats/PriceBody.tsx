import { lazy, Suspense, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, IskAmount } from '@/components/ui';
import { guarded } from '@/app/routeChunks';
import type { PriceView } from './priceView';
import { PriceHubSelect } from '../PriceHubSelect';
import { StatField, StatFields, StatNote } from '../StatFacts';

const FittingAppraisalModal = lazy(() =>
  guarded(() => import('../FittingAppraisalModal')).then((m) => ({
    default: m.FittingAppraisalModal,
  }))
);

export function IskLabel({ value }: { value: number }) {
  return (
    <Trans
      i18nKey="fittings.stats.unit.iskAmount"
      components={{ isk: <IskAmount value={value} /> }}
    />
  );
}

export function PriceBody({ view }: { view: PriceView }) {
  const { t } = useTranslation();
  const [appraisalOpen, setAppraisalOpen] = useState(false);
  const { named, unpriced } = view;
  return (
    <>
      <StatFields>
        <StatField label={t('fittings.stats.priceHub')}>
          <PriceHubSelect size="sm" bare />
          <Button size="sm" onClick={() => setAppraisalOpen(true)}>
            {t('fittings.appraisal.open')}
          </Button>
        </StatField>
      </StatFields>
      {appraisalOpen && (
        <Suspense fallback={null}>
          <FittingAppraisalModal open onClose={() => setAppraisalOpen(false)} price={named} />
        </Suspense>
      )}
      {unpriced.length > 0 && (
        <StatNote tone="warning">
          <p>{t('fittings.stats.priceUnpriced', { count: unpriced.length })}</p>
          <ul className="mt-0.5 list-disc pl-4">
            {unpriced.map((row) => (
              <li key={row.typeId}>
                {row.name}
                {row.quantity > 1 && ` ×${row.quantity}`}
              </li>
            ))}
          </ul>
        </StatNote>
      )}
    </>
  );
}
