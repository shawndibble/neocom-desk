/** A list of corporation ids, as `mutedSharedPopCorporations` stores (issue #6225). */
export function isCorporationIdList(raw: unknown): raw is number[] {
  return Array.isArray(raw) && raw.every((id) => Number.isSafeInteger(id));
}
