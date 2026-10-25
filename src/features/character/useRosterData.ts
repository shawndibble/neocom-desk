import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { loadRosterSnapshot, type RosterEntry } from '@/features/character/roster';
import { rosterCoreMap, mergeRosterCore, type RosterCore } from '@/features/character/rosterView';
import { loadRosterAttention, type AttentionEntry } from '@/features/character/rosterAttention';

/**
 * The Characters page's cache-only roster + attention snapshots, plus the one
 * explicit "Refresh all" live pull — same "cache-first, one explicit button for
 * live" rule the PI alt-colonies view already follows.
 */
export function useRosterData(characters: readonly { characterId: number }[] | undefined) {
  const [rosterCore, setRosterCore] = useState<Map<number, RosterCore>>(new Map());
  const [attentionById, setAttentionById] = useState<Map<number, AttentionEntry>>(new Map());
  const [refreshingAll, setRefreshingAll] = useState(false);

  /** The one place a fresh roster snapshot becomes `rosterCore` — shared by the cache-only load effect and "Refresh all" so a future added field only needs adding to `rosterView.ts`'s `RosterCore`. */
  function applyRoster(roster: readonly RosterEntry[], now: number) {
    setRosterCore(rosterCoreMap(roster, now));
  }

  /** `applyRoster` for one character that just finished refreshing: merges into `rosterCore` rather than replacing it, so the rest of the roster keeps its rows. */
  function mergeRosterEntry(entry: RosterEntry, now: number) {
    setRosterCore((previous) => mergeRosterCore(previous, entry, now));
  }

  // Live over the cache rows the snapshot reads, not read once: a sync still
  // landing when the page opens (straight after a first login) would otherwise
  // leave every row "Unknown" until something else changed the characters.
  // `characters` is only the trigger: the snapshot reads them itself, and is empty with none.
  useEffect(() => {
    const subscription = liveQuery(() => loadRosterSnapshot()).subscribe({
      next: (roster) => setRosterCore(rosterCoreMap(roster, Date.now())),
      // Keeps the last snapshot shown, as the one-shot read did when it failed.
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, [characters]);

  // Mirrors the cache-only effect above, cache-only by default: manufacturing
  // running counts and PI attention across the whole roster.
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

  /** Live pull for every character, capped-speed. */
  async function refreshAll() {
    // `aria-disabled` keeps the button hoverable so its Tooltip stays readable
    // mid-refresh, but it still takes the click — so the guard lives here.
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
