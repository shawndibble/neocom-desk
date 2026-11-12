/**
 * "Finish setting up {character}" state (issue #6103). The step in flight lives
 * in sessionStorage like the Alerts walk's queue: it survives EVE's redirect
 * between approvals, expires with a Pending Login's bound, and is cleared on
 * Not now, on close and when the step is done. The player's Not now answers are
 * a device-local setting, per Character and per approval.
 */
import type { ApprovalKind, FinishSetupChain } from '@/engine/character/finishSetup';
import { MINUTE_MS } from '@/lib/age';
import { createLocalSetting } from '@/lib/useLocalSetting';

const KEY = 'neocom.finishSetup';
/** Same bound as a Pending Login: the step outlives no login that could still complete. */
const TTL_MS = 15 * MINUTE_MS;

/** `offer`: a sign-in just landed, the step is still to be worked out. `running`: Continue was pressed. */
export type FinishSetupSaved =
  { stage: 'offer'; characterId: number } | { stage: 'running'; chain: FinishSetupChain };

function write(saved: FinishSetupSaved): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...saved, createdAt: Date.now() }));
  } catch {
    // No storage: the step is not offered; every approval stays available where it lives.
  }
}

/** A sign-in for this Character landed: offer its remaining approvals on the next page. */
export function offerFinishSetup(characterId: number): void {
  write({ stage: 'offer', characterId });
}

export function saveFinishSetupChain(chain: FinishSetupChain): void {
  write({ stage: 'running', chain });
}

const isId = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

function isChain(raw: unknown): raw is FinishSetupChain {
  const c = raw as Partial<FinishSetupChain> | null;
  return (
    typeof c === 'object' &&
    c !== null &&
    isId(c.characterId) &&
    typeof c.name === 'string' &&
    Array.isArray(c.items) &&
    c.items.every((i: { kind?: unknown }) => i?.kind === 'moon' || i?.kind === 'alerts') &&
    typeof c.index === 'number' &&
    typeof c.results === 'object' &&
    c.results !== null
  );
}

/** The step in flight, or null when absent, expired or malformed (which also clears it). */
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
      return { stage: 'offer', characterId: saved.characterId };
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
  } catch {
    // Nothing stored that could reopen the step.
  }
}

/** Not now, per Character (the key) and per approval. */
export type FinishSetupNotNow = Record<string, ApprovalKind[]>;

export function parseNotNow(raw: unknown): FinishSetupNotNow | null {
  if (typeof raw !== 'object' || raw === null) return null;
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
