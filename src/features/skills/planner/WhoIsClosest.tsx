import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterAvatar, Disclosure } from '@/components/ui';
import type { PlanTimingUnavailableReason } from '@/engine/skills/planTimeToFinish';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import type { CharacterRecord } from '@/db';
import { formatCountdown } from '@/lib/duration';
import { formatCompactNumber } from '@/lib/compactNumber';
import { useClosestCharacters } from './useClosestCharacters';

/** Rows shown before "Show N more". */
const VISIBLE_ROWS = 5;
/** A roster this size or smaller loads on mount; a bigger one waits to be opened. */
export const CLOSEST_AUTO_LOAD_MAX = 5;

interface WhoIsClosestProps {
  roster: readonly CharacterRecord[];
  ownerId: number;
  entries: readonly PlanEntry[];
  skills: ReadonlyMap<number, EngineSkill>;
}

/**
 * Every roster Character ranked by time to finish the open plan. Display
 * only. Characters with the whole plan and Characters who cannot be timed
 * collapse into one line each, so neither reads as a row of zeros.
 */
export function WhoIsClosest({ roster, ownerId, entries, skills }: WhoIsClosestProps) {
  const { t } = useTranslation();
  const onDemand = roster.length > CLOSEST_AUTO_LOAD_MAX;
  const [open, setOpen] = useState(false);
  const enabled = !onDemand || open;
  const ids = roster.map((c) => c.characterId);
  const { ranking, loaded, total } = useClosestCharacters(ids, entries, skills, enabled);

  const nameOf = (id: number) => roster.find((c) => c.characterId === id)?.name ?? String(id);
  const body = (
    <ClosestBody
      ranking={ranking}
      loaded={loaded}
      total={total}
      ownerId={ownerId}
      nameOf={nameOf}
    />
  );

  if (!onDemand) return body;
  return (
    <Disclosure
      label={t('plans.closest.titleCount', { count: roster.length })}
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <div className="p-3">{body}</div>
    </Disclosure>
  );
}

interface ClosestBodyProps {
  ranking: ReturnType<typeof useClosestCharacters>['ranking'];
  loaded: number;
  total: number;
  ownerId: number;
  nameOf: (id: number) => string;
}

function ClosestBody({ ranking, loaded, total, ownerId, nameOf }: ClosestBodyProps) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const shown = ranking.rows.slice(0, VISIBLE_ROWS);
  const more = ranking.rows.slice(VISIBLE_ROWS);

  const row = (r: (typeof ranking.rows)[number]) => (
    <li key={r.characterId} className="flex items-center gap-2 py-1 text-xs">
      <CharacterAvatar characterId={r.characterId} size="sm" loading="lazy" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-text">{nameOf(r.characterId)}</div>
        {r.characterId === ownerId && (
          <div className="text-[0.6875rem] text-text-dim">{t('plans.closest.owner')}</div>
        )}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="text-text">{formatCountdown(r.seconds)}</div>
        <div className="text-[0.6875rem] text-text-dim">
          {t('plans.closest.sp', { sp: formatCompactNumber(r.remainingSp) })}
        </div>
      </div>
    </li>
  );

  return (
    <div className="space-y-1 text-xs">
      {loaded < total && (
        <p className="text-text-dim" role="status">
          {t('plans.closest.progress', { loaded, total })}
        </p>
      )}
      {ranking.complete.length > 0 && (
        <NamesLine
          label={t('plans.closest.complete', { count: ranking.complete.length })}
          items={ranking.complete.map((id) => ({ id, text: nameOf(id) }))}
        />
      )}
      <ul className="divide-y divide-line">
        {shown.map(row)}
        {showAll && (
          <li className="max-h-60 overflow-y-auto">
            <ul className="divide-y divide-line">{more.map(row)}</ul>
          </li>
        )}
      </ul>
      {more.length > 0 && !showAll && (
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => setShowAll(true)}
        >
          {t('plans.closest.showMore', { count: more.length })}
        </button>
      )}
      {ranking.unavailable.length > 0 && (
        <NamesLine
          label={t('plans.closest.unavailable', { count: ranking.unavailable.length })}
          items={ranking.unavailable.map(({ characterId, reason }) => ({
            id: characterId,
            text: `${nameOf(characterId)} — ${reasonText(t, reason)}`,
          }))}
        />
      )}
    </div>
  );
}

function reasonText(t: (key: string) => string, reason: PlanTimingUnavailableReason): string {
  return t(`plans.closest.reason.${reason}`);
}

/** One summary line that expands to the names behind it. */
function NamesLine({
  label,
  items,
}: {
  label: string;
  items: readonly { id: number; text: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        className="text-text-dim hover:text-text hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {label}
      </button>
      {expanded && (
        <ul className="mt-1 space-y-0.5 text-text-dim">
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
