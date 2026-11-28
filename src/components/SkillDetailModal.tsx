import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, Spinner } from '@/components/ui';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import { SkillPlanAdd } from '@/features/skills/SkillPlanAdd';
import { SkillPriceSection } from '@/features/skills/SkillPriceSection';
import { SkillRequirementsList } from '@/features/skills/SkillRequirementsList';
import {
  buildSkillRequirements,
  type SkillRequirements,
} from '@/features/skills/skillRequirements';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { loadSkillCatalog } from '@/features/skills/skillMap';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { useItemUnlocks } from '@/features/skills/loadItemUnlocks';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { romanLevel } from '@/engine/projection';
import type { EngineSkill, TrainedSkill } from '@/engine/types';

type ModalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      data: SkillRequirements;
      engineSkills: ReadonlyMap<number, EngineSkill>;
      trainedSkills: ReadonlyMap<number, TrainedSkill>;
    };

const IDLE: ModalState = { status: 'idle' };

export function SkillDetailModal() {
  const { t } = useTranslation();
  const request = useSkillDetailModalStore((state) => state.request);
  const close = useSkillDetailModalStore((state) => state.close);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const [state, setState] = useState<ModalState>(IDLE);
  const itemUnlocks = useItemUnlocks(request?.typeID ?? null);
  const [attempt, setAttempt] = useState(0);
  const [resultRef, armRetryFocus] = useRetryFocus(
    state.status === 'error'
      ? 'failed'
      : state.status === 'loading' || state.status === 'idle'
        ? 'busy'
        : 'ok',
    request
  );

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

        const requirements = buildSkillRequirements(
          catalog,
          trainedSkills,
          request.typeID,
          request.planEntries
        );
        if (cancelled) return;
        setState(
          requirements
            ? {
                status: 'ready',
                data: requirements,
                engineSkills: catalog.engineSkills,
                trainedSkills,
              }
            : { status: 'not-found' }
        );
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [request, activeCharacterId, attempt]);

  if (!request) return null;

  const title = state.status === 'ready' ? state.data.name : t('skills.detail.title');
  const trainedLevel =
    state.status === 'ready' ? (state.trainedSkills.get(request.typeID)?.level ?? 0) : 0;

  return (
    <Modal
      open
      onClose={close}
      title={title}
      closeOnBack={false}
      titleActions={
        <OpenInEveButton
          kind="marketDetails"
          id={request.typeID}
          name={state.status === 'ready' ? state.data.name : undefined}
        />
      }
    >
      <div ref={resultRef} tabIndex={-1} className="focus:outline-none">
        {state.status === 'loading' || state.status === 'idle' ? (
          <Spinner block="panel" label={t('common.loading')} />
        ) : state.status === 'error' ? (
          <EmptyState
            title={t('common.loadFailedTitle')}
            hint={t('skills.detail.loadFailedHint')}
            action={
              <Button
                size="sm"
                onClick={() => {
                  armRetryFocus();
                  setAttempt((n) => n + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            }
            className="py-8"
          />
        ) : state.status === 'not-found' ? (
          <EmptyState
            title={t('skills.detail.notFoundTitle')}
            hint={t('skills.detail.notFoundHint')}
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              {state.data.description && (
                <p className="text-sm whitespace-pre-line text-text">{state.data.description}</p>
              )}
              <p className="text-xs text-text-dim">
                {t(trainedLevel > 0 ? 'skills.inspector.factsTrained' : 'skills.inspector.facts', {
                  group: state.data.groupName,
                  rank: state.data.rank,
                  primary: t(`skills.attr.${state.data.primaryAttr}`),
                  secondary: t(`skills.attr.${state.data.secondaryAttr}`),
                  level: romanLevel(trainedLevel),
                })}
              </p>
            </div>
            {activeCharacterId !== null && (
              <SkillPlanAdd
                key={request.typeID}
                characterId={activeCharacterId}
                skillTypeID={request.typeID}
                skillName={state.data.name}
                engineSkills={state.engineSkills}
                trainedSkills={state.trainedSkills}
              />
            )}
            <SkillPriceSection typeID={request.typeID} npcPrice={state.data.npcPrice} />
            <SkillRequirementsList
              skillTypeID={request.typeID}
              prereqs={state.data.prereqs}
              unlocks={state.data.unlocks}
              itemUnlocks={itemUnlocks}
              trainedLevel={trainedLevel}
              planEntries={request.planEntries}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
