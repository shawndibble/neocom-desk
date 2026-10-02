import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
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

type LoadState = { shareId: string; result: LoadShareResult } | null;

function appraisalState(share: StoredShare): AppraisalShareState {
  const snapshot = parseAppraisalSnapshot(share.payload);
  if (snapshot === null) return { status: 'invalid' };
  const view = appraisalShareViewFromSnapshot(snapshot);
  return view.ok ? { status: 'ready', view: view.value } : { status: 'invalid' };
}

/**
 * A stored **Share Link**, `/share/<id>`: reads the share from Firestore and
 * opens the page its `type` names, showing what was shared at the time it was
 * shared. One route for every share type, so a page that becomes shareable
 * adds a case here rather than a route. Outside `RequireCharacter` and
 * `ScopeGate` deliberately — whoever was sent the link may have no account
 * (`routeScopes.test.ts` asserts the exemption).
 */
export function SharedLink() {
  const { t } = useTranslation();
  const { shareId = '' } = useParams();
  const [loaded, setLoaded] = useState<LoadState>(null);

  useEffect(() => {
    let cancelled = false;
    void loadShare(shareId).then((result) => {
      if (!cancelled) setLoaded({ shareId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  // A result for a different id (the visitor followed another link) is stale.
  const result = loaded?.shareId === shareId ? loaded.result : null;

  if (result?.ok) {
    switch (result.share.type) {
      case 'appraisal': {
        const state = appraisalState(result.share);
        return (
          <AppraisalShareScreen
            state={state}
            expiresAt={result.share.expiresAt}
            openInApp={
              state.status === 'ready' ? sharedAppraisalOpenInApp(state.view, shareId) : undefined
            }
          />
        );
      }
      case 'fitting':
        // Signed in, this redirects straight into the editor on the code; a
        // malformed payload reads as an empty code, and so an invalid link.
        return (
          <FittingShareView
            code={parseFittingSharePayload(result.share.payload)?.code ?? ''}
            expiresAt={result.share.expiresAt}
          />
        );
    }
  }

  return (
    <ShareShell title={t('share.title')}>
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
        <EmptyState title={t('share.failedTitle')} hint={t('share.failedHint')} className="py-10" />
      )}
    </ShareShell>
  );
}
