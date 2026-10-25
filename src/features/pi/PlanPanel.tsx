import { useId } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, InfoTooltip, Panel, Spinner } from '@/components/ui';
import {
  disabledClassName,
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useUrlParam } from '@/lib/useUrlState';
import { EsiDidntAnswer } from './EsiDidntAnswer';
import { colonyCountUnknown } from './colonyFillModel';
import { FindBestPlan } from './FindBestPlan';
import { GoalPlannerPanel, type GoalPlannerPanelProps } from './GoalPlannerPanel';
import { usePiSnapshot } from './usePiSnapshot';
import { MakeMorePlan } from './MakeMorePlan';
import { useRetryFocus } from '@/lib/useRetryFocus';
import {
  openingQuestion,
  pickedQuestion,
  planQuestionParam,
  type PlanQuestion,
} from './planQuestion';

interface Props extends GoalPlannerPanelProps {
  /** A `?type=` seed is on its way to becoming a goal. */
  seedingGoal: boolean;
}

/** What each answer does. */
const QUESTION_HINT: Record<PlanQuestion, string> = {
  'make-more': 'piPlan.picker.makeMoreHint',
  'find-best': 'piPlan.picker.findBestHint',
  product: 'piPlan.picker.productHint',
};

function Option({
  selected,
  onSelect,
  title,
  note,
  unavailable = false,
}: {
  unavailable?: boolean;
  selected: boolean;
  onSelect: () => void;
  title: string;
  /** Why an unavailable option can't be picked, beside its title. */
  note?: string;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : onSelect}
      className={cx(
        unavailable && disabledClassName,
        'flex min-h-9 min-w-0 items-center gap-2 border-l-2 px-3 py-2 text-left md:min-h-10',
        rowInteractiveClassName,
        focusRingInsetClassName,
        selected ? selectedRowClassName : 'border-l-transparent'
      )}
    >
      <span className={cx('min-w-0 text-sm font-semibold', selected ? 'text-accent' : 'text-text')}>
        {title}
      </span>
      {note && <span className="min-w-0 truncate text-xs text-text-dim">{note}</span>}
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
  const pickerHeadingId = useId();
  const { snapshot, failed, retrying, retry } = usePiSnapshot(characterId);
  const { hash } = useLocation();
  const [urlQuestion, setUrlQuestion] = useUrlParam('q', planQuestionParam);
  // `#customs` (the "Set the rate" links) opens the Goal Planner, where the rate is edited,
  // until the pilot picks a question. A pick always writes `?q=` (the opening question depends
  // on colonies, so it is no fixed default) and drops the hash.
  const picked = pickedQuestion(urlQuestion, hash);
  const setPicked = (question: PlanQuestion) => setUrlQuestion(question, { clearHash: true });

  const [resultRef, armRetryFocus] = useRetryFocus(
    !snapshot || retrying ? 'busy' : snapshot.fetchFailed ? 'failed' : 'ok',
    characterId
  );

  if (failed) {
    return <EmptyState title={t('piPlan.loadFailedTitle')} hint={t('piPlan.loadFailedHint')} />;
  }
  if (!snapshot) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  // The colony read failed: colonies are unknown, not none. Plan runs as for a pilot with no
  // colonies (Find best opens), and the notice sits in the colony slot, above the answers.
  const esiFailed = snapshot.fetchFailed;
  // A refused read (re-login needed) is unknown too, but the page banner owns that notice.
  const unknown = colonyCountUnknown(snapshot);
  const colonyCount = snapshot.colonies.length;
  const opening = openingQuestion({
    goalCount: goals.length + (seedingGoal ? 1 : 0),
    colonyCount,
  });
  const wanted = picked ?? opening.question;
  // The URL may still say make-more; the view shows Find best until the colonies can be read.
  const question = unknown && wanted === 'make-more' ? 'find-best' : wanted;

  const hint =
    picked === null && !esiFailed
      ? t(`piPlan.picker.opened.${unknown ? 'unknown' : opening.reason}`, { count: colonyCount })
      : t(
          question === 'make-more' && colonyCount === 0
            ? 'piPlan.picker.makeMoreNone'
            : QUESTION_HINT[question],
          { count: colonyCount }
        );

  // A failed read and an empty colony list are state the pilot must see; the "opened because" and per-question notes ride a tooltip.
  const hintVisible =
    unknown || esiFailed || (question === 'make-more' && colonyCount === 0 && picked !== null);

  return (
    <div className="space-y-4">
      {esiFailed && (
        <EsiDidntAnswer
          retrying={retrying}
          onRetry={() => {
            armRetryFocus();
            retry();
          }}
        />
      )}
      <div ref={resultRef} tabIndex={-1} className="space-y-4 outline-none">
        <Panel padded={false}>
          {/* Heading sr-only: the options name the picker visibly. */}
          <h2 id={pickerHeadingId} className="sr-only">
            {t('piPlan.picker.title')}
          </h2>
          <div className="flex items-stretch">
            <div
              role="group"
              aria-labelledby={pickerHeadingId}
              className="grid min-w-0 flex-1 divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0"
            >
              <Option
                selected={question === 'make-more'}
                unavailable={unknown}
                onSelect={() => setPicked('make-more')}
                title={t('piPlan.picker.makeMore')}
                note={unknown ? t('piPlan.picker.makeMoreUnknown') : undefined}
              />
              <Option
                selected={question === 'find-best'}
                onSelect={() => setPicked('find-best')}
                title={t('piPlan.picker.findBest')}
              />
              <Option
                selected={question === 'product'}
                onSelect={() => setPicked('product')}
                title={t('piPlan.picker.product')}
              />
            </div>
            {/* Why this question opened, then what it does: a note, not a line of its own. */}
            {!hintVisible && (
              <div className="flex shrink-0 items-center border-l border-line px-3">
                <InfoTooltip label={t('piPlan.picker.hintLabel')} glyph="info" content={hint} />
              </div>
            )}
          </div>
          {hintVisible && (
            <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
              {hint}
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
    </div>
  );
}
