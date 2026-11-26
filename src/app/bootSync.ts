import { BOOT_IDLE_TIMEOUT_MS, scheduleIdle } from '@/lib/scheduleIdle';

export const BOOT_SYNC_IDLE_TIMEOUT_MS = BOOT_IDLE_TIMEOUT_MS;

export function scheduleBootSync(
  characterId: number,
  sync: (characterId: number) => void
): () => void {
  let cancelled = false;
  const start = () => {
    if (!cancelled) sync(characterId);
  };
  const cancelWait = scheduleIdle(start, BOOT_SYNC_IDLE_TIMEOUT_MS);
  return () => {
    cancelled = true;
    cancelWait();
  };
}
