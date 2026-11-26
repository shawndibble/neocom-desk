import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { loadRosterSnapshot, type RosterEntry } from '@/features/character/roster';
import { rosterCoreMap, mergeRosterCore, type RosterCore } from '@/features/character/rosterView';
import { loadRosterAttention, type AttentionEntry } from '@/features/character/rosterAttention';

export function useRosterData(characters: readonly { characterId: number }[] | undefined) {
  const [rosterCore, setRosterCore] = useState<Map<number, RosterCore>>(new Map());
  const [attentionById, setAttentionById] = useState<Map<number, AttentionEntry>>(new Map());
  const [refreshingAll, setRefreshingAll] = useState(false);

  function applyRoster(roster: readonly RosterEntry[], now: number) {
    setRosterCore(rosterCoreMap(roster, now));
  }

  function mergeRosterEntry(entry: RosterEntry, now: number) {
    setRosterCore((previous) => mergeRosterCore(previous, entry, now));
  }

  useEffect(() => {
    const subscription = liveQuery(() => loadRosterSnapshot()).subscribe({
      next: (roster) => setRosterCore(rosterCoreMap(roster, Date.now())),
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) setAttentionById(new Map());
        return;
      }
      const attention = await loadRosterAttention();
      if (cancelled) return;
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

  async function refreshAll() {
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      const now = Date.now();
      const [roster, attention] = await Promise.all([
        loadRosterSnapshot({ live: true, now, onEntry: (entry) => mergeRosterEntry(entry, now) }),
        loadRosterAttention({ live: true }),
      ]);
      applyRoster(roster, now);
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
    } finally {
      setRefreshingAll(false);
    }
  }

  return { rosterCore, attentionById, refreshingAll, refreshAll };
}
