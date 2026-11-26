export type EntityInfoKind =
  'character' | 'corporation' | 'alliance' | 'faction' | 'skill' | 'type' | 'place';

export interface EntityInfoTarget {
  kind: EntityInfoKind;
  id: number;
  itemId?: number;
}

const ENTITY_INFO_PARAM = 'info';
const INFO_TAB_PARAM = 'infoTab';
const INFO_TAB_PATTERN = /^[a-z]+$/;

const INFO_PATTERN = /^(character|corporation|alliance|faction|skill|type|place)-(\d+)(?:-(\d+))?$/;

function positiveId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function formatEntityInfo({ kind, id, itemId }: EntityInfoTarget): string {
  return kind === 'type' && itemId !== undefined ? `${kind}-${id}-${itemId}` : `${kind}-${id}`;
}

export function parseEntityInfo(search: string): EntityInfoTarget | null {
  const raw = new URLSearchParams(search).get(ENTITY_INFO_PARAM);
  const match = raw === null ? null : INFO_PATTERN.exec(raw);
  if (!match) return null;
  const kind = match[1] as EntityInfoKind;
  const id = positiveId(match[2]!);
  if (id === null) return null;
  if (match[3] === undefined) return { kind, id };
  const itemId = kind === 'type' ? positiveId(match[3]) : null;
  return itemId === null ? null : { kind, id, itemId };
}

export function entityInfoHref(
  location: { pathname: string; search: string },
  target: EntityInfoTarget
): string {
  const params = new URLSearchParams(location.search);
  params.set(ENTITY_INFO_PARAM, formatEntityInfo(target));
  params.delete(INFO_TAB_PARAM);
  return `${location.pathname}?${params.toString()}`;
}

export function withoutEntityInfo(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(ENTITY_INFO_PARAM);
  params.delete(INFO_TAB_PARAM);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

export function parseInfoTab(search: string): string | null {
  const raw = new URLSearchParams(search).get(INFO_TAB_PARAM);
  return raw !== null && INFO_TAB_PATTERN.test(raw) ? raw : null;
}

export function infoTabHref(
  location: { pathname: string; search: string },
  tab: string | null
): string {
  const params = new URLSearchParams(location.search);
  if (tab === null) params.delete(INFO_TAB_PARAM);
  else params.set(INFO_TAB_PARAM, tab);
  const rest = params.toString();
  return rest === '' ? location.pathname : `${location.pathname}?${rest}`;
}
