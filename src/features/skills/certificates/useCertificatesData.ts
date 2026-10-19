/**
 * What the Certificates tab draws from: the baked certificates, plus the
 * active Character's skills, attributes, implants and Clone State — the same
 * inputs, from the same hooks, the Skill Plan editor and the Ship Info
 * mastery tab cost training with, so a certificate's time matches theirs.
 */
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
    /** ESI has answered for this Character's skills — until then nothing is graded. */
    skillsKnown: editor.trainedSkillsKnown && cloneStatesHydrated,
    attributes: editor.attributes,
    implants: editor.implants,
    cloneState,
    /** When the queue-corrected skills were read, for the header's `DataAgeBadge`. */
    fetchedAt: editor.fetchedAt,
    /** Those skills are the saved copy: ESI could not be reached. */
    fromCache: editor.fromCache,
    /** Re-reads skills and re-grades in place; the rows stay up meanwhile. */
    refresh: editor.reload,
  };
}
