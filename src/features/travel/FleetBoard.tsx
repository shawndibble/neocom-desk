import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import {
  buildFleetBoard,
  DSCAN_AXIS_KM,
  laneOffset,
  type DscanRole,
  type FleetBoard as FleetBoardData,
  type FleetHull,
  type FleetRole,
} from '@/engine/pilotList/dscanRoles';
import type { DscanRow } from '@/engine/pilotList/parsePilotPaste';
import { cx } from '@/lib/cx';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

/**
 * Role -> clock-kind token. Identity only, never a status; the legend and the
 * lane labels carry the role's name (DESIGN.md §1, "Clock kinds").
 */
const ROLE_COLOUR: Record<DscanRole, string> = {
  capitals: 'var(--color-kind-order-expiry)',
  industrial: 'var(--color-kind-industry-job)',
  transport: 'var(--color-kind-calendar-event)',
  support: 'var(--color-kind-planet-extraction)',
  dps: 'var(--color-kind-contract-expiry)',
  drones: 'var(--color-kind-skill-training)',
  structures: 'var(--color-kind-moon-chunk)',
};

const KM_PER_AU = 149_597_870.7;

function formatKm(km: number): string {
  if (km >= KM_PER_AU / 10) return `${(km / KM_PER_AU).toFixed(1)} AU`;
  return `${Math.round(km).toLocaleString()} km`;
}

function formatRange(hull: FleetHull): string | null {
  if (hull.minKm === null || hull.maxKm === null) return null;
  const min = Math.round(hull.minKm);
  const max = Math.round(hull.maxKm);
  return min === max ? formatKm(hull.minKm) : `${formatKm(hull.minKm)} – ${formatKm(hull.maxKm)}`;
}

interface Loaded {
  board: FleetBoardData;
  names: ReadonlyMap<number, string>;
}

/**
 * A D-Scan read as a Fleet board: ships grouped by role under one share bar.
 * The bar is the single control — it expands the distance lanes beneath it.
 * Shared by the live Pilot Lookup view and a Shared D-Scan, so both group the
 * same way.
 */
export function FleetBoard({ rows }: { rows: readonly DscanRow[] }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>();
  const [expanded, setExpanded] = useState(false);
  const lanesId = useId();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadTypes(), loadGroupCategories()]).then(([types, categories]) => {
      if (cancelled) return;
      const board = buildFleetBoard(rows, (typeId) => {
        const type = types[String(typeId)];
        return type === undefined
          ? undefined
          : { groupId: type.groupID, categoryId: categories[String(type.groupID)] ?? 0 };
      });
      const names = new Map<number, string>();
      for (const role of board.roles) {
        for (const { typeId } of role.hulls) {
          names.set(typeId, types[String(typeId)]?.name ?? `#${typeId}`);
        }
      }
      setLoaded({ board, names });
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the rows themselves: a caller re-parsing the same scan hands a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.typeId}|${r.name}|${r.distanceKm}`).join(',')]);

  if (loaded === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  const { board, names } = loaded;
  if (board.roles.length === 0) {
    return (
      <EmptyState
        title={t('travel.pilot.dscan.emptyTitle')}
        hint={t('travel.pilot.dscan.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={lanesId}
          onClick={() => setExpanded((open) => !open)}
          className={cx(
            'block w-full space-y-2 rounded-xs border border-line p-3 text-left',
            rowInteractiveClassName,
            focusRingInsetClassName
          )}
        >
          <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            <Caret expanded={expanded} />
            {t('travel.pilot.dscan.boardLabel')}
          </span>
          <span aria-hidden="true" className="flex h-5 gap-0.5 overflow-hidden rounded-xs">
            {board.roles.map((r) => (
              <span
                key={r.role}
                style={{ flexGrow: r.total, backgroundColor: ROLE_COLOUR[r.role] }}
                className="min-w-1"
              />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {board.roles.map((r) => (
              <span key={r.role} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: ROLE_COLOUR[r.role] }}
                  className="size-2.5 shrink-0 rounded-xs"
                />
                {t(`travel.pilot.dscan.role.${r.role}`)}{' '}
                <span className="text-text-dim tabular-nums">
                  {t('travel.pilot.dscan.legendEntry', {
                    count: r.total,
                    percent: Math.round(r.percent),
                  })}
                </span>
              </span>
            ))}
          </span>
        </button>
        {expanded && (
          <div id={lanesId} className="mt-3 space-y-1 px-1">
            <Lanes roles={board.roles} />
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {board.roles.map((r) => (
          <RoleCard key={r.role} role={r} names={names} />
        ))}
      </div>

      {board.leftOut > 0 && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.dscan.leftOut', { count: board.leftOut })}
        </p>
      )}
    </div>
  );
}

function RoleCard({ role, names }: { role: FleetRole; names: ReadonlyMap<number, string> }) {
  const { t } = useTranslation();
  const label = t(`travel.pilot.dscan.role.${role.role}`);
  return (
    <section aria-label={label} className="rounded-xs border border-line">
      <h3 className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5 text-sm font-semibold text-text">
        <span
          aria-hidden="true"
          style={{ backgroundColor: ROLE_COLOUR[role.role] }}
          className="size-2.5 shrink-0 rounded-xs"
        />
        {label} <span className="font-normal text-text-dim tabular-nums">{role.total}</span>
      </h3>
      <ul className="divide-y divide-line px-3">
        {role.hulls.map((hull) => {
          const range = formatRange(hull);
          const group =
            hull.groupId === null
              ? ''
              : t(`travel.pilot.dscan.group.${hull.groupId}`, { defaultValue: '' });
          const sub = [
            group,
            hull.nameHint === null
              ? ''
              : t('travel.pilot.dscan.nameHint', {
                  count: hull.nameHint.count,
                  name: hull.nameHint.name,
                }),
          ].filter((part) => part !== '');
          return (
            <li key={hull.typeId} className="flex items-baseline gap-2 py-1.5 text-sm">
              <span className="w-6 shrink-0 text-right text-text-dim tabular-nums">
                {hull.count}
              </span>
              <span className="min-w-0 flex-1">
                {names.get(hull.typeId)}
                {sub.length > 0 && (
                  <span className="block text-xs text-text-dim">{sub.join(' · ')}</span>
                )}
              </span>
              {range !== null && (
                <span className="shrink-0 text-xs whitespace-nowrap text-text-dim tabular-nums">
                  {range}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const AXIS_TICKS = [0, 50, 100, DSCAN_AXIS_KM];

/** One lane per role, one dot per ship at its distance. D-Scan has a range, never a bearing. */
function Lanes({ roles }: { roles: readonly FleetRole[] }) {
  const { t } = useTranslation();
  return (
    <>
      <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.dscan.lanesTitle')}
      </h3>
      {roles.map((r) => {
        const label = t(`travel.pilot.dscan.role.${r.role}`);
        const summary =
          r.distancesKm.length === 0
            ? t('travel.pilot.dscan.laneNoDistance', { role: label, count: r.total })
            : t('travel.pilot.dscan.laneSummary', {
                role: label,
                count: r.total,
                nearest: formatKm(r.distancesKm[0]),
              });
        return (
          <div key={r.role} role="group" aria-label={summary} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex w-28 shrink-0 items-center gap-1.5 truncate text-xs text-text-dim sm:w-40"
            >
              <span
                style={{ backgroundColor: ROLE_COLOUR[r.role] }}
                className="size-2.5 shrink-0 rounded-xs"
              />
              <span className="truncate">{label}</span>
              <span className="tabular-nums">{r.total}</span>
            </span>
            <span
              aria-hidden="true"
              className="relative h-6 min-w-0 flex-1 rounded-xs border border-line bg-panel-2"
            >
              {r.distancesKm.map((km, i) => {
                const { fraction, beyond } = laneOffset(km);
                return (
                  <span
                    key={i}
                    style={{
                      left: `${fraction * 100}%`,
                      backgroundColor: beyond ? 'transparent' : ROLE_COLOUR[r.role],
                      borderColor: ROLE_COLOUR[r.role],
                    }}
                    className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-solid"
                  />
                );
              })}
            </span>
          </div>
        );
      })}
      <div aria-hidden="true" className="flex gap-3 pt-1 text-[0.6875rem] text-text-dim">
        <span className="w-28 shrink-0 sm:w-40" />
        <span className="relative h-4 flex-1 tabular-nums">
          {AXIS_TICKS.map((tick) => (
            <span
              key={tick}
              style={{ left: `${(tick / DSCAN_AXIS_KM) * 100}%` }}
              className={cx(
                'absolute whitespace-nowrap',
                tick === 0 ? '' : tick === DSCAN_AXIS_KM ? '-translate-x-full' : '-translate-x-1/2'
              )}
            >
              {tick === DSCAN_AXIS_KM
                ? t('travel.pilot.dscan.lanesBeyond', { max: DSCAN_AXIS_KM })
                : tick}
            </span>
          ))}
        </span>
      </div>
      <p className="text-xs text-text-dim">{t('travel.pilot.dscan.laneNotes')}</p>
    </>
  );
}
