/**
 * What the shared info modal shows below the header for an NPC faction,
 * corporation or agent: the pilot's standing chain, what it opens, what it is
 * worth at the owner's stations, where it is and who the pilot knows there.
 * Each card loads on its own and is left out when its data is missing; with no
 * Character signed in only the facts (Where) remain. Lazy-loaded by the modal.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessBlock,
  KnownBlock,
  LoyaltyLine,
  StandingBlock,
  StationsBlock,
  WhereBlock,
} from './NpcInfoBlocks';
import type { NpcInfoTarget, OwnerTarget } from './npcInfoLoaders';
import { asAgentLevel } from '@/engine/standings';
import { accessModel, standingModel } from './npcInfoModel';
import {
  useChainData,
  useKnownRows,
  useLoyalty,
  useStationsModel,
  useWhereRows,
} from './useNpcInfo';

export default function NpcInfoView({ kind, id }: NpcInfoTarget) {
  const { t } = useTranslation();
  const target = useMemo<NpcInfoTarget>(() => ({ kind, id }), [kind, id]);
  const owner = useMemo<OwnerTarget | null>(
    () => (kind === 'agent' ? null : { kind, id }),
    [kind, id]
  );
  const chainLoad = useChainData(target);
  const data = chainLoad.data;
  const stations = useStationsModel(owner, data);
  const where = useWhereRows(target);
  const known = useKnownRows(owner, data);
  const loyaltyCorporationId = kind === 'corporation' ? id : (data?.corporationId ?? null);
  const loyalty = useLoyalty(loyaltyCorporationId);

  const standing = useMemo(
    () => (data ? standingModel(data.chain, data.nameOf, data.skills !== null) : null),
    [data]
  );
  // Access is gated by the standing the pilot's skills lift: with skills unknown it
  // has no honest answer (the standing card still shows the base numbers).
  const access = useMemo(
    () =>
      data?.skills
        ? accessModel(data.chain, data.agent ? asAgentLevel(data.agent.level) : null, data.nameOf)
        : null,
    [data]
  );

  const stationRows = stations.data;
  const knownRows = known.data;
  const whereRows = where.data;
  const loyaltyModel = loyalty.data;
  return (
    <div className="flex flex-col gap-3 text-sm">
      {chainLoad.status === 'failed' && (
        <p className="text-xs text-text-dim">{t('publicInfo.npc.standing.unavailable')}</p>
      )}
      {(standing || access) && (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {standing && <StandingBlock model={standing} />}
          {access && <AccessBlock model={access} />}
        </div>
      )}
      {stationRows && stationRows.rows.length > 0 && <StationsBlock model={stationRows} />}
      {((whereRows && whereRows.length > 0) || (knownRows && knownRows.rows.length > 0)) && (
        <div className="grid items-start gap-3 md:grid-cols-2">
          {whereRows && whereRows.length > 0 && <WhereBlock rows={whereRows} />}
          {knownRows && knownRows.rows.length > 0 && <KnownBlock known={knownRows} />}
        </div>
      )}
      {loyaltyModel && loyaltyCorporationId !== null && (
        <LoyaltyLine corporationId={loyaltyCorporationId} model={loyaltyModel} />
      )}
    </div>
  );
}
