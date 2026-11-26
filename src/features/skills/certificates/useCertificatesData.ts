import { useMemo } from 'react';
import type { CloneState } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { loadCertificates } from '@/sde/loadSde';
import type { Certificate } from '@/sde/types';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useHydratedStore } from '@/lib/useHydratedStore';

export type CertificatesLoad =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; certificates: Certificate[] };

export function useCertificatesData(characterId: number | null) {
  const certificatesLoad = useAsyncLoad(loadCertificates);
  const { status, data } = certificatesLoad;
  const load = useMemo<CertificatesLoad>(
    () =>
      status === 'ready'
        ? { status, certificates: data }
        : { status: status === 'failed' ? 'failed' : 'loading' },
    [status, data]
  );
  const editor = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);

  const cloneStatesHydrated = useHydratedStore(useCloneStates);

  const cloneState: CloneState =
    characterId === null ? 'omega' : cloneStateFor(cloneStates, characterId);

  return {
    load,
    catalog: editor.catalog,
    trainedSkills: editor.trainedSkills,
    skillsKnown: editor.trainedSkillsKnown && cloneStatesHydrated,
    attributes: editor.attributes,
    implants: editor.implants,
    cloneState,
    fetchedAt: editor.fetchedAt,
    fromCache: editor.fromCache,
    refresh: editor.reload,
  };
}
