/**
 * One review's report, a page of its own below `/corp/vetting`: the result line, flags with the
 * rows behind them, the checks that could not run, the ones that found nothing, the declared
 * characters, and a rail with the decision and the report's own record.
 *
 * Opening it is logged where the pilot can see it, so the read happens once per visit, on
 * mount, never on hover or prefetch.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  DataTable,
  EmptyState,
  Eyebrow,
  LoadFailedState,
  Panel,
  SeverityIcon,
  Spinner,
  ValueList,
  ValueRow,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import {
  type VettingAssessment,
  type VettingReportCharacter,
  type VettingReview,
} from '@/engine/vetting';
import { formatAge } from '@/lib/age';
import { callableErrorReason } from '@/lib/callableError';
import { formatCompactNumber } from '@/lib/compactNumber';
import { cx } from '@/lib/cx';
import { formatList } from '@/lib/listFormat';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly, formatTimestamp } from '@/lib/timestamp';
import { useNow } from '@/lib/useNow';
import { VettingDecision } from './VettingDecision';
import { VettingEntity } from './VettingEntity';
import { VettingFlagList } from './VettingFlagList';
import { deletionLine, reviewKindLabel } from './vettingText';
import { vettingBackend } from './vettingClient';
import { VETTING_TABS } from './vettingTabs';
import { missingChecks, resultLine } from './vettingView';

/** The report's one-line answer. Three states, never "safe"; "nothing found" is neutral. */
function VettingResultLine({ assessment }: { assessment: VettingAssessment }) {
  const { t } = useTranslation();
  const line = resultLine(assessment);
  return (
    <div className="flex items-start gap-3">
      <SeverityIcon severity={line.severity} size={Icon.ICON_SIZE.lg} className="mt-0.5" />
      <div className="min-w-0 space-y-1">
        <p className="text-lg font-semibold tabular-nums">
          {line.flags === 0
            ? t('vetting.report.nothingFound', { count: line.checks })
            : t('vetting.report.flagsFound', { count: line.flags, checks: line.checks })}
        </p>
        <p className="text-sm text-text-dim">
          {line.missing > 0 && (
            <span className="text-warning">
              {t('vetting.report.couldNotRun', { count: line.missing })}{' '}
            </span>
          )}
          {t(line.flags === 0 ? 'vetting.report.notAVerdict' : 'vetting.report.reasonToAsk')}
        </p>
      </div>
    </div>
  );
}

/** Checks that could not run, kept apart from the ones that ran clean. */
function MissingChecksPanel({
  review,
}: {
  review: VettingReview & { assessment: VettingAssessment };
}) {
  const { t } = useTranslation();
  const missing = missingChecks(review.assessment, review.reportCharacters);
  if (missing.length === 0) return null;
  return (
    <Panel title={t('vetting.report.couldNotCheck')} padded={false}>
      <ul className="divide-y divide-line text-sm">
        {missing.map((row) => (
          <li key={row.check} className="grid gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[16rem_1fr]">
            <span className="font-semibold text-warning">
              {t(`vetting.checks.${row.check}.title`)}
            </span>
            <span className="text-text-dim">
              {t('vetting.report.didNotShare', {
                count: row.names.length,
                names: formatList(row.names),
                source: formatList(row.sources.map((id) => t(`vetting.sources.${id}`))),
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line p-3 text-xs text-text-dim">
        {t('vetting.report.freshRead')}
      </p>
    </Panel>
  );
}

/** The checks that ran and raised nothing: collapsed by default, so "nothing found" is never a bare claim. */
function ClearChecksPanel({ assessment, open }: { assessment: VettingAssessment; open: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(open);
  const clear = assessment.checks.filter((check) => check.state === 'clear');
  if (clear.length === 0) return null;
  const names = clear.map((check) => t(`vetting.checks.${check.check}.title`));
  return (
    <CollapsiblePanel
      title={t('vetting.report.nothingFound', { count: clear.length })}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
      labels={{ show: t('vetting.report.showChecks'), hide: t('vetting.report.hideChecks') }}
      padded={false}
      collapsedSummary={
        <span className="block px-3 py-2 text-xs text-text-dim">
          {names.length > 3
            ? formatList([
                ...names.slice(0, 3),
                t('vetting.report.more', { count: names.length - 3 }),
              ])
            : formatList(names)}
        </span>
      }
    >
      <ul className="divide-y divide-line text-sm">
        {clear.map((check) => (
          <li
            key={check.check}
            className="grid gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[16rem_1fr]"
          >
            <span className="font-semibold">{t(`vetting.checks.${check.check}.title`)}</span>
            <span className="text-text-dim">{t(`vetting.checks.${check.check}.looksAt`)}</span>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}

function CharactersPanel({ characters }: { characters: readonly VettingReportCharacter[] }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const columns: DataTableColumn<VettingReportCharacter>[] = [
    {
      id: 'name',
      header: t('vetting.report.characters.character'),
      primary: true,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <CharacterAvatar characterId={row.characterId} size="sm" loading="lazy" />
          <span className="min-w-0">
            <VettingEntity id={row.characterId} category="character">
              {row.name}
            </VettingEntity>
            <span className="block truncate text-xs text-text-dim">{row.corporationName}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'born',
      header: t('vetting.report.characters.born'),
      className: 'whitespace-nowrap',
      render: (row) => formatDateOnly(new Date(row.birthday), timeZone),
    },
    {
      id: 'sp',
      header: t('vetting.report.characters.skillPoints'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.skillPoints === null ? (
          <span className="text-text-faint">-</span>
        ) : (
          formatCompactNumber(row.skillPoints)
        ),
    },
    {
      id: 'corps',
      header: t('vetting.report.characters.corporations'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.corporations,
    },
    {
      id: 'shared',
      header: t('vetting.report.characters.shared'),
      render: (row) =>
        row.missing.length > 0 ? (
          <Pill tone="warning">
            {t('vetting.report.characters.no', {
              sources: formatList(row.missing.map((id) => t(`vetting.sources.${id}`))),
            })}
          </Pill>
        ) : (
          <span className="text-text-dim">{t('vetting.report.characters.everything')}</span>
        ),
    },
  ];
  return (
    <Panel title={t('vetting.report.characters.title')} padded={false} meta={characters.length}>
      <DataTable
        label={t('vetting.report.characters.title')}
        columns={columns}
        rows={characters}
        rowKey={(row) => row.characterId}
      />
    </Panel>
  );
}

function AboutReport({ review }: { review: VettingReview }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const now = useNow();
  const stamp = (at: number) => formatTimestamp(new Date(at), timeZone);
  return (
    <Panel title={t('vetting.report.about.title')}>
      <div className="space-y-3 text-sm">
        <ValueList>
          <ValueRow
            label={t('vetting.report.about.read')}
            value={review.readAt === null ? '-' : stamp(review.readAt)}
            note={
              review.readAt === null ? undefined : formatAge(Math.max(0, now - review.readAt), t)
            }
          />
          <ValueRow
            label={t('vetting.report.about.keptUntil')}
            value={deletionLine(review, (at) => formatDateOnly(new Date(at), timeZone), t)}
          />
          <ValueRow
            label={t('vetting.report.about.signInKept')}
            value={t('vetting.report.about.none')}
          />
        </ValueList>
        <div className="space-y-2">
          <Eyebrow>{t('vetting.report.about.log')}</Eyebrow>
          <ol className="space-y-1.5">
            {review.log
              .toSorted((a, b) => b.at - a.at)
              .map((entry, index) => (
                <li key={index} className="grid grid-cols-[9rem_1fr] items-baseline gap-2">
                  <span className="text-xs text-text-dim tabular-nums">{stamp(entry.at)}</span>
                  <span>
                    <span className="font-semibold">{entry.name}</span>{' '}
                    <span className="text-text-dim">{t(`vetting.log.${entry.action}`)}</span>
                  </span>
                </li>
              ))}
          </ol>
        </div>
      </div>
    </Panel>
  );
}

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  /** The review is about the caller: the server will not open it for them. */
  | { status: 'ownReview' }
  | { status: 'ready'; review: VettingReview };

interface VettingReportProps {
  characterId: number;
  corporationId: number;
  reviewId: string;
  /** The tab the report was opened from, where the crumb leads back. */
  tab: 'open' | 'decided';
  /** A sign-off was recorded: the queue behind this page is stale. */
  onDecided: () => void;
}

export function VettingReport({
  characterId,
  corporationId,
  reviewId,
  tab,
  onDecided,
}: VettingReportProps) {
  const { t } = useTranslation();
  const key = `${characterId}:${corporationId}:${reviewId}`;
  const [loaded, setLoaded] = useState<{ key: string; load: Load } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef('');
  const load: Load = loaded !== null && loaded.key === key ? loaded.load : { status: 'loading' };

  useEffect(() => {
    // Once per visit (and per Retry): the open is logged, so StrictMode's second effect run must
    // not log a second one. No cancel flag; a stale answer is dropped by its key instead.
    const run = `${key}:${attempt}`;
    if (started.current === run) return;
    started.current = run;
    vettingBackend()
      .open(characterId, corporationId, reviewId)
      .then(
        (review) => setLoaded({ key, load: { status: 'ready', review } }),
        (error: unknown) =>
          setLoaded({
            key,
            load: {
              status: callableErrorReason(error) === 'own-review' ? 'ownReview' : 'failed',
            },
          })
      );
  }, [key, attempt, characterId, corporationId, reviewId]);

  const crumb = (
    <Link
      to={`${VETTING_TABS.base}/${tab}`}
      className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}
    >
      <span aria-hidden="true">‹&nbsp;</span>
      {t('vetting.title')}
    </Link>
  );
  const frame = (body: ReactNode) => (
    <div className="mx-auto max-w-page space-y-4 px-4 py-4">
      {crumb}
      {body}
    </div>
  );

  if (load.status === 'loading') return frame(<Spinner block="page" label={t('common.loading')} />);
  if (load.status === 'ownReview') {
    return frame(
      <>
        <h1 className="text-xl font-semibold">{t('vetting.report.title')}</h1>
        <Panel>
          <EmptyState
            title={t('vetting.errors.own-review')}
            hint={t('vetting.report.ownReviewHint')}
          />
        </Panel>
      </>
    );
  }
  if (load.status === 'failed') {
    return frame(
      <>
        <h1 className="text-xl font-semibold">{t('vetting.report.title')}</h1>
        <Panel>
          <LoadFailedState
            title={t('vetting.report.failedTitle')}
            onRetry={() => {
              setLoaded(null);
              setAttempt((n) => n + 1);
            }}
          />
        </Panel>
      </>
    );
  }

  const { review } = load;
  const { assessment } = review;
  return frame(
    <>
      <div className="flex items-center gap-3">
        <CharacterAvatar characterId={review.pilot.characterId} size="lg" />
        <div className="min-w-0 space-y-0.5">
          <h1 className="truncate text-xl font-semibold">{review.pilot.name}</h1>
          <p className="text-sm text-text-dim">
            {reviewKindLabel(review, t)} · {review.pilot.corporationName}
          </p>
        </div>
      </div>
      {review.note !== '' && (
        <Panel title={t('vetting.report.theirNote')}>
          <p className="text-sm break-words whitespace-pre-wrap">{review.note}</p>
        </Panel>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {assessment === null ? (
            <Panel>
              <EmptyState
                title={t(
                  `vetting.report.noReport.${review.state === 'declined' ? 'declined' : 'waiting'}`
                )}
                hint={t('vetting.report.noReport.hint')}
              />
            </Panel>
          ) : (
            <>
              <VettingResultLine assessment={assessment} />
              {assessment.flags.length > 0 && (
                <Panel title={t('vetting.report.flags')} padded={false}>
                  <VettingFlagList
                    flags={assessment.flags}
                    parties={review.parties}
                    characters={review.reportCharacters}
                  />
                </Panel>
              )}
              <MissingChecksPanel review={{ ...review, assessment }} />
              <ClearChecksPanel assessment={assessment} open={assessment.flags.length === 0} />
              <CharactersPanel characters={review.reportCharacters} />
            </>
          )}
        </div>
        <div className="space-y-4 lg:sticky lg:top-4">
          <VettingDecision
            review={review}
            reviewerId={characterId}
            onDecide={async (decision, note) => {
              const next = await vettingBackend().decide(
                characterId,
                corporationId,
                reviewId,
                decision,
                note
              );
              setLoaded({ key, load: { status: 'ready', review: next } });
              onDecided();
            }}
          />
          <AboutReport review={review} />
        </div>
      </div>
    </>
  );
}
