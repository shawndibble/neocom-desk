import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { isNpcCorporationId } from '@/esi/entityIds';
import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import type { EftSlotLookup } from '@/engine/fittings/eftLoader';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { fittingFromDoctrineSnapshot } from '@/engine/srpDoctrineFit';
import { srpDoctrineBackendOverride } from '@/features/corp/srpBackendOverride';
import type { MemberDoctrineFit } from '@/features/corp/srpTypes';
import { MINUTE_MS } from '@/lib/age';
import { typeNameOr } from '@/lib/typeNameOr';
import { loadFittingSlots, loadTypes } from '@/sde/loadSde';
import type { LibraryRow } from './useLibraryFittings';

export type DoctrineRow = Extract<LibraryRow, { source: 'doctrine' }>;

export async function doctrineRows(
  fits: readonly MemberDoctrineFit[],
  hullName: (typeId: number) => string,
  slotByTypeId: () => Promise<EftSlotLookup>
): Promise<DoctrineRow[]> {
  const rows: DoctrineRow[] = [];
  let slots: Promise<EftSlotLookup> | null = null;
  for (const fit of fits) {
    const base = {
      id: `doctrine-${fit.id}`,
      name: fit.name,
      hull: hullName(fit.snapshot.hullTypeId),
    };
    if (fit.shareCode) {
      rows.push({ ...base, source: 'doctrine', code: fit.shareCode, legacy: false });
      continue;
    }
    const fitting = fittingFromDoctrineSnapshot(
      fit.snapshot,
      fit.name,
      await (slots ??= slotByTypeId())
    );
    const encoded = await encodeFittingShare(fittingToShareInput(fitting));
    if (encoded.ok) rows.push({ ...base, source: 'doctrine', code: encoded.payload, legacy: true });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function loadRows(characterId: number, corporationId: number, t: TFunction) {
  const { listCorpDoctrineFits } = await import('@/features/corp/srpDoctrineClient');
  const fits = await listCorpDoctrineFits(characterId, corporationId);
  if (fits.length === 0) return [];
  const types = await loadTypes();
  return doctrineRows(
    fits,
    (typeId) => typeNameOr(t, types[String(typeId)]?.name, typeId),
    loadFittingSlots
  );
}

export const DOCTRINE_FITS_TTL_MS = 5 * MINUTE_MS;

const loaded = new Map<string, { at: number; rows: DoctrineRow[] }>();

export function clearDoctrineFitsCache(): void {
  loaded.clear();
}

export function useCorpDoctrineFittings(characterId: number | null) {
  const { t } = useTranslation();
  const corporationId = useLiveQuery(
    async () =>
      characterId === null ? null : ((await db.characters.get(characterId))?.corporationId ?? null),
    [characterId]
  );
  const [state, setState] = useState<{
    forCharacter: number;
    forCorporation: number;
    rows: DoctrineRow[];
  } | null>(null);
  const requestIdRef = useRef(0);
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const key = `${characterId}|${corporationId}`;

  const load = useCallback(
    async (force: boolean) => {
      const requestId = ++requestIdRef.current;
      const settle = () => {
        if (requestId === requestIdRef.current && corporationId !== undefined) {
          setSettledFor(`${characterId}|${corporationId}`);
        }
      };
      if (
        characterId === null ||
        corporationId == null ||
        isNpcCorporationId(corporationId) ||
        (!isSyncConfigured() && !srpDoctrineBackendOverride())
      ) {
        setState(null);
        settle();
        return;
      }
      const cacheKey = `${characterId}:${corporationId}`;
      const cached = loaded.get(cacheKey);
      if (!force && cached && Date.now() - cached.at < DOCTRINE_FITS_TTL_MS) {
        setState({ forCharacter: characterId, forCorporation: corporationId, rows: cached.rows });
        settle();
        return;
      }
      try {
        const rows = await loadRows(characterId, corporationId, t);
        loaded.set(cacheKey, { at: Date.now(), rows });
        if (requestId === requestIdRef.current) {
          setState({ forCharacter: characterId, forCorporation: corporationId, rows });
        }
      } catch {
        loaded.delete(cacheKey);
        if (requestId === requestIdRef.current) setState(null);
      }
      settle();
    },
    [characterId, corporationId, t]
  );
  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a Character or corp change re-reads the corp's fits, not a render-time derivation
    void load(false);
  }, [load]);

  const current =
    state?.forCharacter === characterId && state.forCorporation === corporationId ? state : null;
  return {
    rows: current?.rows ?? EMPTY,
    refresh,
    settled: settledFor === key,
  };
}

const EMPTY: DoctrineRow[] = [];
