import { useEffect, useState } from 'react';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { useMarkPublicRouteRendered } from '@/app/routeFocus';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Spinner } from '@/components/ui';
import { parseAppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import {
  AppraisalShareScreen,
  type AppraisalShareState,
} from '@/features/market/AppraisalShareScreen';
import { appraisalShareViewFromSnapshot } from '@/features/market/appraisalShareData';
import { sharedAppraisalOpenInApp } from '@/features/market/sharedAppraisalSeed';
import { ShareShell } from '@/features/share/ShareShell';
import { loadShare, type LoadShareResult, type StoredShare } from '@/features/share/shareStore';
import { parseFittingSharePayload } from '@/engine/fitting/fittingSharePayload';
import { FittingShareView } from './FittingShared';
import { parseDscanSnapshot } from '@/engine/pilotList/dscanSnapshot';
import { DscanShareScreen, type DscanShareState } from '@/features/travel/DscanShareScreen';
import { sharedDscanOpenInApp } from '@/features/travel/sharedDscanSeed';
import { SurveyShareScreen } from '@/features/survey/SurveyShareScreen';

type LoadState = { shareId: string; result: LoadShareResult } | null;

function appraisalState(share: StoredShare): AppraisalShareState {
  const snapshot = parseAppraisalSnapshot(share.payload);
  if (snapshot === null) return { status: 'invalid' };
  const view = appraisalShareViewFromSnapshot(snapshot);
  return view.ok ? { status: 'ready', view: view.value } : { status: 'invalid' };
}

function dscanState(share: StoredShare): DscanShareState {
  const scan = parseDscanSnapshot(share.payload);
  return scan === null ? { status: 'invalid' } : { status: 'ready', rows: scan.rows };
}

/** The page a stored share's `type` names. */
function SharedScreen({ share, shareId }: { share: StoredShare; shareId: string }) {
  switch (share.type) {
    case 'appraisal': {
      const state = appraisalState(share);
      return (
        <AppraisalShareScreen
          state={state}
          expiresAt={share.expiresAt}
          openInApp={
            state.status === 'ready' ? sharedAppraisalOpenInApp(state.view, shareId) : undefined
          }
        />
      );
    }
    case 'dscan': {
      const state = dscanState(share);
      return (
        <DscanShareScreen
          state={state}
          expiresAt={share.expiresAt}
          openInApp={state.status === 'ready' ? sharedDscanOpenInApp(shareId) : undefined}
        />
      );
    }
    case 'survey':
      return <SurveyShareScreen shareId={shareId} />;
    case 'fitting':
      // Signed in, this redirects straight into the editor on the code; a
      // malformed payload reads as an empty code, and so an invalid link.
      return (
        <FittingShareView
          code={parseFittingSharePayload(share.payload)?.code ?? ''}
          expiresAt={share.expiresAt}
        />
      );
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
          <p className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-3 text-xs text-text-dim">
            {t('share.cachedCopy')}
            <DataAgeBadge date={new Date(result.cachedAt)} alwaysVisible />
          </p>
        )}
        <SharedScreen share={result.share} shareId={shareId} />
      </div>
    );
  }

  return (
    <ShareShell title={t('share.title')}>
      <div ref={retryRef} tabIndex={-1} className="focus:outline-none">
        {result === null && (
          <div className="flex justify-center py-10">
            <Spinner label={t('common.loading')} />
          </div>
        )}
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
