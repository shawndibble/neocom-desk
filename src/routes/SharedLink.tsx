import { lazy, Suspense, useEffect, useState } from 'react';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, CachedNotice, EmptyState, Spinner } from '@/components/ui';
import { guarded } from '@/app/routeChunks';
import { ShareShell } from '@/features/share/ShareShell';
import { loadShare, type LoadShareResult, type StoredShare } from '@/features/share/shareStore';

// One chunk per share type, so a link downloads only the screen it opens: a
// survey link must not carry the appraisal, D-scan and fitting screens (the
// last one drags in the dogma engine). `src/app/bootImportGraph.test.ts` pins it.
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

/** The page a stored share's `type` names. */
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
  }
}

/**
 * A stored **Share Link**, `/s/<id>`: reads the share from Firestore and
 * opens the page its `type` names, showing what was shared at the time it was
 * shared. One route for every share type, so a page that becomes shareable
 * adds a case here rather than a route. Outside `RequireCharacter` and
 * `ScopeGate` deliberately — whoever was sent the link may have no account
 * (`routeScopes.test.ts` asserts the exemption).
 */
export function SharedLink() {
  const { t } = useTranslation();
  useMarkPublicRouteRendered();
  const { shareId = '' } = useParams();
  const [loaded, setLoaded] = useState<LoadState>(null);
  // Bumped by Try again after a failed read, to fetch the share once more.
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

  // A result for a different id (the visitor followed another link) is stale.
  const result = loaded?.shareId === shareId ? loaded.result : null;
  // Try again unmounts while the share loads, so the always-mounted wrapper below holds focus.
  const [retryRef, , holdRetryFocus] = useRetryFocus<HTMLDivElement>(
    result === null ? 'busy' : result.ok || result.reason !== 'failed' ? 'ok' : 'failed',
    shareId
  );

  if (result?.ok) {
    // The same focus target as the loading and failed states below, so a
    // retry that succeeds lands focus here instead of on <body>.
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
