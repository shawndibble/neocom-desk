/**
 * The ⓘ explanation modal of the hauling table (DESIGN.md §6c): how the rows were picked and
 * where each number came from, plus where this scan's demand and order books came from.
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { formatAge } from '@/lib/age';
import type { HaulingScan } from './haulingData';

interface HaulingHowItWorksProps {
  open: boolean;
  onClose: () => void;
  /** Instant mode sells into standing buy orders: no demand step. */
  instant: boolean;
  scan: Pick<HaulingScan, 'booksSource' | 'booksAsOf' | 'demandSource' | 'fetchedAt'>;
}

export function HaulingHowItWorks({ open, onClose, instant, scan }: HaulingHowItWorksProps) {
  const { t } = useTranslation();
  const mode = instant ? 'Instant' : 'List';
  const steps = [
    {
      key: 'price',
      title: t('market.hauling.how.priceTitle'),
      body: t(`market.hauling.how.price${mode}`),
    },
    ...(instant
      ? []
      : [
          {
            key: 'demand',
            title: t('market.hauling.how.demandTitle'),
            body: t('market.hauling.how.demand'),
          },
        ]),
    {
      key: 'books',
      title: t('market.hauling.how.booksTitle'),
      body: t('market.hauling.how.books'),
    },
    {
      key: 'numbers',
      title: t('market.hauling.how.numbersTitle'),
      body: t(`market.hauling.how.numbers${mode}`),
    },
  ];
  const demand =
    instant || !scan.demandSource
      ? null
      : t(
          scan.demandSource === 'daily'
            ? 'market.hauling.how.thisDemandDaily'
            : 'market.hauling.how.thisDemandEsi'
        );
  const books =
    scan.booksSource === 'snapshot' && scan.booksAsOf
      ? t('market.hauling.how.thisBooksSnapshot', {
          age: formatAge(scan.fetchedAt - scan.booksAsOf, t),
        })
      : t('market.hauling.how.thisBooksEsi');
  return (
    <Modal open={open} onClose={onClose} title={t('market.hauling.how.title')}>
      <div className="flex flex-col gap-3 text-sm text-text">
        <p className="text-text-dim">{t('market.hauling.how.intro')}</p>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.key}>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-text-dim">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="border-t border-line pt-3">
          <h3 className="font-medium">{t('market.hauling.how.thisScanTitle')}</h3>
          <ul className="list-disc pl-5 text-text-dim">
            {demand && <li>{demand}</li>}
            <li>{books}</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
