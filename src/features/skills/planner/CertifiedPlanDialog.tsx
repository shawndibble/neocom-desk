import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Radio, Spinner, Tabs, type TabItem } from '@/components/ui';
import { rowInteractiveClassName, selectedRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { loadCertifiedPlans, loadSkills } from '@/sde/loadSde';
import type { CertifiedPlan } from '@/sde/types';
import {
  groupByCareerPath,
  isPlanCompleted,
  untrainedEntries,
  type TrainedLevels,
} from './certifiedPlan';
import { usePlanEditorData } from './usePlanEditorData';

interface CertifiedPlanDialogProps {
  characterId: number;
  /**
   * The picked plan, skill names for its milestone labels, and the character's
   * trained levels (null when ESI hasn't answered, so nothing is filtered).
   */
  onPick: (
    plan: CertifiedPlan,
    skillNameFor: (skillTypeID: number) => string,
    trained: TrainedLevels | null
  ) => void;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; plans: CertifiedPlan[]; skillNames: ReadonlyMap<number, string> };

/**
 * "New certified plan" (issue #2392): pick one of CCP's career plans, grouped
 * by career path the way the client's Certified Plans window groups them.
 * Plans the character has fully trained are hidden, and the new plan holds
 * only the levels still untrained. Mounted only while open, like the plan
 * import dialog.
 */
export function CertifiedPlanDialog({ characterId, onPick, onClose }: CertifiedPlanDialogProps) {
  const { t } = useTranslation();
  const { loaded, trainedSkills, trainedSkillsKnown } = usePlanEditorData(characterId);
  const trained = trainedSkillsKnown ? trainedSkills : null;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [careerPathId, setCareerPathId] = useState<number | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);

  // Bumped by Try again; each attempt is one load.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCertifiedPlans(), loadSkills()]).then(
      ([plans, skills]) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          plans,
          skillNames: new Map(skills.map((s) => [s.typeID, s.name])),
        });
      },
      () => {
        if (!cancelled) setState({ status: 'failed' });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  const groups = useMemo(
    () => (state.status === 'ready' ? groupByCareerPath(state.plans) : []),
    [state]
  );
  const activePathId =
    groups.find((g) => g.careerPathId === careerPathId)?.careerPathId ??
    groups[0]?.careerPathId ??
    null;
  // Fully trained plans are hidden; a tab left empty says so in its box.
  const visible = (groups.find((g) => g.careerPathId === activePathId)?.plans ?? []).filter(
    (p) => !trained || !isPlanCompleted(p, trained)
  );
  const picked = visible.find((p) => p.id === pickedId);

  function careerLabel(id: number): string {
    return t(`plans.certified.career.${id}`, {
      defaultValue: t('plans.certified.careerFallback', { id }),
    });
  }

  const tabs: TabItem[] = groups.map((g) => ({
    id: String(g.careerPathId),
    label: careerLabel(g.careerPathId),
  }));

  function create() {
    if (!picked || state.status !== 'ready') return;
    const names = state.skillNames;
    onPick(picked, (id) => names.get(id) ?? t('common.unknownType', { id }), trained);
  }

  return (
    <Modal open onClose={onClose} title={t('plans.certified.title')}>
      <div className="space-y-3 text-xs">
        <p className="text-text-dim">{t('plans.certified.intro')}</p>

        {(state.status === 'loading' || (state.status === 'ready' && !loaded)) && (
          <div className="flex justify-center py-6">
            <Spinner label={t('common.loading')} />
          </div>
        )}

        {state.status === 'failed' && (
          <div className="space-y-2">
            <p role="alert" className="text-danger">
              {t('plans.certified.loadFailed')}
            </p>
            <Button size="sm" onClick={retry}>
              {t('common.retry')}
            </Button>
          </div>
        )}

        {state.status === 'ready' && loaded && activePathId !== null && (
          <>
            <Tabs
              tabs={tabs}
              value={String(activePathId)}
              onChange={(id) => {
                setCareerPathId(Number(id));
                setPickedId(null);
              }}
              label={t('plans.certified.careerPaths')}
            />
            {visible.length === 0 && (
              <p className="py-6 text-center text-sm text-text-dim">
                {t('plans.certified.allComplete')}
              </p>
            )}
            {visible.length > 0 && (
              <ul
                role="radiogroup"
                aria-label={t('plans.certified.pickLabel')}
                className="divide-y divide-line border border-line"
              >
                {visible.map((plan) => {
                  const isPicked = plan.id === pickedId;
                  return (
                    <li key={plan.id}>
                      <label
                        className={cx(
                          'flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2',
                          'text-text',
                          rowInteractiveClassName,
                          isPicked ? selectedRowClassName : 'border-l-2 border-l-transparent'
                        )}
                      >
                        <Radio
                          name="certified-plan"
                          checked={isPicked}
                          onChange={() => setPickedId(plan.id)}
                          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="dt-primary block font-medium">{plan.name}</span>
                          <span className="block text-text-dim">
                            {plan.factionName ?? t('plans.certified.anyFaction')}
                          </span>
                        </span>
                        <span className="shrink-0 text-text-dim tabular-nums">
                          {t('plans.certified.levels', {
                            count: trained
                              ? untrainedEntries(plan, trained).length
                              : plan.entries.length,
                          })}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {picked && (
              <div className="space-y-1">
                <p className="text-text-dim">
                  {t('plans.certified.milestones', { count: picked.milestones.length })}
                </p>
                <p className="whitespace-pre-line text-text">{picked.description}</p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={create} disabled={!picked || !loaded}>
            {t('plans.certified.create')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
