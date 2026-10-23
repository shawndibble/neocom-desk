import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, type DataTableColumn } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import type { LostRow } from './useMemberSrp';

interface LostShipsListProps {
  rows: readonly LostRow[];
  onFile: (row: LostRow) => void;
  /** The killmail being filed right now; its button waits. */
  busyKillmailId?: number | null;
}

/**
 * The pilot's own losses, each with its outcome: a one-tap File, or Claimed, Too old (past the
 * corp's window) or Not covered (a Hull Rule). One `DataTable`: columns on desktop, dense
 * two-line cards on a phone (DESIGN.md §4a), the File button at the card's right.
 */
export function LostShipsList({ rows, onFile, busyKillmailId = null }: LostShipsListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const columns = useMemo<DataTableColumn<LostRow>[]>(
    () => [
      {
        id: 'hull',
        header: t('srpMember.lost.ship'),
        primary: true,
        render: (r) => <span className="font-medium">{r.hullName}</span>,
      },
      { id: 'system', header: t('srpMember.lost.system'), render: (r) => r.systemName },
      {
        id: 'lost',
        header: t('srpMember.lost.lost'),
        render: (r) => (
          <span className="tabular-nums">
            {formatDateOnly(new Date(r.killedAt), timeZone)}{' '}
            <span className="text-text-dim">
              (
              {t('srpMember.lost.ago', {
                count: r.ageDays,
              })}
              )
            </span>
          </span>
        ),
      },
      {
        id: 'action',
        header: t('srpMember.lost.file'),
        cardCorner: true,
        align: 'right',
        render: (r) => {
          switch (r.kind) {
            case 'open':
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('srpMember.lost.fileShip', { hull: r.hullName })}
                  disabled={busyKillmailId !== null}
                  onClick={() => onFile(r)}
                >
                  {t('srpMember.lost.file')}
                </Button>
              );
            case 'claimed':
              return <Pill>{t('srpMember.lost.claimed')}</Pill>;
            case 'old':
              return <Pill>{t('srpMember.lost.old')}</Pill>;
            case 'notCovered':
              return <Pill tone="danger">{t('srpMember.lost.notCovered')}</Pill>;
          }
        },
      },
    ],
    [t, timeZone, onFile, busyKillmailId]
  );
  return (
    <DataTable
      label={t('srpMember.lost.label')}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.killmailId}
      stackLayout="dense"
    />
  );
}
