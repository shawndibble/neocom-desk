/**
 * A History row's identity: the contract's title, or — for an untitled
 * courier, which is most of them — its route, so three in-progress hauls
 * don't all read "Courier" (issue #1706). The names come from the same
 * resolver the detail modal uses. Until both resolve (or if either can't) the
 * generic type label stands, as before; collateral rides on a meta line.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadContractLocationName } from './contractLocationName';
import { CONTRACT_TYPE_KEY } from './contractLabels';
import { CONTRACT_ISK_CENTS_BELOW, formatIskAuto } from '@/lib/isk';
import type { Contract } from '@/esi/endpoints';

function isUntitledCourier(contract: Contract): boolean {
  return contract.type === 'courier' && !contract.title;
}

export function ContractIdentity({
  contract,
  characterId,
}: {
  contract: Contract;
  characterId: number | null;
}) {
  const { t } = useTranslation();
  const untitledCourier = isUntitledCourier(contract);
  const { start_location_id: startId, end_location_id: endId } = contract;
  const [route, setRoute] = useState<{ start: string | null; end: string | null } | undefined>();

  useEffect(() => {
    if (!untitledCourier || characterId === null || !startId || !endId) return;
    let cancelled = false;
    void Promise.all([
      loadContractLocationName(characterId, startId),
      loadContractLocationName(characterId, endId),
    ]).then(([start, end]) => {
      if (!cancelled) setRoute({ start, end });
    });
    return () => {
      cancelled = true;
    };
  }, [untitledCourier, characterId, startId, endId]);

  if (!untitledCourier) return <>{contract.title || t(CONTRACT_TYPE_KEY[contract.type])}</>;

  const label =
    route?.start && route.end
      ? t('contracts.courierRoute', { start: route.start, end: route.end })
      : t(CONTRACT_TYPE_KEY[contract.type]);
  return (
    <span className="min-w-0">
      <span className="block break-words">{label}</span>
      {contract.collateral !== undefined && (
        <span className="block text-xs font-normal text-text-dim">
          {t('contracts.collateralMeta', {
            value: formatIskAuto(contract.collateral, CONTRACT_ISK_CENTS_BELOW),
          })}
        </span>
      )}
    </span>
  );
}
