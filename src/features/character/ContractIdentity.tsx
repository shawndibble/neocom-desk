/**
 * A History row's identity: the contract's title, or — for an untitled
 * courier, which is most of them — its route, so three in-progress hauls
 * don't all read "Courier" (issue #1706). The names come from the same
 * resolver the detail modal uses. Until both resolve (or if either can't) the
 * generic type label stands, as before; collateral rides on a meta line.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useBuybackLinks } from '@/features/communities/buybackLinks';
import { loadContractLocationName } from './contractLocationName';
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
      loadContractLocationName(characterId ?? 0, startId ?? 0),
      loadContractLocationName(characterId ?? 0, endId ?? 0),
    ]);
    return { start, end };
  }, [characterId, startId, endId]);
  const route = useKeyedLoad(
    eligible ? `${characterId}:${startId}:${endId}` : null,
    loadRoute
  ).data;

  // A contract that is a buyback Quote's carries the Community mark (DESIGN.md 6c), not a column of its own.
  const cue = buyback && (
    <Tooltip
      content={t('contracts.buyback.cue', {
        title: buyback.requestTitle,
        community: buyback.communityName,
      })}
    >
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
