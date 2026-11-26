import { PENDING_TTL_MS } from './session';

const KEY = 'neocom.loginReturnTo';

interface Stashed {
  path: string;
  createdAt: number;
}

export function setLoginReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, createdAt: Date.now() } satisfies Stashed));
  } catch {}
}

export function usableLoginReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/^\/(login|callback)(?:[/?#]|$)/.test(value)) return null;
  return value;
}

export function takeLoginReturnTo(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<Stashed>;
    if (typeof parsed.path !== 'string' || typeof parsed.createdAt !== 'number') return null;
    if (Date.now() - parsed.createdAt > PENDING_TTL_MS) return null;
    return parsed.path;
  } catch {
    return null;
  }
}

export function clearLoginReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
