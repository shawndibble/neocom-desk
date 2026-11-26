import { useEffect, useMemo, useRef, useState } from 'react';
import type { PayeeRecord } from '@/db';
import { planBookAutoAssign } from '@/engine/miningTax/bookAutoAssign';
import { defaultOptOutKey } from '@/engine/miningTax/defaultSystems';
import { useDefaultOptOuts } from '../defaultOptOuts';
import type { MoonMiningTaxRow } from '../snapshot';
import { applyBookAutoAssign, type BookAutoAssignTarget } from './bookAutoAssign';
import type { CorpBookView } from './corpBookView';

export function bookAutoAssignTargets(view: CorpBookView): BookAutoAssignTarget[] {
  return view.books.map(({ loaded, corpName }) => ({
    corporationId: loaded.corporationId,
    corpName,
    characterIds: loaded.characterIds,
    memberCharacterIds: loaded.memberCharacterIds,
    startDate: loaded.startDate,
    graceHours: loaded.graceHours,
    ...(loaded.lastSyncedAt !== undefined ? { lastSyncedAt: loaded.lastSyncedAt } : {}),
    rates: loaded.rates,
    miners: loaded.miners,
    observed: loaded.observed,
    ...(loaded.structureNames ? { structureNames: loaded.structureNames } : {}),
    hubId: loaded.hubId,
  }));
}

export function useBookAutoAssign(
  view: CorpBookView | null,
  rows: readonly MoonMiningTaxRow[] | undefined,
  payees: readonly PayeeRecord[],
  onAssigned?: () => void
): void {
  const tried = useRef(new Set<string>());
  const running = useRef(false);
  const missed = useRef(false);
  const [pass, setPass] = useState(0);
  const optOutList = useDefaultOptOuts((s) => s.value);
  const optedOut = useMemo(() => new Set(optOutList), [optOutList]);

  useEffect(() => {
    if (!view || !rows) return;
    if (running.current) {
      missed.current = true;
      return;
    }
    const books = bookAutoAssignTargets(view);
    const entries = rows.map((r) => r.entry);
    const now = new Date().toISOString();
    const planned = planBookAutoAssign({
      entries,
      assignments: rows.flatMap((r) => r.assignments),
      books,
      payees,
      optedOut,
      now,
    });
    const keys = planned
      .map((s) => defaultOptOutKey(s.characterId, s.date, s.solarSystemId))
      .filter((k) => !tried.current.has(k));
    if (keys.length === 0) return;
    for (const k of keys) tried.current.add(k);
    const forget = () => {
      for (const k of keys) tried.current.delete(k);
    };
    const wanted = new Set(keys);
    running.current = true;
    void applyBookAutoAssign(
      books,
      entries.filter((e) => wanted.has(defaultOptOutKey(e.characterId, e.date, e.solarSystemId))),
      now
    )
      .then(({ ready, created }) => {
        if (!ready) forget();
        const done = new Set(
          created.map((a) => defaultOptOutKey(a.characterId, a.date, a.solarSystemId))
        );
        for (const k of keys) if (!done.has(k)) tried.current.delete(k);
        if (created.length > 0) onAssigned?.();
      })
      .catch(forget)
      .finally(() => {
        running.current = false;
        if (!missed.current) return;
        missed.current = false;
        setPass((n) => n + 1);
      });
  }, [view, rows, payees, onAssigned, pass, optedOut]);
}
