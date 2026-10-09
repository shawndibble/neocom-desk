/**
 * What a pasted Local list or D-Scan becomes in Pilot Lookup (issue #2863 and
 * the intel rework): a Local list is grouped by what each pilot means to the
 * Character (contacts, kills in the space they are in, kills elsewhere,
 * quiet, friendly), with kills split by space and dated; a D-Scan is its
 * ships counted by class. A pilot's name opens Show Info, whose Character tab
 * has the six-month picture.
 *
 * A group says what a pilot did ("Killed in highsec, last 30 days"), and each
 * row carries a Threat badge beside the name (decision `20261008-181210`); the
 * list never calls a pilot safe or hostile.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  Panel,
  Spinner,
  TextInput,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  buildDscanSnapshot,
  dscanSnapshotReuseKey,
  MAX_DSCAN_SNAPSHOT_CHARS,
} from '@/engine/pilotList/dscanSnapshot';
import { groupOf, PILOT_GROUP_ORDER, type PilotGroupId } from '@/engine/pilotList/grouping';
import { ageTone, topShips, windowStart, type KillSpace } from '@/engine/pilotList/killActivity';
import { CharacterLink } from '@/features/entities';
import { loadTypeNames } from '@/features/character/typeNames';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { createShareLink, existingShareLink } from '@/features/share/shareStore';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { useNow } from '@/lib/useNow';
import type { PilotPaste } from '@/engine/pilotList/parsePilotPaste';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { FleetBoard } from './FleetBoard';
import { loadPilotList, loadViewerContext, type PilotListRow } from './pilotListData';
import { rowThreat } from './rowThreat';
import { PilotCard } from './PilotCard';
import { ThreatBadge } from './ThreatBadge';
import { THREAT_LEVEL_TONE, THREAT_ROW_CLASS } from './threatTone';
import { PilotStandingTag } from './PilotStandingTag';
import { AGE_TEXT, SPACE_TEXT } from './pilotListStyles';
import { useHereSpace, type HereSpace } from './useHereSpace';

type LocalPaste = Extract<PilotPaste, { kind: 'local' }>;
type DscanPaste = Extract<PilotPaste, { kind: 'dscan' }>;

export function PilotListView({ paste }: { paste: PilotPaste }) {
  return paste.kind === 'local' ? (
    <LocalList key={paste.names.join('|')} paste={paste} />
  ) : (
    <Panel className="space-y-4">
      <FleetBoard rows={paste.rows} trackHistory />
    </Panel>
  );
}

/** How many hulls a row names under "Flew on kills". */
const ROW_HULLS = 2;

function recentKills(row: PilotListRow, now: number) {
  if (row.kills.kind !== 'ready') return [];
  // Same window as the counts: what they flew lately, not years ago.
  const since = windowStart(now);
  return row.kills.kills.filter((kill) => kill.timeMs >= since);
}

/** Most recent kills first, so the pilot who killed this morning leads the group. */
function byRecentActivity(a: PilotListRow, b: PilotListRow): number {
  const count = (row: PilotListRow) =>
    row.kills.kind === 'ready' ? row.kills.summary.recentCount : 0;
  const last = (row: PilotListRow) =>
    row.kills.kind === 'ready' ? (row.kills.kills[0]?.timeMs ?? 0) : 0;
  return count(b) - count(a) || last(b) - last(a) || a.name.localeCompare(b.name);
}

function LocalList({ paste }: { paste: LocalPaste }) {
  const { t } = useTranslation();
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const here = useHereSpace();
  const [rows, setRows] = useState<PilotListRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [hullNames, setHullNames] = useState<Map<number, string>>(new Map());
  const [showFriendly, setShowFriendly] = useState(false);
  const now = useNow();
  const isPhone = useIsPhone();

  useEffect(() => {
    const controller = new AbortController();
    loadPilotList(paste.names, {
      signal: controller.signal,
      onRows: setRows,
      viewer: loadViewerContext(characterId),
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [paste, characterId]);

  const hullIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of rows) {
      for (const hull of topShips(
        recentKills(row, now).map((kill) => kill.ownShipTypeId),
        ROW_HULLS
      )) {
        ids.add(hull.shipTypeId);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }, [rows, now]);
  const hullKey = hullIds.join(',');
  useEffect(() => {
    if (hullKey === '') return;
    let cancelled = false;
    void loadTypeNames(hullKey.split(',').map(Number))
      .then((names) => {
        if (!cancelled) setHullNames(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hullKey]);

  if (failed) {
    return (
      <EmptyState
        title={t('travel.pilot.list.failedTitle')}
        hint={t('travel.pilot.list.failedHint')}
      />
    );
  }

  const found = rows.filter((row) => !row.notFound);
  const settled = found.filter((row) => row.kills.kind !== 'loading').length;
  const notFound = rows.filter((row) => row.notFound).map((row) => row.name);

  const groups = new Map<PilotGroupId, PilotListRow[]>(PILOT_GROUP_ORDER.map((id) => [id, []]));
  for (const row of found) {
    const id = groupOf(
      {
        standing: row.standing,
        ownOrganization: row.ownOrganization,
        activity: row.kills.kind === 'ready' ? row.kills.summary : null,
      },
      here.space
    );
    groups.get(id)?.push(row);
  }
  for (const list of groups.values()) list.sort(byRecentActivity);

  const wormholeSeen =
    here.space === 'wormhole' ||
    found.some(
      (row) => row.kills.kind === 'ready' && row.kills.summary.bySpace.wormhole.lastMs !== null
    );
  const spaces: KillSpace[] = wormholeSeen
    ? ['highsec', 'lowsec', 'nullsec', 'wormhole']
    : ['highsec', 'lowsec', 'nullsec'];

  const columns: DataTableColumn<PilotListRow>[] = [
    {
      id: 'pilot',
      header: t('travel.pilot.list.pilot'),
      render: (row) => {
        const threat = rowThreat(row, now);
        return (
          <>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {row.characterId === null ? (
                row.name
              ) : (
                <CharacterLink id={row.characterId}>{row.name}</CharacterLink>
              )}
              {threat !== null && <ThreatBadge level={threat} solid />}
            </span>
            {(row.corporationName || row.allianceName) && (
              <span className="block truncate text-[0.6875rem] text-text-dim">
                {[row.corporationName, row.allianceName].filter(Boolean).join(' · ')}
              </span>
            )}
          </>
        );
      },
    },
    {
      id: 'standing',
      header: t('travel.pilot.list.standing'),
      render: (row) => <StandingCell row={row} />,
    },
    ...spaces.map((space): DataTableColumn<PilotListRow> => ({
      id: space,
      header: t(`common.spaceOption.${space}`),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => <SpaceCell row={row} space={space} now={now} />,
    })),
    {
      id: 'flew',
      header: t('travel.pilot.list.flew'),
      phoneHidden: true,
      className: 'text-text-dim',
      render: (row) => {
        if (row.kills.kind !== 'ready') return '—';
        const hulls = topShips(
          recentKills(row, now).map((kill) => kill.ownShipTypeId),
          ROW_HULLS
        );
        return hulls.length === 0
          ? '—'
          : hulls
              .map(
                (hull) =>
                  hullNames.get(hull.shipTypeId) ?? t('common.unknownType', { id: hull.shipTypeId })
              )
              .join(', ');
      },
    },
  ];

  const flewOf = (row: PilotListRow): string | null => {
    if (row.kills.kind !== 'ready') return null;
    const hulls = topShips(
      recentKills(row, now).map((kill) => kill.ownShipTypeId),
      ROW_HULLS
    );
    return hulls.length === 0
      ? null
      : hulls
          .map(
            (hull) =>
              hullNames.get(hull.shipTypeId) ?? t('common.unknownType', { id: hull.shipTypeId })
          )
          .join(', ');
  };

  const table = (id: PilotGroupId, list: PilotListRow[]) =>
    isPhone ? (
      <ul aria-label={groupTitle(id, t, here.space)} className="space-y-2">
        {list.map((row) => (
          <PilotCard
            key={row.name}
            row={row}
            threat={rowThreat(row, now)}
            spaces={spaces}
            flew={flewOf(row)}
          />
        ))}
      </ul>
    ) : (
      <DataTable
        label={groupTitle(id, t, here.space)}
        columns={columns}
        rows={list}
        rowKey={(row) => row.name}
        rowClassName={(row) => {
          const threat = rowThreat(row, now);
          return threat === null ? undefined : THREAT_ROW_CLASS[THREAT_LEVEL_TONE[threat]];
        }}
        responsive="stack"
      />
    );

  return (
    <Panel>
      <div className="flex flex-col gap-6">
        <HereControl here={here} />
        {settled < found.length && (
          <p role="status" className="flex items-center gap-2 text-xs text-text-dim">
            <Spinner label={t('common.loading')} />
            {t('travel.pilot.list.progress', { done: settled, total: found.length })}
          </p>
        )}
        {PILOT_GROUP_ORDER.map((id) => {
          const list = groups.get(id) ?? [];
          if (list.length === 0) return null;
          if (id === 'friendly') {
            return (
              <section key={id} className="space-y-2">
                <GroupHeading id={id} count={list.length} space={here.space} />
                <Button
                  size="sm"
                  aria-expanded={showFriendly}
                  onClick={() => setShowFriendly((open) => !open)}
                >
                  {showFriendly
                    ? t('travel.pilot.list.friendlyHide')
                    : t('travel.pilot.list.friendlyShow')}
                </Button>
                {showFriendly && table(id, list)}
              </section>
            );
          }
          return (
            <section key={id} className="space-y-2">
              <GroupHeading id={id} count={list.length} space={here.space} />
              {table(id, list)}
            </section>
          );
        })}
        {notFound.length > 0 && (
          <p className="text-xs text-text-dim">
            {t('travel.pilot.list.notFoundNames', {
              count: notFound.length,
              names: notFound.join(', '),
            })}
          </p>
        )}
        {paste.overflow > 0 && (
          <p className="text-xs text-text-dim">
            {t('travel.pilot.list.overflow', { shown: paste.names.length, count: paste.overflow })}
          </p>
        )}
      </div>
    </Panel>
  );
}

type T = (key: string, opts?: Record<string, unknown>) => string;

function groupTitle(id: PilotGroupId, t: T, space: KillSpace | null): string {
  return t(`travel.pilot.list.group.${id}`, {
    space: space === null ? '' : t(`common.spaceOption.${space}`).toLowerCase(),
  });
}

function GroupHeading({
  id,
  count,
  space,
}: {
  id: PilotGroupId;
  count: number;
  space: KillSpace | null;
}) {
  const { t } = useTranslation();
  return (
    <h3 className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold tracking-widest text-text uppercase">
      {groupTitle(id, t, space)}
      <span className="font-normal tracking-normal text-text-dim normal-case">
        {t('travel.pilot.list.groupCount', { count })}
        {id === 'friendly' && ` · ${t('travel.pilot.list.friendlyNote')}`}
      </span>
    </h3>
  );
}

/** The system the list is read from: secondary, one tap to change, never waits for ESI. */
function HereControl({ here }: { here: HereSpace }) {
  const { t } = useTranslation();
  const { current, space } = here;
  const name = useSystemName(current.systemId);
  // The label already says it is the API's system; only a hand-picked one needs saying.
  const source = current.source === 'picked' ? t('travel.pilot.list.hereSetByYou') : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
      <span>
        {t(
          current.source === 'picked'
            ? 'travel.pilot.list.hereLabelPicked'
            : 'travel.pilot.list.hereLabel'
        )}
      </span>
      <SolarSystemPicker
        value={current.systemId}
        onChange={(systemId) => current.pick(systemId)}
        showSecurity
        ariaLabel={t('travel.pilot.list.hereChange', { system: name ?? '' })}
        triggerLabel={
          current.systemId === null ? (
            t('travel.pilot.list.hereUnset')
          ) : (
            <>
              {name ?? '…'}
              {space !== null && (
                <span className={cx('ml-1.5', SPACE_TEXT[space])}>
                  {t(`common.spaceOption.${space}`)}
                </span>
              )}
              {source !== null && <span className="ml-1.5 text-text-dim">{source}</span>}
            </>
          )
        }
        hint={t('travel.pilot.list.hereHint')}
        footer={(close) =>
          current.source === 'picked' && (
            <Button
              size="sm"
              onClick={() => {
                current.clearPick();
                close();
              }}
            >
              {t('jumpRange.useGameLocation')}
            </Button>
          )
        }
      />
    </div>
  );
}

function StandingCell({ row }: { row: PilotListRow }) {
  const { t } = useTranslation();
  const own = row.ownOrganization;
  const standing = row.standing;
  if (own === null && standing === null) {
    return <span className="text-text-dim">{t('travel.pilot.list.noContact')}</span>;
  }
  return (
    <span className="block space-y-0.5">
      {own !== null && (
        <span className="block text-text-dim">{t(`travel.pilot.list.own.${own}`)}</span>
      )}
      {standing !== null && (
        <span className="flex items-center gap-1.5">
          <PilotStandingTag standing={standing} />
          {standing.via !== 'character' && (
            <span className="text-[0.6875rem] text-text-dim">
              {t(`travel.pilot.list.via.${standing.via}`)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function SpaceCell({ row, space, now }: { row: PilotListRow; space: KillSpace; now: number }) {
  const { t } = useTranslation();
  if (row.kills.kind === 'loading') {
    return <span className="text-text-dim">{t('travel.pilot.list.stateLoading')}</span>;
  }
  if (row.kills.kind === 'unreachable') {
    return <span className="text-text-dim">{t('travel.pilot.list.stateUnreachable')}</span>;
  }
  if (row.kills.kind === 'skipped') return <span className="text-text-dim">—</span>;
  const { count, lastMs } = row.kills.summary.bySpace[space];
  const tone = ageTone(lastMs, now);
  return (
    <span className="block leading-tight">
      <span className={cx('block font-semibold', count > 0 ? SPACE_TEXT[space] : 'text-text-dim')}>
        {count}
      </span>
      <span className={cx('block text-[0.6875rem]', AGE_TEXT[tone])}>
        {lastMs === null ? '—' : formatAge(now - lastMs, t)}
      </span>
    </span>
  );
}

/** The Share button's progress; `manual` is a stored link the browser wouldn't let us copy (as the Appraisal's). */
type ShareState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'failed' }
  | { status: 'copied'; url: string }
  | { status: 'manual'; url: string };

/**
 * "Copy Share Link" for a pasted D-Scan: a labelled action (DESIGN.md §6c)
 * that sits in the status strip beside Clear. The stored-link field it may
 * need when the clipboard refuses opens on a line of its own.
 */
export function DscanShareControl({
  paste,
  characterId,
}: {
  paste: DscanPaste;
  /** Signs in to store a Share Link as this Character if no Firebase session exists yet; null disables Share. */
  characterId: number | null;
}) {
  const { t } = useTranslation();
  const [share, setShare] = useState<ShareState>({ status: 'idle' });
  const [sharedPaste, setSharedPaste] = useState(paste);
  if (paste !== sharedPaste) {
    setSharedPaste(paste);
    setShare({ status: 'idle' });
  }
  const snapshot = buildDscanSnapshot(paste.text);
  const tooLarge = !snapshot.ok && snapshot.reason === 'too-large';

  /** Stores the scan's raw text and copies its short `/share/<id>` link; the same scan shared again gets the same link. */
  async function handleShare() {
    if (!snapshot.ok || characterId === null || share.status === 'saving') return;
    const reuseKey = dscanSnapshotReuseKey(snapshot.value);
    let url = existingShareLink('dscan', reuseKey);
    if (url === null) {
      setShare({ status: 'saving' });
      try {
        url = await createShareLink({
          type: 'dscan',
          payload: snapshot.value,
          reuseKey,
          characterId,
        });
      } catch {
        setShare({ status: 'failed' });
        return;
      }
    }
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      setShare({ status: 'manual', url });
    }
  }

  async function handleCopyShareUrl(url: string) {
    try {
      await writeToClipboard(url);
      setShare({ status: 'copied', url });
    } catch {
      // Still on screen to copy by hand.
    }
  }

  const tooltip = tooLarge
    ? t('travel.pilot.dscan.shareTooLarge', { max: MAX_DSCAN_SNAPSHOT_CHARS.toLocaleString() })
    : share.status === 'saving'
      ? t('travel.pilot.dscan.shareSaving')
      : share.status === 'failed'
        ? t('travel.pilot.dscan.shareFailed')
        : share.status === 'copied'
          ? t('travel.pilot.dscan.shareCopied')
          : undefined;
  const button = (
    <Button
      size="sm"
      disabled={
        characterId === null || !isSyncConfigured() || !snapshot.ok || share.status === 'saving'
      }
      onClick={() => void handleShare()}
    >
      <span className="inline-flex items-center gap-1.5">
        {share.status === 'copied' ? <Icon.Done /> : <Icon.Share />}
        {t('travel.pilot.dscan.share')}
      </span>
    </Button>
  );

  return (
    <>
      {tooltip === undefined ? button : <Tooltip content={tooltip}>{button}</Tooltip>}
      {share.status === 'manual' && (
        <div className="flex w-full items-center gap-2">
          <label
            htmlFor="pilot-dscan-share-url"
            className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {t('travel.pilot.dscan.shareReady')}
          </label>
          <TextInput
            id="pilot-dscan-share-url"
            size="sm"
            readOnly
            value={share.url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 font-mono"
          />
          <Button size="sm" onClick={() => void handleCopyShareUrl(share.url)}>
            {t('travel.pilot.dscan.shareCopy')}
          </Button>
        </div>
      )}
    </>
  );
}
