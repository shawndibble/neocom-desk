import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TradeHub } from '@/market/hubs';
import { hubForPayee } from './pricing';
import { typeLabels } from './typeLabels';

/**
 * The body of the Mining Tax "some ore could not be priced" banner. Decided
 * per hub: a hub that answered with no buy orders keeps the "move that payee
 * to a busier hub" advice, while a hub whose price source could not be reached
 * (offline) says so, since a busier hub would not help.
 */
export function UnpricedOreDetail({
  unpricedByHub,
  unreachableHubs,
  typeNames,
  children,
}: {
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  unreachableHubs: ReadonlySet<TradeHub['id']>;
  typeNames: ReadonlyMap<number, string>;
  /** Extra content after the explanation, e.g. the entries to open. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const hubs = [...unpricedByHub].filter(([, typeIds]) => typeIds.size > 0);
  const offline = hubs.filter(([hubId]) => unreachableHubs.has(hubId));
  const thin = hubs.filter(([hubId]) => !unreachableHubs.has(hubId));
  return (
    <>
      {offline.length > 0 && (
        <>
          <ul className="space-y-0.5">
            {offline.map(([hubId, typeIds]) => (
              <li key={hubId}>
                {t('miningTax.unpricedOfflineAtHub', {
                  hub: hubForPayee(hubId).systemName,
                  types: typeLabels(typeIds, typeNames),
                })}
              </li>
            ))}
          </ul>
          <p>{t('miningTax.unpricedOfflineHint')}</p>
        </>
      )}
      {thin.length > 0 && (
        <>
          <ul className="space-y-0.5">
            {thin.map(([hubId, typeIds]) => (
              <li key={hubId}>
                {t('miningTax.unpricedAtHub', {
                  hub: hubForPayee(hubId).systemName,
                  types: typeLabels(typeIds, typeNames),
                })}
              </li>
            ))}
          </ul>
          <p>{t('miningTax.unpricedHint')}</p>
        </>
      )}
      {children}
    </>
  );
}
