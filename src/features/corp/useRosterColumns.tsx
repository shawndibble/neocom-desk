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

/** Solar system ids sit in 30,000,000-32,000,000; stations and structures do not. */
const isSolarSystemId = (id: number) => id >= 30_000_000 && id < 32_000_000;

/** Every roster column, hidden or not — the table and its column picker both read it. */
// Shared with the Players view, which reuses every column but Member.
export function useRosterColumns(): DataTableColumn<RosterRow>[] {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return useMemo<DataTableColumn<RosterRow>[]>(
    () => [
      {
        id: 'member',
        header: t('corp.members.columnMember'),
        // Pinned while the other columns scroll sideways on a phone.
        stickyStart: true,
        stickyStartOnPanel: true,
        className: 'truncate',
        // The name truncates, the tag does not: a long name must not ellipsize it away.
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
              // A non-interactive badge (§6c): the word shows, the tooltip only names who.
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
        align: 'right',
        width: '16ch',
        className: 'whitespace-nowrap tabular-nums',
        // The one tone on the table: a member past the dark threshold. Applied
        // to this cell rather than the whole row, so the amber reads as a
        // statement about the silence and not about the person.
        cellClassName: (row) => (row.standing.isDark ? 'text-warning' : undefined),
        render: (row) => {
          const age = row.standing.neverSeen
            ? t('corp.members.never')
            : // Clamped here, not in the engine: a negative span is clock skew,
              // and "just now" is the honest rendering of it.
              formatAge(Math.max(0, row.standing.darkForMs ?? 0), t);
          // Amber alone is the only signal otherwise (WCAG 1.4.1); the glyph
          // is decorative, the age text beside it is what is read.
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
        // Sorted on the span, matching what the cell prints — see the module
        // note. `undefined` for a member with no date at all sinks them to the
        // end in either direction, which is right: nothing is known about them.
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
        // A solar system links to Route Safety / Travel, where waypoints are
        // set; a station or structure id is not a system, so stays text.
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
        // `formatDateOnly` on one line: "10/23/2026".
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
