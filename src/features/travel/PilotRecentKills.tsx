/**
 * Travel › Pilot Lookup's recent kills and losses (issue #2332): the newest
 * `PILOT_KILLMAIL_LIMIT` from zKillboard, each row expanding to the victim's
 * fit with Open in Fittings. A killmail is read only when its row expands.
 */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Caret, Spinner, TypeIcon } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { resolveNames } from '@/features/character/names';
import { FittingModuleList } from '@/features/fittings/FittingModuleList';
import { fittingEditLocation } from '@/features/fittings/fittingRoutes';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import {
  characterZkillUrl,
  fetchPilotKillmails,
  type KillmailDetail,
  type KillmailParty,
  type PilotKillmail,
  type PilotKillmailsResult,
} from '@/lib/zkillboard';
import { loadTypes } from '@/sde/loadSde';
import { loadKillmailFit, type KillmailFitResult } from './pilotKillmailFit';

type TypeLabel = (typeId: number) => string;
type Expanded = 'loading' | KillmailFitResult;

/** Every id a row's names come from: pilots, corporations and the system. */
function nameIds(detail: KillmailDetail): number[] {
  const ids: number[] = [];
  for (const party of [detail.victimParty, detail.finalBlow]) {
    if (party?.characterId != null) ids.push(party.characterId);
    if (party?.corporationId != null) ids.push(party.corporationId);
  }
  if (detail.systemId !== null) ids.push(detail.systemId);
  return ids;
}

export function PilotKillmailsSection({ characterId }: { characterId: number }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<PilotKillmailsResult | null>(null);
  const [expanded, setExpanded] = useState<ReadonlyMap<number, Expanded>>(new Map());
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [typeLabel, setTypeLabel] = useState<TypeLabel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPilotKillmails(characterId).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    let cancelled = false;
    void loadTypes()
      .then((types) => {
        if (!cancelled) setTypeLabel(() => (id: number) => types[String(id)]?.name ?? `#${id}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = result?.ok ? result.entries : [];
  const detailOf = (entry: PilotKillmail): KillmailDetail | null => {
    const read = expanded.get(entry.killmailId);
    return (
      entry.detail ?? (read !== undefined && read !== 'loading' && read.ok ? read.detail : null)
    );
  };
  const idKey = [
    ...new Set(entries.flatMap((entry) => nameIds(detailOf(entry) ?? EMPTY_DETAIL))),
  ].join(',');

  useEffect(() => {
    if (idKey === '') return;
    let cancelled = false;
    void resolveNames(idKey.split(',').map(Number))
      .then((resolved) => {
        if (!cancelled) setNames(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  function toggle(entry: PilotKillmail) {
    const id = entry.killmailId;
    const next = new Set(open);
    if (next.has(id)) {
      next.delete(id);
      setOpen(next);
      return;
    }
    next.add(id);
    setOpen(next);
    // A read that already landed (or is landing) is kept, so collapsing and re-expanding never refetches.
    const prior = expanded.get(id);
    if (prior === 'loading' || prior?.ok) return;
    setExpanded((current) => new Map(current).set(id, 'loading'));
    void loadKillmailFit(entry).then((read) =>
      setExpanded((current) => new Map(current).set(id, read))
    );
  }

  const title = t('travel.pilot.recent.title');
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">{title}</h3>
        <a
          href={characterZkillUrl(characterId)}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(inlineLinkClassName, 'text-xs')}
        >
          {t('travel.pilot.recent.more')}
        </a>
      </div>
      {result === null ? (
        <p role="status" className="text-xs text-text-dim">
          {t('travel.pilot.recent.loading')}
        </p>
      ) : !result.ok ? (
        <p role="status" className="text-xs text-warning">
          {t('travel.pilot.recent.failed')}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-text-dim">{t('travel.pilot.recent.empty')}</p>
      ) : (
        <ul aria-label={title} className="divide-y divide-line border border-line">
          {entries.map((entry) => (
            <KillmailRow
              key={entry.killmailId}
              entry={entry}
              detail={detailOf(entry)}
              names={names}
              typeLabel={typeLabel}
              isOpen={open.has(entry.killmailId)}
              read={expanded.get(entry.killmailId)}
              onToggle={() => toggle(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const EMPTY_DETAIL: KillmailDetail = {
  time: null,
  systemId: null,
  victim: { ship_type_id: 0 },
  victimParty: { characterId: null, corporationId: null, shipTypeId: null },
  finalBlow: null,
};

interface KillmailRowProps {
  entry: PilotKillmail;
  detail: KillmailDetail | null;
  names: ReadonlyMap<number, string>;
  typeLabel: TypeLabel | null;
  isOpen: boolean;
  read: Expanded | undefined;
  onToggle: () => void;
}

function KillmailRow({
  entry,
  detail,
  names,
  typeLabel,
  isOpen,
  read,
  onToggle,
}: KillmailRowProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const panelId = useId();
  const dash = '—';

  // A pilot's name, else their corporation's, else (an NPC) the ship they flew.
  function partyName(party: KillmailParty | null): string {
    if (party === null) return dash;
    const byId = (id: number | null) => (id === null ? undefined : names.get(id));
    return (
      byId(party.characterId) ??
      byId(party.corporationId) ??
      (party.shipTypeId !== null && typeLabel !== null ? typeLabel(party.shipTypeId) : dash)
    );
  }

  const shipTypeId = detail?.victim.ship_type_id ?? null;
  const other =
    detail === null ? null : entry.side === 'kill' ? detail.victimParty : detail.finalBlow;
  const time = detail?.time ? new Date(detail.time) : null;

  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={onToggle}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 text-left text-sm hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-0"
      >
        <Caret expanded={isOpen} />
        <span
          className={cx(
            'w-10 text-xs font-semibold uppercase',
            entry.side === 'kill' ? 'text-success' : 'text-danger'
          )}
        >
          {t(entry.side === 'kill' ? 'travel.pilot.recent.kill' : 'travel.pilot.recent.loss')}
        </span>
        <span className="text-xs text-text-dim tabular-nums">
          {time === null || Number.isNaN(time.getTime()) ? dash : formatTimestamp(time, timeZone)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          {shipTypeId !== null && <TypeIcon typeId={shipTypeId} size={32} width={20} height={20} />}
          <span className="text-text">
            {shipTypeId === null || typeLabel === null ? dash : typeLabel(shipTypeId)}
          </span>
        </span>
        <span className="text-text-dim">
          {detail?.systemId == null ? dash : (names.get(detail.systemId) ?? `#${detail.systemId}`)}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-text-dim">
            {t(
              entry.side === 'kill' ? 'travel.pilot.recent.victim' : 'travel.pilot.recent.finalBlow'
            )}{' '}
          </span>
          <span className="text-text">{partyName(other)}</span>
        </span>
        <span className="text-text tabular-nums">
          {entry.value === null ? dash : formatIskCompact(entry.value)}
        </span>
      </button>
      {isOpen && (
        <div id={panelId} className="border-t border-line bg-panel-2 px-3 py-2">
          <KillmailFit read={read} typeLabel={typeLabel} />
        </div>
      )}
    </li>
  );
}

function KillmailFit({
  read,
  typeLabel,
}: {
  read: Expanded | undefined;
  typeLabel: TypeLabel | null;
}) {
  const { t } = useTranslation();
  if (read === undefined || read === 'loading' || typeLabel === null) {
    return <Spinner size="sm" delayMs={200} label={t('travel.pilot.recent.fitLoading')} />;
  }
  if (!read.ok) {
    return (
      <p role="status" className="text-xs text-warning">
        {t('travel.pilot.recent.fitFailed')}
      </p>
    );
  }
  if (read.fitting === null) {
    return <p className="text-xs text-text-dim">{t('travel.pilot.recent.noFit')}</p>;
  }
  return <FitView fitting={read.fitting} typeLabel={typeLabel} />;
}

function FitView({ fitting, typeLabel }: { fitting: Fitting; typeLabel: TypeLabel }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openInFittings() {
    setBusy(true);
    setFailed(false);
    try {
      const encoded = await encodeFittingShare(fittingToShareInput(fitting));
      if (encoded.ok) navigate(fittingEditLocation(encoded.payload));
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const isEmpty =
    fitting.modules.length === 0 && fitting.drones.length === 0 && fitting.cargo.length === 0;
  return (
    <div className="space-y-2">
      {isEmpty ? (
        <p className="text-xs text-text-dim">{t('travel.pilot.recent.emptyFit')}</p>
      ) : (
        <FittingModuleList fitting={fitting} typeName={typeLabel} />
      )}
      <Button size="sm" disabled={busy} onClick={() => void openInFittings()}>
        {t('travel.pilot.recent.openInFittings')}
      </Button>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t('travel.pilot.recent.openFailed')}
        </p>
      )}
    </div>
  );
}
