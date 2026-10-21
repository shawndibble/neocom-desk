/**
 * The newest wars straight from ESI, for the few days after a war-declared
 * Alert: the open-wars list (`activeWars.ts`) is only rewritten twice a day, so
 * a pilot who has just been told of a declaration would otherwise wait for the
 * next sweep to see the banner. A new war is among the newest ids, so this
 * reads only those. Public reads, nothing signed.
 *
 * Never rejects: offline or refused reads come back as "none", and the next
 * call tries again.
 */
import { getWar, getWarIds } from '@/esi/endpoints';
import { parseEsiWar, type StoredWar } from '@/engine/wars';

/** About two days of declarations at about 26 a day. */
export const RECENT_WAR_IDS = 60;
export const RECENT_WARS_REREAD_MS = 30 * 60 * 1000;
const CONCURRENCY = 6;

let last: { at: number; wars: readonly StoredWar[] } | null = null;
let reading: Promise<void> | null = null;

async function readRecent(): Promise<void> {
  try {
    const ids = ((await getWarIds()).data ?? []).slice(0, RECENT_WAR_IDS);
    const wars: StoredWar[] = [];
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < ids.length; i = next++) {
        try {
          const war = parseEsiWar((await getWar(ids[i] as number)).data);
          if (war !== null) wars.push(war);
        } catch {
          // One war that will not read does not lose the rest.
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    last = { at: Date.now(), wars };
  } catch {
    // Offline or refused: keep what was last read.
  }
}

export async function loadRecentWars(): Promise<readonly StoredWar[]> {
  if (last === null || Date.now() - last.at >= RECENT_WARS_REREAD_MS) {
    // One read at a time: the Overview and the Corp page asking together share it.
    reading ??= readRecent().finally(() => {
      reading = null;
    });
    await reading;
  }
  return last?.wars ?? [];
}

/** Test seam: forget the last read. */
export function resetRecentWarsCache(): void {
  last = null;
  reading = null;
}
