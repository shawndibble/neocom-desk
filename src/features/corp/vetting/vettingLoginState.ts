/**
 * What a Vetting sign-in hands back to the page it was pressed on (`routes/Callback.tsx`), held
 * in this module's memory and nowhere else: never in router or `history.state`, `sessionStorage`
 * or `localStorage`, since the outcome carries an EVE access token. The callback puts it here,
 * the page takes it once and hands the token to the server. A reload after the redirect finds
 * nothing, and the pilot logs in again for that character. Types and one slot, no imports,
 * because the eager callback route loads this.
 */
export type VettingLoginOutcome =
  | { status: 'ok'; accessToken: string; characterId: number; name: string }
  | { status: 'cancelled' }
  | { status: 'failed' };

let held: VettingLoginOutcome | null = null;

/** The callback's side: keep the outcome for the page the redirect lands on. */
export function holdVettingLogin(outcome: VettingLoginOutcome): void {
  held = outcome;
}

/** The outcome waiting for a page, left in place; `dropVettingLogin` is what spends it. */
export function heldVettingLogin(): VettingLoginOutcome | null {
  return held;
}

/** Forgets `outcome` if it is still the one held, so a newer login is never dropped by an old page. */
export function dropVettingLogin(outcome: VettingLoginOutcome): void {
  if (held === outcome) held = null;
}
