import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Panel, Spinner, TypeIcon } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { EsiDidntAnswer } from './EsiDidntAnswer';
import { FindBestPlan } from './FindBestPlan';
import { GoalPlannerPanel, type GoalPlannerPanelProps } from './GoalPlannerPanel';
import { loadGoalPlannerSnapshot, type GoalPlannerSnapshot } from './goalPlannerSnapshot';
import { MakeMorePlan } from './MakeMorePlan';
import { PlanetImage } from './PlanetImage';
import { openingQuestion, pickedQuestion, type PlanQuestion } from './planQuestion';

interface Props extends GoalPlannerPanelProps {
  /** A `?type=` seed is on its way to becoming a goal. */
  seedingGoal: boolean;
}

/** Item icons the second question's tile shows: Ionic Solutions (P0) and Coolant (P2). */
const FIND_BEST_ICONS = [2309, 9832] as const;

function Option({
  selected,
  onSelect,
  art,
  title,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  art: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cx(
        'flex min-h-16 min-w-0 items-center gap-3 border-l-2 px-3 py-3 text-left',
        rowInteractiveClassName,
        focusRingInsetClassName,
        selected ? selectedRowClassName : 'border-l-transparent'
      )}
    >
      <span className="flex shrink-0 items-center -space-x-2">{art}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-sm font-semibold', selected ? 'text-accent' : 'text-text')}>
          {title}
        </span>
        <span className="block text-xs text-text-dim">{hint}</span>
      </span>
      <Icon.Descend
        size={Icon.ICON_SIZE.sm}
        aria-hidden="true"
        className="shrink-0 text-text-faint"
      />
    </button>
  );
}

/**
 * The Plan tab: a question picker over three answers. "Make more from my
 * planets" and "Find the best thing to build" read the recommendation model;
 * "Make a specific product" is the Goal Planner, in place, with every deep link it had (`?goals=`, `?off=`).
 */
export function PlanPanel(props: Props) {
  const { t } = useTranslation();
  const { characterId, goals, seedingGoal } = props;
  const [loaded, setLoaded] = useState<{
    characterId: number;
    snapshot: GoalPlannerSnapshot;
  } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadGoalPlannerSnapshot(characterId).then(
      (snapshot) => {
        if (cancelled) return;
        setFailedFor(null);
        setLoaded({ characterId, snapshot });
      },
      () => {
        if (!cancelled) setFailedFor(characterId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [characterId, reloadKey]);
  const snapshot = loaded?.characterId === characterId ? loaded.snapshot : null;
  const { hash, key: locationKey } = useLocation();
  // `#customs` (the "Set the rate" links) opens the Goal Planner, where the rate is edited,
  // until the pilot picks a question on that same visit.
  const [pick, setPickState] = useState<{ question: PlanQuestion; key: string } | null>(null);
  const picked = pickedQuestion(pick, hash, locationKey);
  const setPicked = (question: PlanQuestion) => setPickState({ question, key: locationKey });

  if (failedFor === characterId) {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (snapshot?.fetchFailed) {
    return (
      <EsiDidntAnswer
        onRetry={() => {
          setLoaded(null);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }
  if (!snapshot) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  const colonyCount = snapshot.colonies.length;
  const opening = openingQuestion({
    goalCount: goals.length + (seedingGoal ? 1 : 0),
    colonyCount,
  });
  const question = picked ?? opening.question;
  const colonyTypes = snapshot.colonies.map((colony) => colony.planet_type);

  return (
    <div className="space-y-4">
      <Panel title={t('piPlan.picker.title')} padded={false}>
        <div
          role="group"
          aria-label={t('piPlan.picker.title')}
          className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0"
        >
          <Option
            selected={question === 'make-more'}
            onSelect={() => setPicked('make-more')}
            art={
              colonyCount > 0 ? (
                colonyTypes
                  .slice(0, 6)
                  .map((type, i) => (
                    <PlanetImage
                      key={i}
                      type={type}
                      px={32}
                      className="rounded-full ring-2 ring-panel"
                    />
                  ))
              ) : (
                <PlanetImage type="barren" px={32} />
              )
            }
            title={t('piPlan.picker.makeMore')}
            hint={
              colonyCount > 0
                ? t('piPlan.picker.makeMoreHint', { count: colonyCount })
                : t('piPlan.picker.makeMoreNone')
            }
          />
          <Option
            selected={question === 'find-best'}
            onSelect={() => setPicked('find-best')}
            art={
              <>
                <PlanetImage type="gas" px={32} />
                {FIND_BEST_ICONS.map((id) => (
                  <TypeIcon key={id} typeId={id} size={32} width={28} height={28} />
                ))}
              </>
            }
            title={t('piPlan.picker.findBest')}
            hint={t('piPlan.picker.findBestHint')}
          />
          <Option
            selected={question === 'product'}
            onSelect={() => setPicked('product')}
            art={
              <Icon.Search size={Icon.ICON_SIZE.lg} aria-hidden="true" className="text-text-dim" />
            }
            title={t('piPlan.picker.product')}
            hint={t('piPlan.picker.productHint')}
          />
        </div>
        {picked === null && (
          <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
            {t(`piPlan.picker.opened.${opening.reason}`, { count: colonyCount })}
          </p>
        )}
      </Panel>
      {question === 'make-more' && (
        <MakeMorePlan
          snapshot={snapshot}
          characterId={characterId}
          onFindBest={() => setPicked('find-best')}
        />
      )}
      {question === 'find-best' && <FindBestPlan snapshot={snapshot} characterId={characterId} />}
      {question === 'product' && <GoalPlannerPanel {...props} />}
    </div>
  );
}
