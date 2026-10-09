import { useTranslation } from 'react-i18next';
import { EmptyState, StatChip, StatChips } from '@/components/ui';
import { ShareShell, type OpenInApp } from '@/features/share/ShareShell';
import type { DscanRow } from '@/engine/pilotList/parsePilotPaste';
import { FleetBoard } from './FleetBoard';

export type DscanShareState = { status: 'invalid' } | { status: 'ready'; rows: DscanRow[] };

/**
 * The **Shared D-Scan** a Share Link opens (`routes/SharedLink.tsx`): the
 * scan's ships grouped by role (the Fleet board), rebuilt from the stored raw text by the same
 * view the live Pilot Lookup uses. Read-only; "Open Neocom Desk" carries the
 * scan into the live view.
 */
export function DscanShareScreen({
  state,
  expiresAt,
  openInApp,
}: {
  state: DscanShareState;
  /** Epoch millis the Share Link dies at — shown, since the recipient never saw the sender's "works for 7 days". */
  expiresAt: number;
  openInApp?: OpenInApp;
}) {
  const { t } = useTranslation();
  return (
    <ShareShell title={t('dscanShare.title')} openInApp={openInApp}>
      {state.status === 'invalid' ? (
        <EmptyState
          title={t('dscanShare.invalidTitle')}
          hint={t('dscanShare.invalidHint')}
          className="py-10"
        />
      ) : (
        <>
          <StatChips className="border-b border-line px-1 py-2">
            <StatChip
              label={t('dscanShare.linesLabel')}
              value={state.rows.length.toLocaleString()}
            />
            <StatChip
              label={t('dscanShare.expiresLabel')}
              value={new Date(expiresAt).toLocaleString()}
            />
          </StatChips>
          <FleetBoard rows={state.rows} />
        </>
      )}
    </ShareShell>
  );
}
