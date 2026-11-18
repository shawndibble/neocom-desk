/**
 * The active Character's corporation's Doctrine Fits as Fittings library rows (#6202). Members
 * read them through a member-verified callable (the Firestore rules keep them officers-only), so a
 * Character who left the corp, or one in a corp without SRP, simply has none: no rows, no empty
 * state. Loaded when the library opens and on its refresh, never live; a load is kept for
 * `DOCTRINE_FITS_TTL_MS` per Character and corp, so the page, its Open dialog and the Compare
 * picker mounting one after another call the backend once. The refresh always reads again.
 */
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

/**
 * Doctrine Fits as list rows. A fit saved with its share code opens whole; an older one is
 * rebuilt from its snapshot (hull, modules, rigs, subsystems) and marked `legacy`. One that cannot
 * be encoded is left out.
 */
export async function doctrineRows(
  fits: readonly MemberDoctrineFit[],
  hullName: (typeId: number) => string,
  slotByTypeId: () => Promise<EftSlotLookup>
): Promise<DoctrineRow[]> {
  const rows: DoctrineRow[] = [];
  let slots: Promise<EftSlotLookup> | null = null; // read once, and only when an older fit needs it
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

/** How long a Character's loaded Doctrine Fits stand before a mount reads them again. */
export const DOCTRINE_FITS_TTL_MS = 5 * MINUTE_MS;

/** This session's loads, by `characterId:corporationId`. */
const loaded = new Map<string, { at: number; rows: DoctrineRow[] }>();

/** Forgets every load (tests: one file's mounts must not feed the next test's). */
export function clearDoctrineFitsCache(): void {
  loaded.clear();
}

/** The Character's corp Doctrine Fits as rows, and a refresh. Nothing loads without sync or a player corp. */
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
  /** `character|corporation` whose read last finished, landed or failed: its rows are final. */
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const key = `${characterId}|${corporationId}`;

  const load = useCallback(
    async (force: boolean) => {
      const requestId = ++requestIdRef.current;
      const settle = () => {
        // Still reading which corporation the Character is in: not settled yet.
        if (requestId === requestIdRef.current && corporationId !== undefined) {
          setSettledFor(`${characterId}|${corporationId}`);
        }
      };
      if (
        characterId === null ||
        corporationId == null ||
        isNpcCorporationId(corporationId) ||
        // SRP lives in the cloud backend: none configured, no Doctrine Fits (a story's stand-in aside)
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
        // Not a member any more, offline, or signed out of sync: no Doctrine rows, the rest stands.
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

  // A previous Character's (or corp's) fits are not this one's until its own land.
  const current =
    state?.forCharacter === characterId && state.forCorporation === corporationId ? state : null;
  return {
    rows: current?.rows ?? EMPTY,
    refresh,
    /** This Character's Doctrine rows have loaded, or will not. */
    settled: settledFor === key,
  };
}

const EMPTY: DoctrineRow[] = [];
