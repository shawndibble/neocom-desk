import { freshLawlessSystems, parseFreshLawless } from '@/engine/route/lawless';

export const LAWLESS_R2_URL = 'https://data.neocomdesk.com/lawless-systems/systems.json';
const R2_READ_TIMEOUT_MS = 20_000;
const REREAD_AFTER_MS = 5 * 60 * 1000;

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

async function readR2(): Promise<unknown> {
  try {
    const res = await fetch(LAWLESS_R2_URL, { signal: AbortSignal.timeout(R2_READ_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return parseFreshLawless(body, Date.now()) !== null ? body : null;
  } catch {
    return null;
  }
}

async function readList(): Promise<void> {
  lastRead = { at: Date.now(), data: (await readR2()) ?? lastRead?.data ?? null };
}

export const LAWLESS_POLL_MS = REREAD_AFTER_MS;

export async function loadLawlessSystems(): Promise<ReadonlySet<number>> {
  if (lastRead === null || Date.now() - lastRead.at >= REREAD_AFTER_MS) {
    reading ??= readList().finally(() => {
      reading = null;
    });
    await reading;
  }
  return freshLawlessSystems(lastRead?.data, Date.now());
}

export function resetLawlessSystemsCache(): void {
  lastRead = null;
  reading = null;
}
