import type { ApprovalKind, FinishSetupChain } from '@/engine/character/finishSetup';
import { isId, isRecord } from '@/engine/guards';
import { MINUTE_MS } from '@/lib/age';
import { createLocalSetting } from '@/lib/useLocalSetting';

const KEY = 'neocom.finishSetup';
const TTL_MS = 15 * MINUTE_MS;

export type FinishSetupSaved =
  | { stage: 'offer'; characterId: number; offeredAt?: number }
  | { stage: 'running'; chain: FinishSetupChain };

function write(saved: FinishSetupSaved): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...saved, createdAt: Date.now() }));
  } catch {}
}

export function offerFinishSetup(characterId: number): void {
  if (readFinishSetup()?.stage === 'running') return;
  write({ stage: 'offer', characterId });
}

export function saveFinishSetupChain(chain: FinishSetupChain): void {
  write({ stage: 'running', chain });
}

function isChain(raw: unknown): raw is FinishSetupChain {
  if (!isRecord(raw)) return false;
  return (
    isId(raw.characterId) &&
    typeof raw.name === 'string' &&
    Array.isArray(raw.items) &&
    raw.items.every((i) => isRecord(i) && (i.kind === 'moon' || i.kind === 'alerts')) &&
    typeof raw.index === 'number' &&
    isRecord(raw.results)
  );
}

export function readFinishSetup(): FinishSetupSaved | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const saved = JSON.parse(raw) as {
      stage?: unknown;
      characterId?: unknown;
      chain?: unknown;
      createdAt?: unknown;
    };
    const fresh = typeof saved.createdAt === 'number' && Date.now() - saved.createdAt <= TTL_MS;
    if (fresh && saved.stage === 'offer' && isId(saved.characterId)) {
      return {
        stage: 'offer',
        characterId: saved.characterId,
        offeredAt: saved.createdAt as number,
      };
    }
    if (fresh && saved.stage === 'running' && isChain(saved.chain)) {
      return { stage: 'running', chain: saved.chain };
    }
    sessionStorage.removeItem(KEY);
    return null;
  } catch {
    return null;
  }
}

export function clearFinishSetup(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

export type FinishSetupNotNow = Record<string, ApprovalKind[]>;

export function parseNotNow(raw: unknown): FinishSetupNotNow | null {
  if (!isRecord(raw)) return null;
  const out: FinishSetupNotNow = {};
  for (const [id, kinds] of Object.entries(raw)) {
    if (!isId(Number(id)) || !Array.isArray(kinds)) continue;
    out[id] = kinds.filter((k): k is ApprovalKind => k === 'moon' || k === 'alerts');
  }
  return out;
}

export const useFinishSetupNotNowStore = createLocalSetting<FinishSetupNotNow>({
  key: 'finishSetupNotNow',
  defaultValue: {},
  parse: parseNotNow,
});

export async function readNotNow(characterId: number): Promise<ApprovalKind[]> {
  const store = useFinishSetupNotNowStore.getState();
  if (!store.hydrated) await store.hydrate();
  return useFinishSetupNotNowStore.getState().value[characterId] ?? [];
}

export async function rememberNotNow(characterId: number, kinds: readonly ApprovalKind[]) {
  const before = await readNotNow(characterId);
  const value = useFinishSetupNotNowStore.getState().value;
  await useFinishSetupNotNowStore
    .getState()
    .setValue({ ...value, [characterId]: [...new Set([...before, ...kinds])] });
}
