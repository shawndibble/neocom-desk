/**
 * What the Certificates tab draws from: the baked certificates, plus the
 * active Character's skills, attributes, implants and Clone State — the same
 * inputs, from the same hooks, the Skill Plan editor and the Ship Info
 * mastery tab cost training with, so a certificate's time matches theirs.
 */
import { useEffect, useState } from 'react';
import type { CloneState } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { loadCertificates } from '@/sde/loadSde';
import type { Certificate } from '@/sde/types';

export type CertificatesLoad =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; certificates: Certificate[] };

export function useCertificatesData(characterId: number | null) {
  const [load, setLoad] = useState<CertificatesLoad>({ status: 'loading' });
  const editor = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  const cloneStatesHydrated = useCloneStates((state) => state.hydrated);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);

  useEffect(() => {
    let cancelled = false;
    loadCertificates().then(
      (certificates) => {
        if (!cancelled) setLoad({ status: 'ready', certificates });
      },
      () => {
        if (!cancelled) setLoad({ status: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);

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
  };
}
