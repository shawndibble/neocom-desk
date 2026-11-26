export function fillsBeforeHaul(hoursToFull: number | null, haulHours: number): boolean {
  return hoursToFull !== null && hoursToFull < haulHours;
}

export function colonyCountUnknown(
  read: { needsReauth?: boolean; fetchFailed?: boolean } | null | undefined
): boolean {
  return read?.needsReauth === true || read?.fetchFailed === true;
}
