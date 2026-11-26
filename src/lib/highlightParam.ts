export const HIGHLIGHT_PARAM = 'highlight';

export const OPEN_PARAM = 'open';

export function openHref(path: string, id: number | string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${OPEN_PARAM}=${encodeURIComponent(String(id))}`;
}

export function highlightHref(path: string, id: number | string): string {
  return `${path}?${HIGHLIGHT_PARAM}=${encodeURIComponent(String(id))}`;
}

export const MAIL_OWNER_PARAM = 'owner';

export function mailOpenHref(mailId: number, ownerId: number | null): string {
  const href = openHref('/mail', mailId);
  return ownerId === null ? href : `${href}&${MAIL_OWNER_PARAM}=${ownerId}`;
}
