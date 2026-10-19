/**
 * Colony fill-time gates shared by every PI surface.
 */

/** The colony fills before the pilot's own haul cadence brings them back — the one threshold every fill-time surface gates on (see `colonyThroughput.ts` for why). */
export function fillsBeforeHaul(hoursToFull: number | null, haulHours: number): boolean {
  return hoursToFull !== null && hoursToFull < haulHours;
}

/**
 * The colony list could not be read, so the count is unknown, not zero: a
 * re-login is needed (403) or ESI did not answer with nothing cached. Every PI
 * surface words "no colonies" only when this is false.
 */
export function colonyCountUnknown(
  read: { needsReauth?: boolean; fetchFailed?: boolean } | null | undefined
): boolean {
  return read?.needsReauth === true || read?.fetchFailed === true;
}
