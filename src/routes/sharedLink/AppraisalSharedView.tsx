import { parseAppraisalSnapshot } from '@/engine/market/appraisalSnapshot';
import {
  AppraisalShareScreen,
  type AppraisalShareState,
} from '@/features/market/AppraisalShareScreen';
import { appraisalShareViewFromSnapshot } from '@/features/market/appraisalShareData';
import { sharedAppraisalOpenInApp } from '@/features/market/sharedAppraisalSeed';
import type { StoredShare } from '@/features/share/shareStore';

function appraisalState(share: StoredShare): AppraisalShareState {
  const snapshot = parseAppraisalSnapshot(share.payload);
  if (snapshot === null) return { status: 'invalid' };
  const view = appraisalShareViewFromSnapshot(snapshot);
  return view.ok ? { status: 'ready', view: view.value } : { status: 'invalid' };
}

/** A stored appraisal share. Its own chunk (`SharedLink` loads it on demand). */
export function AppraisalSharedView({ share, shareId }: { share: StoredShare; shareId: string }) {
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
