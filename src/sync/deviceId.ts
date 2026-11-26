const KEY = 'neocom.deviceId';

function mintId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = mintId();
  localStorage.setItem(KEY, id);
  return id;
}
