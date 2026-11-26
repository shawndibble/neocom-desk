import { useTranslation } from 'react-i18next';
import { EmptyState, StatChip, StatChips } from '@/components/ui';
import { ShareShell, type OpenInApp } from '@/features/share/ShareShell';
import type { DscanRow } from '@/engine/pilotList/parsePilotPaste';
import { FleetBoard } from './FleetBoard';
import { formatNumber } from '@/lib/numberLocale';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';

export type DscanShareState = { status: 'invalid' } | { status: 'ready'; rows: DscanRow[] };

export function DscanShareScreen({
  state,
  expiresAt,
  openInApp,
}: {
  state: DscanShareState;
  expiresAt: number;
  openInApp?: OpenInApp;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
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
            <StatChip label={t('dscanShare.linesLabel')} value={formatNumber(state.rows.length)} />
          </StatChips>
          <FleetBoard rows={state.rows} />
          <StatChips className="border-t border-line px-1 py-2">
            <StatChip
              label={t('dscanShare.expiresLabel')}
              value={formatTimestamp(new Date(expiresAt), timeZone)}
            />
          </StatChips>
        </>
      )}
    </ShareShell>
  );
}
