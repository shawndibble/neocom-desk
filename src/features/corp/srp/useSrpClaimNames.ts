import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { loadTypes } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export interface SrpClaimNames {
  hull: (typeId: number) => string;
  system: (systemId: number) => string;
}

const NO_NAMES: ReadonlyMap<number, string> = new Map();
const loadHullNames = () =>
  loadTypes().then(
    (types) => new Map(Object.entries(types).map(([id, type]) => [Number(id), type.name]))
  );
const loadSystemNames = () =>
  loadSolarSystemsById().then((byId) =>
    byId ? new Map([...byId].map(([id, entry]) => [id, entry.name])) : NO_NAMES
  );

export function useSrpClaimNames(): SrpClaimNames {
  const { t } = useTranslation();
  const hulls = useAsyncLoad(loadHullNames).data ?? NO_NAMES;
  const systems = useAsyncLoad(loadSystemNames).data ?? NO_NAMES;
  return useMemo(
    () => ({
      hull: (id) => hulls.get(id) ?? t('srp.officer.hullFallback', { id }),
      system: (id) => systems.get(id) ?? t('srp.officer.systemFallback', { id }),
    }),
    [hulls, systems, t]
  );
}
