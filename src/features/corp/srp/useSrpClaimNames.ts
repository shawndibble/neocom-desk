import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadTypes } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';

export interface SrpClaimNames {
  hull: (typeId: number) => string;
  system: (systemId: number) => string;
}

/** Hull and system names for the queue's rows, from the SDE the app ships. An unknown id reads "Hull <id>". */
export function useSrpClaimNames(): SrpClaimNames {
  const { t } = useTranslation();
  const [hulls, setHulls] = useState<ReadonlyMap<number, string>>(new Map());
  const [systems, setSystems] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    loadTypes()
      .then((types) => {
        if (cancelled) return;
        setHulls(new Map(Object.entries(types).map(([id, type]) => [Number(id), type.name])));
      })
      .catch(() => undefined);
    loadSolarSystemsById()
      .then((byId) => {
        if (cancelled || !byId) return;
        setSystems(new Map([...byId].map(([id, entry]) => [id, entry.name])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return useMemo(
    () => ({
      hull: (id) => hulls.get(id) ?? t('srp.officer.hullFallback', { id }),
      system: (id) => systems.get(id) ?? t('srp.officer.systemFallback', { id }),
    }),
    [hulls, systems, t]
  );
}
