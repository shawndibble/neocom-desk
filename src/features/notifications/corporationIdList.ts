export function isCorporationIdList(raw: unknown): raw is number[] {
  return Array.isArray(raw) && raw.every((id) => Number.isSafeInteger(id));
}
