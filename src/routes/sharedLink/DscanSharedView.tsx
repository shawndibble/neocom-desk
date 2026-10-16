import { parseDscanSnapshot } from '@/engine/pilotList/dscanSnapshot';
import type { StoredShare } from '@/features/share/shareStore';
import { DscanShareScreen, type DscanShareState } from '@/features/travel/DscanShareScreen';
import { sharedDscanOpenInApp } from '@/features/travel/sharedDscanSeed';

function dscanState(share: StoredShare): DscanShareState {
  const scan = parseDscanSnapshot(share.payload);
  return scan === null ? { status: 'invalid' } : { status: 'ready', rows: scan.rows };
}

/** A stored D-scan share. Its own chunk (`SharedLink` loads it on demand). */
export function DscanSharedView({ share, shareId }: { share: StoredShare; shareId: string }) {
  const state = dscanState(share);
  return (
    <DscanShareScreen
      state={state}
      expiresAt={share.expiresAt}
      openInApp={state.status === 'ready' ? sharedDscanOpenInApp(shareId) : undefined}
    />
  );
}
