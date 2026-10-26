/**
 * Reads the lawless (insurgency) systems list (issue #2870): CCP's endpoint
 * blocks browser origins, so the app never calls it directly. The lawless-systems
 * GitHub Actions job publishes it to R2 (`lawless-systems/systems.json`, plain
 * fetch, no Firebase session).
 *
 * Never rejects: a failed read or a stale or missing snapshot comes back as
 * "none lawless" — the badge hides quietly.
 */
import { freshLawlessSystems, parseFreshLawless } from '@/engine/route/lawless';

export const LAWLESS_R2_URL = 'https://data.neocomdesk.com/lawless-systems/systems.json';
const R2_READ_TIMEOUT_MS = 20_000;
/** The job runs every 15 minutes: reading it more often only costs reads. */
const REREAD_AFTER_MS = 5 * 60 * 1000;

let lastRead: { at: number; data: unknown } | null = null;
let reading: Promise<void> | null = null;

/** The R2 copy, or null when it is missing, malformed, stale or cannot be fetched. */
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
  // A miss is remembered too, so remounts do not refetch R2 every time; the last good read
  // (if any) is kept and ages out.
  lastRead = { at: Date.now(), data: (await readR2()) ?? lastRead?.data ?? null };
}

/** The `useLawlessSystems` poll: the same as `REREAD_AFTER_MS`, so each tick refetches. */
export const LAWLESS_POLL_MS = REREAD_AFTER_MS;

export async function loadLawlessSystems(): Promise<ReadonlySet<number>> {
  if (lastRead === null || Date.now() - lastRead.at >= REREAD_AFTER_MS) {
    // One read at a time: the page and a modal asking together share it.
    reading ??= readList().finally(() => {
      reading = null;
    });
    await reading;
  }
  return freshLawlessSystems(lastRead?.data, Date.now());
}

/** Test seam: forget the last read. */
export function resetLawlessSystemsCache(): void {
  lastRead = null;
  reading = null;
}
