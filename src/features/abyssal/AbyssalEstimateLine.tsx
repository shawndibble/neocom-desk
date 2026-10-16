/**
 * A Mutated module's MutaMarket estimate, in Item Detail's price line (scope
 * decision `20261016-085744-mutamarket-is-the-abyssal-price-source.md`). Looked up
 * once on open, never imported: a module MutaMarket hasn't seen gets an
 * "Ask MutaMarket to price this" button, since importing publishes it on a
 * public MutaMarket page — the warning says so beside the button. Anything but
 * a priced answer is said in words, never shown as 0.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IskAmount, NeedsConnection } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { getAbyssalEstimate, type AbyssalEstimate } from '@/market/mutamarket';

export function AbyssalEstimateLine({
  typeId,
  itemId,
  characterId,
}: {
  typeId: number;
  itemId: number;
  /** MutaMarket is reached through a Character's sync session. */
  characterId: number;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState<{ itemId: number; estimate: AbyssalEstimate } | null>(null);
  const [importing, setImporting] = useState(false);
  const estimate = answer?.itemId === itemId ? answer.estimate : null;

  useEffect(() => {
    let live = true;
    void getAbyssalEstimate(typeId, itemId, { characterId }).then((found) => {
      if (live) setAnswer({ itemId, estimate: found });
    });
    return () => {
      live = false;
    };
  }, [typeId, itemId, characterId]);

  const askToPrice = () => {
    setImporting(true);
    void getAbyssalEstimate(typeId, itemId, { characterId, importIfMissing: true }).then(
      (found) => {
        setAnswer({ itemId, estimate: found });
        setImporting(false);
      }
    );
  };

  const label = t('market.itemDetail.abyssal.estimate.label');
  if (!estimate) {
    return (
      <p className="text-text-dim">
        {label} <span aria-hidden="true">…</span>
        <span className="sr-only">{t('common.loading')}</span>
      </p>
    );
  }

  switch (estimate.status) {
    case 'priced':
      return (
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-text-dim">
            <span>
              {label}{' '}
              <span className="text-text">
                <IskAmount value={estimate.value!} decimals={0} />
              </span>
            </span>
            <ExternalLink href={estimate.url}>{t('market.mutamarket.priceFrom')}</ExternalLink>
          </p>
          <p className="text-[0.6875rem] text-text-faint">{t('market.mutamarket.estimateNote')}</p>
        </div>
      );
    case 'not-imported':
      return (
        <div className="space-y-1.5">
          <p className="text-text-dim">{t('market.itemDetail.abyssal.estimate.notImported')}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <NeedsConnection>
              <Button size="sm" loading={importing} onClick={askToPrice}>
                {t('market.itemDetail.abyssal.estimate.ask')}
              </Button>
            </NeedsConnection>
            <p className="min-w-0 flex-1 basis-56 text-[0.6875rem] text-text-dim">
              {t('market.itemDetail.abyssal.estimate.publicWarning')}
            </p>
          </div>
        </div>
      );
    case 'no-estimate':
      return (
        <p className="flex flex-wrap items-baseline gap-x-2 text-text-dim">
          <span>{t('market.itemDetail.abyssal.estimate.noEstimate')}</span>
          <ExternalLink href={estimate.url}>
            {t('market.itemDetail.abyssal.estimate.open')}
          </ExternalLink>
        </p>
      );
    case 'unknown':
      return <p className="text-text-dim">{t('market.itemDetail.abyssal.estimate.unknown')}</p>;
    case 'unavailable':
      return <p className="text-text-dim">{t('market.itemDetail.abyssal.estimate.unavailable')}</p>;
  }
}
