import { getWar, getWarIds } from '@/esi/endpoints';
import { parseEsiWar, type StoredWar } from '@/engine/wars';

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
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    last = { at: Date.now(), wars };
  } catch {}
}

export async function loadRecentWars(): Promise<readonly StoredWar[]> {
  if (last === null || Date.now() - last.at >= RECENT_WARS_REREAD_MS) {
    reading ??= readRecent().finally(() => {
      reading = null;
    });
    await reading;
  }
  return last?.wars ?? [];
}

export function resetRecentWarsCache(): void {
  last = null;
  reading = null;
}
