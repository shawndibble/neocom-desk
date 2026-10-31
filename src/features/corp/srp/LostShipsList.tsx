import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { Pill } from '@/components/ui/Pill';
import { SystemLink } from '@/features/entities';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import type { LostRow } from './useMemberSrp';

interface LostShipsListProps {
  rows: readonly LostRow[];
  onFile: (row: LostRow) => void;
  /** A ship name or the row was chosen: its killmail opens. */
  onOpen: (row: LostRow) => void;
  /** The killmail being filed right now; its button waits. */
  busyKillmailId?: number | null;
}

/**
 * The pilot's own losses, each with its outcome: a one-tap File, or Claimed or Not covered (a Hull Rule); a loss past
 * the corp's window is not listed. A ship name, or a tap on the row, opens its killmail. One `DataTable`: columns on desktop, dense
 * two-line cards on a phone (DESIGN.md §4a), the File button at the card's right.
 */
export function LostShipsList({ rows, onFile, onOpen, busyKillmailId = null }: LostShipsListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const columns = useMemo<DataTableColumn<LostRow>[]>(
    () => [
      {
        id: 'hull',
        header: t('srpMember.lost.ship'),
        primary: true,
        sortValue: (r) => r.hullName,
        render: (r) => (
          <button
            type="button"
            className={entityLinkClassName('font-medium')}
            onClick={() => onOpen(r)}
          >
            {r.hullName}
          </button>
        ),
      },
      {
        id: 'system',
        header: t('srpMember.lost.system'),
        sortValue: (r) => r.systemName,
        render: (r) => <SystemLink systemId={r.solarSystemId}>{r.systemName}</SystemLink>,
      },
      {
        id: 'lost',
        header: t('srpMember.lost.lost'),
        sortValue: (r) => r.killedAt,
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
              return null;
            case 'notCovered':
              return <Pill tone="danger">{t('srpMember.lost.notCovered')}</Pill>;
          }
        },
      },
    ],
    [t, timeZone, onFile, onOpen, busyKillmailId]
  );
  return (
    <div className="overflow-x-auto">
      <DataTable
        label={t('srpMember.lost.label')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.killmailId}
        stackLayout="dense"
        mobileSort
        onRowClick={onOpen}
      />
    </div>
  );
}
