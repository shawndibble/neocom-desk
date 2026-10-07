/**
 * The `info` search param: which entity's Show Info (or Skill) modal a URL
 * has open — `?info=character-<id>`, `corporation-<id>`, `alliance-<id>` or
 * `skill-<typeId>` or `type-<typeId>` (an item's Item Detail). It rides on the *current* location, so a link to an
 * entity is a real, shareable `<a href>` that opens the modal over whatever
 * page the pilot is on (DESIGN.md §6c "Entities").
 *
 * Pure: no router, DOM or store imports.
 */

export type EntityInfoKind = 'character' | 'corporation' | 'alliance' | 'skill' | 'type';

export interface EntityInfoTarget {
  kind: EntityInfoKind;
  id: number;
}

export const ENTITY_INFO_PARAM = 'info';

const INFO_PATTERN = /^(character|corporation|alliance|skill|type)-(\d+)$/;

export function formatEntityInfo({ kind, id }: EntityInfoTarget): string {
  return `${kind}-${id}`;
}

/** The entity a search string opens, or null when `info` is absent or unreadable. */
export function parseEntityInfo(search: string): EntityInfoTarget | null {
  const raw = new URLSearchParams(search).get(ENTITY_INFO_PARAM);
  const match = raw === null ? null : INFO_PATTERN.exec(raw);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind: match[1] as EntityInfoKind, id };
}

/** `pathname + search` with `info` set to `target`, every other param kept. */
export function entityInfoHref(
  location: { pathname: string; search: string },
  target: EntityInfoTarget
): string {
  const params = new URLSearchParams(location.search);
  params.set(ENTITY_INFO_PARAM, formatEntityInfo(target));
  return `${location.pathname}?${params.toString()}`;
}

/** The search string with `info` removed (`''` or `'?a=b'`). */
export function withoutEntityInfo(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(ENTITY_INFO_PARAM);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}
