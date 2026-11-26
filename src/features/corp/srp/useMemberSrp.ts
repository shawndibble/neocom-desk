import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAY_MS } from '@/lib/age';
import { useEndpointsGranted } from '@/app/useGrantedScopes';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import type { DoctrinePreview, FileSrpClaimInput, FiledSrpClaim, SrpStatus } from '../srpTypes';
import { recordSrpProbe } from './srpNavProbe';
import { srpMemberBackend } from './srpMemberBackend';
import { lostRowKind, type LostLoss, type LostRowKind, type MemberClaim } from './srpMemberModel';

export type Load<T> = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; value: T };

export interface LostRow extends LostLoss {
  kind: LostRowKind;
  ageDays: number;
  hullName: string;
  systemName: string;
}

export interface MemberSrp {
  status: Load<SrpStatus>;
  claims: Load<MemberClaim[]>;
  losses: Load<LostRow[]> | { state: 'denied' } | { state: 'unknown' };
  names: { hull: (typeId: number) => string; system: (systemId: number) => string };
  retry: () => void;
  file: (input: FileSrpClaimInput) => Promise<FiledSrpClaim>;
  previewDoctrine: (killmail: string) => Promise<DoctrinePreview>;
}

export const KILLMAIL_ENDPOINTS = ['getCharacterKillmailsRecent'] as const;

function useLoad<T>(key: string, load: (() => Promise<T>) | null): [Load<T>, () => void] {
  const [stored, setStored] = useState<{ key: string; result: Load<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const active = load !== null;
  useEffect(() => {
    const read = loadRef.current;
    if (read === null) return;
    let cancelled = false;
    void read().then(
      (value) => !cancelled && setStored({ key, result: { state: 'ready', value } }),
      () => !cancelled && setStored({ key, result: { state: 'failed' } })
    );
    return () => {
      cancelled = true;
    };
  }, [key, active, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return [stored?.key === key ? stored.result : { state: 'loading' }, reload];
}

export function useMemberSrp(characterId: number, corporationId: number): MemberSrp {
  const backend = srpMemberBackend();
  const scope = `${characterId}:${corporationId}`;
  const [status, reloadStatus] = useLoad(scope, () => backend.status(characterId, corporationId));
  const enabled = status.state === 'ready' && status.value.enabled;
  const [claims, reloadClaims] = useLoad(
    scope,
    enabled ? () => backend.claims(characterId, corporationId) : null
  );

  const granted = useEndpointsGranted(KILLMAIL_ENDPOINTS);
  const [losses, reloadLosses] = useLoad(
    scope,
    enabled && granted === true
      ? async () => ({
          losses: await backend.lostLosses(characterId, corporationId),
          at: Date.now(),
        })
      : null
  );

  useEffect(() => {
    if (status.state === 'ready') recordSrpProbe(characterId, corporationId, status.value.enabled);
  }, [status, characterId, corporationId]);

  const lossList = losses.state === 'ready' ? losses.value.losses : null;
  const [hullNames, setHullNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [systems, setSystems] = useState<ReadonlyMap<number, { name: string }>>(new Map());
  const claimList = claims.state === 'ready' ? claims.value : null;
  useEffect(() => {
    const typeIds = [
      ...new Set([
        ...(lossList ?? []).map((l) => l.hullTypeId),
        ...(claimList ?? []).map((c) => c.hullTypeId),
      ]),
    ];
    if (typeIds.length === 0) return;
    let cancelled = false;
    loadTypeNames(typeIds)
      .then((map) => !cancelled && setHullNames(map))
      .catch(() => undefined);
    loadSolarSystemsById()
      .then((byId) => {
        if (cancelled || !byId) return;
        setSystems(byId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lossList, claimList]);

  const names = useMemo(
    () => ({
      hull: (typeId: number) => hullNames.get(typeId) ?? `#${typeId}`,
      system: (systemId: number) => systems.get(systemId)?.name ?? `#${systemId}`,
    }),
    [hullNames, systems]
  );

  const lossesState: MemberSrp['losses'] = useMemo(() => {
    if (granted === undefined) return { state: 'unknown' };
    if (!granted) return { state: 'denied' };
    if (losses.state !== 'ready') return losses;
    if (status.state !== 'ready' || !status.value.settings) return { state: 'loading' };
    const { hullRules, windowDays } = status.value.settings;
    const now = losses.value.at;
    return {
      state: 'ready',
      value: losses.value.losses.flatMap((loss) => {
        const kind = lostRowKind(loss, { claims: claimList ?? [], hullRules, windowDays, now });
        if (kind === 'old') return [];
        return [
          {
            ...loss,
            kind,
            ageDays: Math.max(0, Math.floor((now - loss.killedAt) / DAY_MS)),
            hullName: names.hull(loss.hullTypeId),
            systemName: names.system(loss.solarSystemId),
          },
        ];
      }),
    };
  }, [granted, losses, status, claimList, names]);

  const file = useCallback(
    async (input: FileSrpClaimInput) => {
      const filed = await backend.file(characterId, corporationId, input);
      reloadClaims();
      return filed;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, corporationId, reloadClaims]
  );

  const previewDoctrine = useCallback(
    (killmail: string) => backend.previewDoctrine(characterId, corporationId, killmail),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characterId, corporationId]
  );

  const retry = useCallback(() => {
    reloadStatus();
    reloadClaims();
    reloadLosses();
  }, [reloadStatus, reloadClaims, reloadLosses]);

  return { status, claims, losses: lossesState, names, retry, file, previewDoctrine };
}
