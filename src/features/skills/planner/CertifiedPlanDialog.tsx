import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner, Tabs, type TabItem } from '@/components/ui';
import { cx } from '@/lib/cx';
import { loadCertifiedPlans, loadSkills } from '@/sde/loadSde';
import type { CertifiedPlan } from '@/sde/types';
import { groupByCareerPath } from './certifiedPlan';

interface CertifiedPlanDialogProps {
  /** The picked plan, plus skill names for its milestone labels. */
  onPick: (plan: CertifiedPlan, skillNameFor: (skillTypeID: number) => string) => void;
  onClose: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; plans: CertifiedPlan[]; skillNames: ReadonlyMap<number, string> };

/**
 * "New plan from a Certified Plan" (issue #2392): pick one of CCP's career
 * plans, grouped by career path the way the client's Certified Plans window
 * groups them. Mounted only while open, like the plan import dialog.
 */
export function CertifiedPlanDialog({ onPick, onClose }: CertifiedPlanDialogProps) {
  const { t } = useTranslation();
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
  const activePathId = careerPathId ?? groups[0]?.careerPathId ?? null;
  const visible = groups.find((g) => g.careerPathId === activePathId)?.plans ?? [];
  const picked = state.status === 'ready' ? state.plans.find((p) => p.id === pickedId) : undefined;

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
    onPick(picked, (id) => names.get(id) ?? `Skill ${id}`);
  }

  return (
    <Modal open onClose={onClose} title={t('plans.certified.title')}>
      <div className="space-y-3 text-xs">
        <p className="text-text-dim">{t('plans.certified.intro')}</p>

        {state.status === 'loading' && (
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

        {state.status === 'ready' && activePathId !== null && (
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
            <ul className="divide-y divide-line border border-line">
              {visible.map((plan) => {
                const isPicked = plan.id === pickedId;
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      aria-pressed={isPicked}
                      onClick={() => setPickedId(plan.id)}
                      className={cx(
                        'flex w-full min-h-11 items-center justify-between gap-3 px-3 py-2 text-left',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                        isPicked ? 'bg-accent/10 text-text' : 'text-text hover:bg-panel-2'
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{plan.name}</span>
                        <span className="block text-text-dim">
                          {plan.factionName ?? t('plans.certified.anyFaction')}
                        </span>
                      </span>
                      <span className="shrink-0 text-text-dim tabular-nums">
                        {t('plans.certified.levels', { count: plan.entries.length })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

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
          <Button variant="primary" size="sm" onClick={create} disabled={!picked}>
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
