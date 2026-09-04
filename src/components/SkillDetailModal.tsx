/**
 * Shared, read-only skill detail lookup (CONTEXT.md round 49): description,
 * prerequisites (trained vs. still needed), and unlocks for one skill, opened
 * from any feature that renders a skill name via
 * `openSkillDetailModal`/`useSkillDetailModal` (`stores/skillDetailModal.ts`).
 * Mounted once in `App.tsx`, same "always mounted, driven by a global
 * signal" shape as `PublicInfoModal` — needed here for the same reason: the
 * trigger comes from several unrelated features (Skills, Skill Plan Editor)
 * rather than one route that already owns local `selected` state.
 *
 * Self-fetches the SDE skill catalog and the active character's trained
 * skills (via `correctedSkills.ts`, same source Skills/Plan Editor read, so
 * a level the training queue already finished but /skills hasn't caught up
 * to still shows as trained here) from just a typeID, so callers don't need
 * to have either loaded already — `buildSkillRequirements`
 * (features/skills/skillRequirements.ts) already does the trained-vs-needed
 * comparison, this just supplies its inputs.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal, Spinner } from '@/components/ui';
import { SkillRequirementsList } from '@/features/skills/SkillRequirementsList';
import {
  buildSkillRequirements,
  type SkillRequirements,
} from '@/features/skills/skillRequirements';
import { loadSkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import type { TrainedSkill } from '@/engine/types';

type ModalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | { status: 'ready'; data: SkillRequirements };

const IDLE: ModalState = { status: 'idle' };

export function SkillDetailModal() {
  const { t } = useTranslation();
  const request = useSkillDetailModalStore((state) => state.request);
  const close = useSkillDetailModalStore((state) => state.close);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [state, setState] = useState<ModalState>(IDLE);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void (async () => {
      setState({ status: 'loading' });
      try {
        const catalog = await loadSkillCatalog();
        if (cancelled) return;

        let trainedSkills: ReadonlyMap<number, TrainedSkill> = new Map();
        if (activeCharacterId !== null) {
          const corrected = await loadCorrectedSkills(activeCharacterId, Date.now(), {
            skipQueueWithoutScope: true,
          });
          if (cancelled) return;
          trainedSkills = corrected.trained;
        }

        const requirements = buildSkillRequirements(catalog, trainedSkills, request.typeID);
        if (cancelled) return;
        setState(requirements ? { status: 'ready', data: requirements } : { status: 'not-found' });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request, activeCharacterId]);

  if (!request) return null;

  const title = state.status === 'ready' ? state.data.name : t('skills.detail.title');

  return (
    <Modal open onClose={close} title={title}>
      {state.status === 'loading' || state.status === 'idle' ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : state.status === 'error' || state.status === 'not-found' ? (
        <EmptyState
          title={t('common.loadFailedTitle')}
          hint={t('common.loadFailedHint')}
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          {state.data.description && (
            <p className="text-xs text-text-dim">{state.data.description}</p>
          )}
          <SkillRequirementsList prereqs={state.data.prereqs} unlocks={state.data.unlocks} />
        </div>
      )}
    </Modal>
  );
}
