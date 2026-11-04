/**
 * The kills at one Route Safety location, or at a whole system (issue #5929):
 * newest first, each with who died, in what, for how much, and, expanded,
 * who was on the mail. Reads only what the route walk already fetched; the
 * names come from ESI as the modal opens (victims) and as a kill is expanded
 * (attackers), and a name that does not resolve is simply left out.
 *
 * States conditions, never verdicts (decision `20260912-172628`): the hull
 * summary counts kills that carried a class, never attackers, and nothing
 * here says what the kills mean for the pilot.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, TypeIcon } from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { Caret } from '@/components/ui/Disclosure';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Pill } from '@/components/ui/Pill';
import {
  capAttackers,
  groupVictimKills,
  type HullKillCount,
  minutesBefore,
  type RecentKillLocation,
  type RecentKillView,
} from '@/engine/route/recentKills';
import { resolveNames } from '@/features/character/names';
import { loadGroupNames } from '@/features/market/groupNames';
import { formatIskCompact } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { killZkillUrl, systemZkillUrl } from '@/lib/zkillboard';
import { useTypeLabel } from './useTypeLabel';

/** Attackers listed per expanded kill before "and N more"; the final blow is always among them. */
export const ATTACKER_CAP = 15;
/** Hull classes named in the header. */
const HULL_CHIPS = 4;

function victimIds(kills: readonly RecentKillView[]): number[] {
  return kills.flatMap((kill) => [
    ...(kill.victim?.characterId != null ? [kill.victim.characterId] : []),
    ...(kill.victim?.corporationId != null ? [kill.victim.corporationId] : []),
    ...(kill.victim?.allianceId != null ? [kill.victim.allianceId] : []),
  ]);
}

function attackerIds(kill: RecentKillView): number[] {
  const { shown } = capAttackers(kill.attackers, ATTACKER_CAP);
  return shown.flatMap((attacker) => [
    ...(attacker.characterId !== undefined ? [attacker.characterId] : []),
    ...(attacker.corporationId !== undefined ? [attacker.corporationId] : []),
    ...(attacker.allianceId !== undefined ? [attacker.allianceId] : []),
  ]);
}

/** Names for ids, filled in as ESI answers; an id that never resolves stays absent. */
function useNames(ids: readonly number[], enabled: boolean): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!enabled || key === '') return;
    let cancelled = false;
    void resolveNames(key.split(',').map(Number))
      .then((resolved) => {
        if (cancelled) return;
        setNames((previous) => new Map([...previous, ...resolved]));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return names;
}

function Org({
  corporationId,
  allianceId,
  names,
}: {
  corporationId: number | null | undefined;
  allianceId: number | null | undefined;
  names: ReadonlyMap<number, string>;
}) {
  const parts = [corporationId, allianceId].flatMap((id) => {
    const name = id == null ? undefined : names.get(id);
    return name === undefined ? [] : [name];
  });
  return parts.length === 0 ? null : <>{parts.join(' · ')}</>;
}

function Tags({ kill }: { kill: RecentKillView }) {
  const { t } = useTranslation();
  return (
    <>
      {kill.bubble && <Pill tone="warning">{t('travel.kills.bubbles')}</Pill>}
      {kill.smartbomb && <Pill tone="warning">{t('travel.kills.smartbombs')}</Pill>}
    </>
  );
}

function AttackerList({
  kill,
  names,
  typeLabel,
}: {
  kill: RecentKillView;
  names: ReadonlyMap<number, string>;
  typeLabel: (typeId: number) => string;
}) {
  const { t } = useTranslation();
  const { shown: capped, more } = capAttackers(kill.attackers, ATTACKER_CAP);
  // An attacker with nothing to show (no pilot name, ship or weapon) is left out, not drawn empty.
  const shown = capped.filter(
    (attacker) =>
      attacker.shipTypeId !== undefined ||
      attacker.weaponTypeId !== undefined ||
      (attacker.characterId !== undefined && names.has(attacker.characterId))
  );
  // Say so only when the list is not the whole mail: a cap, or attackers with nothing to show.
  const footnote =
    more > 0
      ? t('travel.kills.modal.attackersMore', { count: more })
      : shown.length < kill.attackers.length
        ? t('travel.kills.modal.attackersShown', {
            shown: shown.length,
            total: kill.attackers.length,
          })
        : null;
  return (
    <div className="bg-panel-2 px-3 pb-2 pt-1 pl-14 text-sm">
      <ul className="space-y-2 sm:space-y-1">
        {shown.map((attacker, index) => {
          const pilot =
            attacker.characterId === undefined ? undefined : names.get(attacker.characterId);
          return (
            <li
              // Attackers repeat no id, so the position is the stable key.
              key={index}
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
            >
              {pilot !== undefined && (
                <span className="font-medium text-text sm:w-44">{pilot}</span>
              )}
              {attacker.shipTypeId !== undefined && (
                <span className="inline-flex items-center gap-1.5 text-text sm:w-40">
                  <TypeIcon typeId={attacker.shipTypeId} size={32} className="size-5 rounded-xs" />
                  {typeLabel(attacker.shipTypeId)}
                </span>
              )}
              {attacker.weaponTypeId !== undefined && (
                <span className="basis-full text-text-dim sm:basis-auto">
                  {typeLabel(attacker.weaponTypeId)}
                </span>
              )}
              {attacker.finalBlow && <Pill tone="accent">{t('travel.kills.modal.finalBlow')}</Pill>}
              <span className="basis-full text-xs text-text-dim empty:hidden">
                <Org
                  corporationId={attacker.corporationId}
                  allianceId={attacker.allianceId}
                  names={names}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-text-dim">
        {footnote !== null && <>{footnote} · </>}
        <ExternalLink href={killZkillUrl(kill.killmailId)}>
          {t('travel.kills.modal.killmail')}
        </ExternalLink>
      </p>
    </div>
  );
}

/** How many different attackers a group of mails had; the mails' own sizes when some have no ids. */
function attackerCount(group: readonly RecentKillView[]): number {
  const everyone = group.flatMap((kill) => kill.attackers);
  if (everyone.every((attacker) => attacker.characterId !== undefined)) {
    return new Set(everyone.map((attacker) => attacker.characterId)).size;
  }
  return everyone.length;
}

/**
 * One pilot's loss: their ship, and the pod that followed it when there was
 * one, grouped on one row (`groupVictimKills`). Oldest mail first.
 */
function KillRow({
  group,
  victimNames,
  typeLabel,
  now,
}: {
  group: readonly RecentKillView[];
  victimNames: ReadonlyMap<number, string>;
  typeLabel: (typeId: number) => string;
  now: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const attackerNames = useNames(group.flatMap(attackerIds), expanded);
  const names = useMemo(
    () => new Map([...victimNames, ...attackerNames]),
    [victimNames, attackerNames]
  );
  const first = group[0];
  if (first === undefined) return null;
  const shipTypeId = first.victim?.shipTypeId ?? null;
  const pilot = first.victim?.characterId == null ? undefined : names.get(first.victim.characterId);
  const shipLine = group
    .flatMap((kill) => (kill.victim?.shipTypeId == null ? [] : [typeLabel(kill.victim.shipTypeId)]))
    .join(' + ');
  const values = group.flatMap((kill) => (kill.value == null ? [] : [kill.value]));
  // A total only when every mail has a value: a partial sum would pass for the whole loss.
  const value =
    values.length === 0 || values.length < group.length
      ? null
      : values.reduce((sum, v) => sum + v, 0);
  const minutes = minutesBefore(now, Math.max(...group.map((kill) => kill.time)));
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={cx(
          'flex w-full flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-left',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        {shipTypeId !== null ? (
          <TypeIcon typeId={shipTypeId} size={64} className="mt-0.5 size-9 shrink-0 rounded-xs" />
        ) : (
          <span className="size-9 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          {pilot !== undefined && <span className="block font-semibold text-text">{pilot}</span>}
          {shipLine !== '' && (
            <span
              className={
                pilot === undefined ? 'block font-semibold text-text' : 'block text-text-dim'
              }
            >
              {shipLine}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right text-xs tabular-nums text-text-dim">
          {value !== null && (
            <span className="block font-medium text-text">{formatIskCompact(value)} ISK</span>
          )}
          {t('travel.kills.modal.minutesAgo', { minutes })} ·{' '}
          {t('travel.kills.modal.attackers', { count: attackerCount(group) })}
        </span>
        <Caret expanded={expanded} />
        <span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-1 pl-12 empty:hidden">
          <span className="text-xs text-text-dim empty:hidden">
            <Org
              corporationId={first.victim?.corporationId}
              allianceId={first.victim?.allianceId}
              names={names}
            />
          </span>
          <Tags
            kill={{
              ...first,
              bubble: group.some((kill) => kill.bubble),
              smartbomb: group.some((kill) => kill.smartbomb),
            }}
          />
        </span>
      </button>
      {expanded &&
        group.map((kill) => (
          <div key={kill.killmailId}>
            {group.length > 1 && kill.victim?.shipTypeId != null && (
              <p className="bg-panel-2 px-3 pt-2 pl-14 text-xs font-semibold uppercase tracking-wide text-text-dim">
                {typeLabel(kill.victim.shipTypeId)}
              </p>
            )}
            <AttackerList kill={kill} names={names} typeLabel={typeLabel} />
          </div>
        ))}
    </li>
  );
}

export interface KillLocationModalProps {
  open: boolean;
  onClose: () => void;
  systemId: number;
  systemName: string;
  /** One location, or every location of the system (on-path gates first). */
  locations: readonly RecentKillLocation[];
  /** Hull classes over the whole list, counted per kill. */
  hulls: readonly HullKillCount[];
  /** `location` titles the modal with the place; `system` with the system. */
  scope: 'location' | 'system';
}

export function KillLocationModal({
  open,
  onClose,
  systemId,
  systemName,
  locations: openLocations,
  hulls,
  scope,
}: KillLocationModalProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const typeLabel = useTypeLabel();
  // The modal mounts when it is opened, so both are a snapshot of that moment:
  // a refresh of the route's kills does not shuffle rows under the reader.
  const [now] = useState(() => Date.now());
  const [locations] = useState(openLocations);
  const ordered = useMemo(
    () => [...locations].sort((a, b) => Number(b.onPath) - Number(a.onPath)),
    [locations]
  );
  const allKills = useMemo(() => ordered.flatMap((location) => location.kills), [ordered]);
  const names = useNames(victimIds(allKills), open);
  const hullGroups = useMemo(() => hulls.map((hull) => hull.groupId), [hulls]);
  const [groupNames, setGroupNames] = useState<ReadonlyMap<number, string>>(new Map());
  useEffect(() => {
    if (!open || hullGroups.length === 0) return;
    let cancelled = false;
    void loadGroupNames(hullGroups)
      .then((resolved) => {
        if (!cancelled) setGroupNames(resolved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, hullGroups]);

  const only = ordered.length === 1 ? ordered[0] : undefined;
  const title =
    scope === 'location' && only
      ? `${only.name ?? t('travel.kills.modal.elsewhere')} · ${systemName}`
      : t('travel.kills.modal.system', { system: systemName });
  const total = t('travel.kills.modal.summary', { count: allKills.length });
  const chips = [
    ordered.length > 1
      ? t('travel.kills.modal.summaryPlaces', { kills: total, places: ordered.length })
      : total,
    allKills.length > 0
      ? t('travel.kills.modal.lastKill', {
          minutes: minutesBefore(now, Math.max(...allKills.map((kill) => kill.time))),
        })
      : null,
    allKills.some((kill) => kill.bubble) ? t('travel.kills.bubbles') : null,
    allKills.some((kill) => kill.smartbomb) ? t('travel.kills.smartbombs') : null,
    ...hulls.slice(0, HULL_CHIPS).flatMap((hull) => {
      const hullName = groupNames.get(hull.groupId);
      return hullName === undefined
        ? []
        : [
            t('travel.kills.modal.hullOn', {
              hull: hullName,
              count: hull.kills,
              total: allKills.length,
            }),
          ];
    }),
  ].filter((chip): chip is string => chip !== null);

  return (
    <Modal open={open} onClose={onClose} placement={phone ? 'sheet-full' : 'wide'} title={title}>
      <div className="text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 text-xs text-text-dim">
          {chips.map((chip, index) => (
            <span key={index}>{chip}</span>
          ))}
          <ExternalLink href={systemZkillUrl(systemId)} className="ml-auto">
            {t('travel.kills.modal.systemOnZkill')}
          </ExternalLink>
        </div>
        {ordered.map((location) => (
          <section key={location.key}>
            {ordered.length > 1 && (
              <h3 className="sticky top-0 z-10 flex items-center gap-2 border-y border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-dim">
                {location.name ?? t('travel.kills.modal.elsewhere')}
                {location.onPath && <Pill tone="accent">{t('travel.kills.onPath')}</Pill>}
                <span className="ml-auto shrink-0 whitespace-nowrap font-normal normal-case tracking-normal">
                  {t('travel.kills.modal.summary', { count: location.count })}
                </span>
              </h3>
            )}
            <ul>
              {groupVictimKills(location.kills).map((group) => (
                <KillRow
                  key={group[0]?.killmailId}
                  group={group}
                  victimNames={names}
                  typeLabel={typeLabel ?? ((id) => `#${id}`)}
                  now={now}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
