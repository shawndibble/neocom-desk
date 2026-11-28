import { lazy, Suspense, useEffect, useState } from 'react';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, CachedNotice, EmptyState, Spinner } from '@/components/ui';
import { guarded } from '@/app/routeChunks';
import { ShareShell } from '@/features/share/ShareShell';
import { loadShare, type LoadShareResult, type StoredShare } from '@/features/share/shareStore';

const AppraisalSharedView = lazy(() =>
  guarded(() => import('./sharedLink/AppraisalSharedView')).then((m) => ({
    default: m.AppraisalSharedView,
  }))
);
const DscanSharedView = lazy(() =>
  guarded(() => import('./sharedLink/DscanSharedView')).then((m) => ({
    default: m.DscanSharedView,
  }))
);
const FittingSharedView = lazy(() =>
  guarded(() => import('./sharedLink/FittingSharedView')).then((m) => ({
    default: m.FittingSharedView,
  }))
);
const SurveyShareScreen = lazy(() =>
  guarded(() => import('@/features/survey/SurveyShareScreen')).then((m) => ({
    default: m.SurveyShareScreen,
  }))
);

type LoadState = { shareId: string; result: LoadShareResult } | null;

function ShareLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-10">
      <Spinner label={t('common.loading')} />
    </div>
  );
}

function StartLinkRedirect({ payload }: { payload: unknown }) {
  const { t } = useTranslation();
  const search = (payload as { search?: unknown } | null)?.search;
  if (typeof search !== 'string' || search === '' || search.length > 4000) {
    return (
      <EmptyState title={t('share.failedTitle')} hint={t('share.failedHint')} className="py-10" />
    );
  }
  return <Navigate to={`/survey?${search}`} replace />;
}

function SharedScreen({ share, shareId }: { share: StoredShare; shareId: string }) {
  switch (share.type) {
    case 'appraisal':
      return <AppraisalSharedView share={share} shareId={shareId} />;
    case 'dscan':
      return <DscanSharedView share={share} shareId={shareId} />;
    case 'survey':
      return <SurveyShareScreen shareId={shareId} />;
    case 'fitting':
      return <FittingSharedView share={share} />;
    case 'survey-start':
      return <StartLinkRedirect payload={share.payload} />;
  }
}

export function SharedLink() {
  const { t } = useTranslation();
  useMarkPublicRouteRendered();
  const { shareId = '' } = useParams();
  const [loaded, setLoaded] = useState<LoadState>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadShare(shareId).then((result) => {
      if (!cancelled) setLoaded({ shareId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [shareId, attempt]);

  const result = loaded?.shareId === shareId ? loaded.result : null;
  const [retryRef, , holdRetryFocus] = useRetryFocus<HTMLDivElement>(
    result === null ? 'busy' : result.ok || result.reason !== 'failed' ? 'ok' : 'failed',
    shareId
  );

  if (result?.ok) {
    return (
      <div ref={retryRef} tabIndex={-1} className="focus:outline-none">
        {result.cachedAt !== undefined && (
          <CachedNotice
            fetchedAt={result.cachedAt}
            className="mx-auto max-w-3xl px-2 pt-2 sm:px-6 sm:pt-4"
          />
        )}
        <Suspense
          fallback={
            <ShareShell title={t('share.title')}>
              <ShareLoading />
            </ShareShell>
          }
        >
          <SharedScreen share={result.share} shareId={shareId} />
        </Suspense>
      </div>
    );
  }

  return (
    <ShareShell title={t('share.title')}>
      <div ref={retryRef} tabIndex={-1} className="focus:outline-none">
        {result === null && <ShareLoading />}
        {result?.ok === false && result.reason === 'not-found' && (
          <EmptyState title={t('share.goneTitle')} hint={t('share.goneHint')} className="py-10" />
        )}
        {result?.ok === false && result.reason === 'unsupported' && (
          <EmptyState
            title={t('share.unsupportedTitle')}
            hint={t('share.unsupportedHint')}
            className="py-10"
            action={
              <Button size="sm" onClick={() => window.location.reload()}>
                {t('error.reload')}
              </Button>
            }
          />
        )}
        {result?.ok === false && result.reason === 'failed' && (
          <EmptyState
            title={t('share.failedTitle')}
            hint={t('share.failedHint')}
            className="py-10"
            action={
              <Button
                size="sm"
                onClick={() => {
                  holdRetryFocus();
                  setLoaded(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            }
          />
        )}
      </div>
    </ShareShell>
  );
}
