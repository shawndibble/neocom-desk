import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { buybackCueText, useBuybackLinks } from '@/features/communities/buybackLinks';
import { loadContractSystemName } from './contractLocationName';
import { CONTRACT_TYPE_KEY } from './contractLabels';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
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
  const buyback = useBuybackLinks(characterId).get(contract.contract_id);
  const untitledCourier = isUntitledCourier(contract);
  const { start_location_id: startId, end_location_id: endId } = contract;
  const eligible = untitledCourier && characterId !== null && !!startId && !!endId;
  const loadRoute = useCallback(async () => {
    const [start, end] = await Promise.all([
      loadContractSystemName(characterId ?? 0, startId ?? 0),
      loadContractSystemName(characterId ?? 0, endId ?? 0),
    ]);
    return { start, end };
  }, [characterId, startId, endId]);
  const route = useKeyedLoad(
    eligible ? `${characterId}:${startId}:${endId}` : null,
    loadRoute
  ).data;

  const cue = buyback && (
    <Tooltip content={buybackCueText(t, buyback)}>
      <span tabIndex={0} className="ml-1.5 inline-flex align-middle text-text-dim">
        <Icon.NavCommunities aria-label={t('contracts.buyback.cueLabel')} role="img" />
      </span>
    </Tooltip>
  );

  if (!untitledCourier) {
    return (
      <>
        {contract.title || t(CONTRACT_TYPE_KEY[contract.type])}
        {cue}
      </>
    );
  }

  const label =
    route?.start && route.end
      ? t('contracts.courierRoute', { start: route.start, end: route.end })
      : t(CONTRACT_TYPE_KEY[contract.type]);
  return (
    <span className="min-w-0 break-words">
      {label}
      {contract.collateral !== undefined && (
        <span className="ml-2 text-xs font-normal text-text-dim">
          {t('contracts.collateralMeta', {
            value: formatIskAuto(contract.collateral, CONTRACT_ISK_CENTS_BELOW),
          })}
        </span>
      )}
    </span>
  );
}
