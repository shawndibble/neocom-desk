import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { Tooltip } from '@/components/ui/Tooltip';
import type { DataTableColumn } from '@/components/ui';
import { CharacterLink, ItemInfoLink, SystemLink } from '@/features/entities';
import { formatAge } from '@/lib/age';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { DASH, label } from '@/engine/corp/members';
import type { RosterRow } from './CorpRoster';
import { rolesText } from './roles';

const isSolarSystemId = (id: number) => id >= 30_000_000 && id < 32_000_000;

export function useRosterColumns(): DataTableColumn<RosterRow>[] {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return useMemo<DataTableColumn<RosterRow>[]>(
    () => [
      {
        id: 'member',
        header: t('corp.members.columnMember'),
        stickyStart: true,
        stickyStartOnPanel: true,
        className: 'truncate',
        render: (row) => (
          <span className="flex min-w-0 items-center gap-1.5">
            <CharacterLink id={row.characterId} className="truncate">
              {label(row.name, row.characterId)}
            </CharacterLink>
            {row.isSelf && (
              <span className="shrink-0 rounded-xs bg-panel-2 px-1 py-0.5 text-[0.6875rem] text-text-dim">
                {t('corp.members.you')}
              </span>
            )}
            {row.isCeo && <Pill className="shrink-0">{t('corp.members.ceo')}</Pill>}
            {row.group && (
              <Tooltip
                content={t('corpTaxBook.moons.grouping.badgeTip', {
                  names: row.group.names.join(', '),
                })}
              >
                <span tabIndex={0} className="inline-flex shrink-0">
                  <Pill>{t('corpTaxBook.moons.grouping.badge', { count: row.group.size })}</Pill>
                </span>
              </Tooltip>
            )}
          </span>
        ),
        sortValue: (row) => row.name ?? undefined,
      },
      {
        id: 'lastSeen',
        header: t('corp.members.columnLastSeen'),
        cardCorner: true,
        align: 'right',
        width: '16ch',
        className: 'whitespace-nowrap tabular-nums',
        cellClassName: (row) => (row.standing.isDark ? 'text-warning' : undefined),
        render: (row) => {
          const age = row.standing.neverSeen
            ? t('corp.members.never')
            : formatAge(Math.max(0, row.standing.darkForMs ?? 0), t);
          return row.standing.isDark ? (
            <span className="inline-flex items-center gap-1">
              <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
              {age}
              <span className="sr-only">{t('corp.members.darkState')}</span>
            </span>
          ) : (
            age
          );
        },
        sortValue: (row) => (row.standing.darkForMs === null ? undefined : -row.standing.darkForMs),
      },
      {
        id: 'ship',
        header: t('corp.members.columnShip'),
        width: '24ch',
        className: 'truncate',
        render: (row) =>
          row.shipTypeId === null ? (
            label(row.shipName, row.shipTypeId)
          ) : (
            <ItemInfoLink typeId={row.shipTypeId}>
              {label(row.shipName, row.shipTypeId)}
            </ItemInfoLink>
          ),
        sortValue: (row) => row.shipName ?? undefined,
      },
      {
        id: 'location',
        header: t('corp.members.columnLocation'),
        className: 'truncate',
        render: (row) =>
          row.locationId !== null &&
          row.locationName !== null &&
          isSolarSystemId(row.locationId) ? (
            <SystemLink systemId={row.locationId}>{row.locationName}</SystemLink>
          ) : (
            label(row.locationName, row.locationId)
          ),
        sortValue: (row) => row.locationName ?? undefined,
      },
      {
        id: 'joined',
        header: t('corp.members.columnJoined'),
        stackAffix: { before: `${t('corp.members.columnJoined')} ` },
        width: '12ch',
        className: 'whitespace-nowrap tabular-nums text-text-dim',
        render: (row) =>
          row.startMs === null ? DASH : formatDateOnly(new Date(row.startMs), timeZone),
        sortValue: (row) => row.startMs ?? undefined,
      },
      {
        id: 'roles',
        header: t('corp.members.columnRoles'),
        width: '24ch',
        className: 'truncate',
        render: (row) => rolesText(row.roles) ?? DASH,
        sortValue: (row) => rolesText(row.roles) ?? undefined,
      },
    ],
    [t, timeZone]
  );
}
