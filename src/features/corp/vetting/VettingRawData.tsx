/**
 * "Data we read": every row a review kept, a page of its own below the report
 * (`/corp/vetting/open/<id>/data/<source>`). A tab per source, a character switcher, and one
 * source's table. The source is in the path and the character and the flagged-only chip in the
 * query, so a flag on the report can link straight to its rows.
 *
 * The same gate as the report: an officer, and not the person asked about or the one who asked.
 * No new log line: the report's open is the review's one.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  LoadFailedState,
  Panel,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TabPanel,
  Tabs,
  textActionClassName,
  useTabsId,
} from '@/components/ui';
import { VETTING_RAW_SOURCES, type VettingRawSource, type VettingReview } from '@/engine/vetting';
import { callableErrorReason } from '@/lib/callableError';
import { cx } from '@/lib/cx';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { useSkillNames } from './useSkillNames';
import { useVettingRawRows } from './useVettingRawRows';
import { VettingRawTable } from './VettingRawTable';
import { vettingBackend } from './vettingClient';
import { recallVettingReview, rememberVettingReview } from './vettingReviewCache';
import { dataPath, reviewPath } from './vettingTabs';
import { reviewKindLabel } from './vettingText';

const ALL = '__all';
/** A joined group fits "All" and three characters; past that a Select takes over. */
const SEGMENTED_MAX = 3;

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ownReview' }
  | { status: 'ready'; review: VettingReview };

interface Props {
  characterId: number;
  corporationId: number;
  reviewId: string;
  tab: 'open' | 'decided';
  source: VettingRawSource;
}

export function VettingRawData({ characterId, corporationId, reviewId, tab, source }: Props) {
  const { t } = useTranslation();
  const key = `${characterId}:${corporationId}:${reviewId}`;
  const [loaded, setLoaded] = useState<{ key: string; load: Load } | null>(() => {
    const review = recallVettingReview(characterId, corporationId, reviewId);
    return review ? { key, load: { status: 'ready', review } } : null;
  });
  const [attempt, setAttempt] = useState(0);
  const load: Load = loaded !== null && loaded.key === key ? loaded.load : { status: 'loading' };

  useEffect(() => {
    if (loaded !== null && loaded.key === key && loaded.load.status !== 'failed') return;
    let live = true;
    vettingBackend()
      .open(characterId, corporationId, reviewId)
      .then(
        (opened) => {
          rememberVettingReview(characterId, corporationId, opened);
          if (live) setLoaded({ key, load: { status: 'ready', review: opened } });
        },
        (error: unknown) => {
          if (live) {
            setLoaded({
              key,
              load: {
                status: callableErrorReason(error) === 'own-review' ? 'ownReview' : 'failed',
              },
            });
          }
        }
      );
    return () => {
      live = false;
    };
    // The load settles once per key and Retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const reportPath = reviewPath(tab, reviewId);
  const frame = (body: ReactNode, crumb = t('vetting.data.crumbPlain')) => (
    <div className="mx-auto max-w-page space-y-4">
      <Link to={reportPath} className={cx(textActionClassName(), 'inline-flex w-fit text-sm')}>
        <span aria-hidden="true">‹&nbsp;</span>
        {crumb}
      </Link>
      {body}
    </div>
  );

  if (load.status === 'loading') return frame(<Spinner block="page" label={t('common.loading')} />);
  if (load.status === 'ownReview') {
    return frame(
      <Panel>
        <EmptyState
          title={t('vetting.errors.own-review')}
          hint={t('vetting.report.ownReviewHint')}
        />
      </Panel>
    );
  }
  if (load.status === 'failed') {
    return frame(
      <Panel>
        <LoadFailedState
          title={t('vetting.report.failedTitle')}
          onRetry={() => {
            setLoaded(null);
            setAttempt((n) => n + 1);
          }}
        />
      </Panel>
    );
  }
  if (load.review.rawCounts === undefined) {
    // Stored before rows were kept: nothing to browse.
    return frame(
      <Panel>
        <EmptyState title={t('vetting.data.noneKeptTitle')} hint={t('vetting.data.noneKeptHint')} />
      </Panel>,
      t('vetting.data.crumb', { name: load.review.pilot.name })
    );
  }
  return frame(
    <Browser
      characterId={characterId}
      corporationId={corporationId}
      review={load.review}
      tab={tab}
      source={source}
      reportPath={reportPath}
    />,
    t('vetting.data.crumb', { name: load.review.pilot.name })
  );
}

function Browser({
  characterId,
  corporationId,
  review,
  tab,
  source,
  reportPath,
}: {
  characterId: number;
  corporationId: number;
  review: VettingReview;
  tab: 'open' | 'decided';
  source: VettingRawSource;
  reportPath: string;
}) {
  const { t } = useTranslation();
  const tabsId = useTabsId();
  const navigate = useNavigate();
  const timeZone = useTimeZone();
  const [params, setParams] = useSearchParams();
  const skills = useSkillNames();
  const data = useVettingRawRows(characterId, corporationId, review.id, source);
  // The caller only draws this for a review that kept rows (`rawCounts`).
  const counts = review.rawCounts!;
  const characters = review.reportCharacters;
  const asked = Number(params.get('character'));
  const who = characters.some((c) => c.characterId === asked) ? asked : null;
  const flaggedOnly = params.get('flagged') === '1';

  const goto = (next: VettingRawSource) =>
    navigate({
      pathname: dataPath(tab, review.id, next),
      search: who === null ? '' : `?character=${who}`,
    });
  const setWho = (next: number | null) =>
    setParams(next === null ? {} : { character: String(next) }, { replace: true });

  const characterOptions = [
    { value: ALL, label: t('vetting.data.allCharacters', { count: characters.length }) },
    ...characters.map((c) => ({ value: String(c.characterId), label: c.name })),
  ];
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('vetting.data.title')}</h1>
        <p className="text-sm text-text-dim">
          {reviewKindLabel(review, t)} · {review.pilot.name}
          {characters.length > 1 &&
            ` ${t('vetting.data.andMore', { count: characters.length - 1 })}`}
          {review.readAt !== null &&
            ` · ${t('vetting.data.readAt', { at: formatTimestamp(new Date(review.readAt), timeZone) })}`}
          . {t('vetting.data.subtitle')}
        </p>
      </div>
      <Panel padded={false}>
        <div className="space-y-3 p-3">
          <Tabs
            tabsId={tabsId}
            label={t('vetting.data.sourcesLabel')}
            value={source}
            onChange={(id) => goto(id as VettingRawSource)}
            tabs={VETTING_RAW_SOURCES.map((id) => ({
              id,
              label: t(`vetting.data.source.${id}`),
              count: counts[id],
            }))}
          />
          {characters.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                {t('vetting.data.character')}
              </span>
              {characters.length <= SEGMENTED_MAX ? (
                <SegmentedControl
                  label={t('vetting.data.character')}
                  uppercase={false}
                  value={who === null ? ALL : String(who)}
                  onChange={(value) => setWho(value === ALL ? null : Number(value))}
                  options={characterOptions}
                />
              ) : (
                <Select
                  value={who === null ? ALL : String(who)}
                  onValueChange={(value) => setWho(value === ALL ? null : Number(value))}
                >
                  <SelectTrigger aria-label={t('vetting.data.character')} className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('vetting.data.allCharactersSelect')}</SelectItem>
                    {characters.map((c) => (
                      <SelectItem key={c.characterId} value={String(c.characterId)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <TabPanel tabsId={tabsId} tabId={source}>
            <VettingRawTable
              key={`${source}:${who}`}
              source={source}
              characterId={who}
              characters={characters}
              readAt={review.readAt ?? review.createdAt}
              flags={review.assessment?.flags ?? []}
              data={data}
              total={counts[source]}
              skills={skills}
              reportPath={reportPath}
              initial={flaggedOnly ? { flagged: true } : undefined}
            />
          </TabPanel>
        </div>
      </Panel>
    </>
  );
}
