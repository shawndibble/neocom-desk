/**
 * Roles audit builder (issue #4613). Same contract as `models.ts`: pure,
 * derived at render time. Counts Directors, and role changes in the last
 * `WIDGET_CHANGE_DAYS` days (ESI keeps about a month; nothing here ticks).
 */
import {
  WIDGET_CHANGE_DAYS,
  recentChanges,
  roleLabel,
  type RoleChange,
} from '@/engine/corp/roleAudit';
import { label } from '@/engine/corp/members';
import {
  ageText,
  blank,
  corpUnreadable,
  count,
  statusOf,
  UNKNOWN,
  type Builder,
} from './builderKit';
import type { TableModel } from './types';

const K = 'overview.widgets.corpRoleAudit';
const PATH = '/corp/members?tab=roles';

export const corpRoleAudit: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpRoleAudit;
  const data = feed?.data ?? null;
  if (!data) return blank(PATH, statusOf(feed));
  if (!data.readable || data.audit === null) return corpUnreadable(PATH, feed, data.needsReauth, t);

  const { holders, changes, names } = data.audit;
  const directors = holders.filter((holder) => holder.roles.includes('Director')).length;
  const recent = changes === null ? null : recentChanges(changes, now, WIDGET_CHANGE_DAYS);

  const lastChange = new Map<number, RoleChange>();
  // `changes` is newest first, so the first one seen per member is the latest.
  for (const change of changes ?? []) {
    if (!lastChange.has(change.characterId)) lastChange.set(change.characterId, change);
  }
  const recentIds = new Set((recent ?? []).map((change) => change.characterId));

  const sorted = [...holders].sort(
    (a, b) =>
      Number(b.roles.includes('Director')) - Number(a.roles.includes('Director')) ||
      label(names.get(a.characterId) ?? null, a.characterId).localeCompare(
        label(names.get(b.characterId) ?? null, b.characterId)
      ) ||
      a.characterId - b.characterId
  );
  const nameOf = (id: number) => label(names.get(id) ?? null, id);
  const rolesOf = (roles: readonly string[]) => roles.map(roleLabel).join(', ');
  const changeOf = (id: number) => ageText(t, now, lastChange.get(id)?.changedAtMs ?? null);

  const changeText =
    recent === null
      ? t(`${K}.changesUnknown`)
      : t(`${K}.changes`, { count: recent.length, days: WIDGET_CHANGE_DAYS });

  const table: TableModel = {
    columns: [
      { key: 'member', label: t(`${K}.col.member`), priority: 0 },
      { key: 'roles', label: t(`${K}.col.roles`), priority: 1 },
      { key: 'change', label: t(`${K}.col.change`), align: 'end', priority: 2 },
    ],
    rows: sorted.map((holder) => ({
      key: String(holder.characterId),
      cells: [
        nameOf(holder.characterId),
        rolesOf(holder.roles),
        lastChange.has(holder.characterId)
          ? {
              text: changeOf(holder.characterId),
              tone: recentIds.has(holder.characterId) ? ('caution' as const) : undefined,
            }
          : UNKNOWN,
      ],
    })),
    footer: changes === null ? t(`${K}.historyUnknown`) : undefined,
  };

  return {
    ...blank(PATH, statusOf(feed, { isEmpty: holders.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(directors),
      unit: t(`${K}.unit`, { count: directors }),
      secondary: { text: changeText },
      tone: 'clear',
    },
    rows: sorted.map((holder) => ({
      key: String(holder.characterId),
      title: nameOf(holder.characterId),
      detail: rolesOf(holder.roles),
      value: lastChange.has(holder.characterId) ? changeOf(holder.characterId) : UNKNOWN,
      tone: 'clear' as const,
    })),
    table,
    summary: [t(`${K}.summary`, { count: directors, holders: holders.length }), changeText].join(
      ' '
    ),
  };
};
