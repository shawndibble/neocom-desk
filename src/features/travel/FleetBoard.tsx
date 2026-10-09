import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { Caret, Disclosure } from '@/components/ui/Disclosure';
import { buildDangerRead, scanAge } from '@/engine/pilotList/dscanDanger';
import {
  buildFleetBoard,
  DSCAN_AXIS_KM,
  laneOffset,
  type DscanRole,
  type DscanTypeInfo,
  type FleetBoard as FleetBoardData,
  type FleetHull,
  type FleetRole,
} from '@/engine/pilotList/dscanRoles';
import { formatDistanceKm as formatKm } from '@/engine/pilotList/formatDistanceKm';
import type { DscanRow } from '@/engine/pilotList/parsePilotPaste';
import type { HullCount } from '@/engine/pilotList/dscanWorth';
import { GrantNote } from '@/app/GrantNote';
import { useCharacterShipTypeId } from '@/features/character/ship';
import { cx } from '@/lib/cx';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { DangerAnswer, TripwireCard, WatchCard } from './DangerRead';
import { DscanMeta } from './DscanMeta';
import { useLastScan } from './lastScan';
import { OwnShipPicker } from './OwnShipPicker';
import { useManualShip } from './ownShip';

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

function formatRange(hull: FleetHull): string | null {
  if (hull.minKm === null || hull.maxKm === null) return null;
  const min = Math.round(hull.minKm);
  const max = Math.round(hull.maxKm);
  return min === max ? formatKm(hull.minKm) : `${formatKm(hull.minKm)} – ${formatKm(hull.maxKm)}`;
}

/** Ships only: drones and structures are not hulls anyone flies, so they stay out of worth and diff. */
function shipHulls(board: FleetBoardData): HullCount[] {
  return board.roles
    .filter((r) => r.role !== 'drones' && r.role !== 'structures')
    .flatMap((r) => r.hulls.map(({ typeId, count }) => ({ typeId, count })));
}

interface Loaded {
  board: FleetBoardData;
  names: ReadonlyMap<number, string>;
  infoOf: (typeId: number) => DscanTypeInfo | undefined;
  nameOf: (typeId: number) => string;
  /** When the scan was read, in ms: a live paste's age counts from here. */
  at: number;
}

/** How often the scan's age line re-reads the clock. */
const AGE_TICK_MS = 15_000;

/**
 * A D-Scan read for danger: an answer to "am I in danger?", the ships to watch,
 * what would change the answer, and the full scan (fleet by role, worth,
 * changes) collapsed beneath. Shared by the live Pilot Lookup view and a Shared
 * D-Scan, so both group the same way.
 */
export function FleetBoard({
  rows,
  trackHistory = false,
}: {
  rows: readonly DscanRow[];
  /** Compare with, and then store as, this device's last scan. The live paste only. */
  trackHistory?: boolean;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>();
  const [expanded, setExpanded] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const lanesId = useId();
  const rowsKey = rows.map((r) => `${r.typeId}|${r.name}|${r.distanceKm}`).join(',');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadTypes(), loadGroupCategories()]).then(([types, categories]) => {
      if (cancelled) return;
      const infoOf = (typeId: number) => {
        const type = types[String(typeId)];
        return type === undefined
          ? undefined
          : { groupId: type.groupID, categoryId: categories[String(type.groupID)] ?? 0 };
      };
      const nameOf = (typeId: number) => types[String(typeId)]?.name ?? `#${typeId}`;
      const board = buildFleetBoard(rows, infoOf);
      const names = new Map<number, string>();
      for (const role of board.roles) {
        for (const { typeId } of role.hulls) names.set(typeId, nameOf(typeId));
      }
      setLoaded({ board, names, infoOf, nameOf, at: Date.now() });
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the rows themselves: a caller re-parsing the same scan hands a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  // The age of a live paste, re-read on a slow tick. A Shared D-Scan has none to show.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!trackHistory) return;
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(id);
  }, [trackHistory]);

  const hulls = useMemo(() => (loaded === undefined ? [] : shipHulls(loaded.board)), [loaded]);
  const previous = useLastScan(hulls, trackHistory && loaded !== undefined);

  const manual = useManualShip();
  const current = useCharacterShipTypeId();
  const ownTypeId = manual.typeId ?? current.typeId;
  const ownShipGroupId =
    loaded === undefined || ownTypeId === null ? null : (loaded.infoOf(ownTypeId)?.groupId ?? null);

  const read = useMemo(
    () =>
      loaded === undefined || (trackHistory && previous === undefined)
        ? undefined
        : buildDangerRead(rows, loaded.infoOf, loaded.nameOf, {
            ownShipGroupId,
            previous: previous ?? null,
          }),
    // `rows` is keyed by `rowsKey`: a caller re-parsing the same scan hands a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, previous, ownShipGroupId, rowsKey, trackHistory]
  );
  // The ship's name is only stated when its size is known: otherwise the read says it is not set.
  const shipName =
    loaded !== undefined && ownTypeId !== null && read?.ownShipKnown === true
      ? loaded.nameOf(ownTypeId)
      : null;

  if (loaded === undefined || (trackHistory && previous === undefined)) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  const { board, names } = loaded;
  const answer = read ?? null;
  if (board.roles.length === 0) {
    return (
      <EmptyState
        title={t('travel.pilot.dscan.emptyTitle')}
        hint={t('travel.pilot.dscan.emptyHint')}
      />
    );
  }

  const roleShare = (
    <ShareBar
      board={board}
      expanded={expanded}
      lanesId={lanesId}
      onToggle={() => setExpanded((open) => !open)}
    />
  );
  const fullScan = (
    <>
      {(answer === null || !answer.promoteRoles) && roleShare}
      <div className="grid gap-3 md:grid-cols-2">
        {board.roles.map((r) => (
          <RoleCard key={r.role} role={r} names={names} />
        ))}
      </div>
      <DscanMeta hulls={hulls} names={names} trackHistory={trackHistory} previous={previous} />
      {board.leftOut > 0 && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.dscan.leftOut', { count: board.leftOut })}
        </p>
      )}
      <p className="text-xs text-text-dim">{t('travel.pilot.dscan.readout.caveat')}</p>
    </>
  );

  return (
    <div className="space-y-4">
      {answer !== null && (
        <>
          <DangerAnswer
            read={answer}
            names={names}
            age={trackHistory ? scanAge(Math.max(0, now - loaded.at)) : null}
            shipControl={
              <OwnShipPicker
                typeId={manual.typeId}
                autoTypeId={current.typeId}
                onChange={manual.setTypeId}
              />
            }
            notes={
              manual.typeId === null ? (
                <GrantNote
                  endpoints={['getCharacterShip']}
                  title={t('travel.pilot.dscan.danger.grant.title')}
                  hint={t('travel.pilot.dscan.danger.grant.hint')}
                  actionLabel={t('travel.pilot.dscan.danger.grant.action')}
                />
              ) : undefined
            }
          />
          {answer.promoteRoles && roleShare}
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <WatchCard
              read={answer}
              names={names}
              shipName={shipName}
              groupLabel={(groupId) =>
                t(`travel.pilot.dscan.group.${groupId}`, { defaultValue: '' })
              }
            />
            <TripwireCard
              tripwires={answer.tripwires}
              firstScan={trackHistory && previous === null}
            />
          </div>
        </>
      )}
      {answer === null ? (
        <div className="space-y-4">{fullScan}</div>
      ) : (
        <Disclosure
          label={t('travel.pilot.dscan.danger.fullScan', { count: answer.totalShips })}
          expanded={fullOpen}
          onToggle={() => setFullOpen((open) => !open)}
        >
          <div className="space-y-4 pt-3">{fullScan}</div>
        </Disclosure>
      )}
    </div>
  );
}

/** The share bar: roles as one bar with a legend. It is the control that expands the distance lanes. */
function ShareBar({
  board,
  expanded,
  lanesId,
  onToggle,
}: {
  board: FleetBoardData;
  expanded: boolean;
  lanesId: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={lanesId}
        onClick={onToggle}
        className={cx(
          'block min-h-11 w-full space-y-2 rounded-xs border border-line p-3 text-left',
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
      <div id={lanesId} hidden={!expanded} className="mt-3 space-y-1 px-1">
        {expanded && <Lanes roles={board.roles} />}
      </div>
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
