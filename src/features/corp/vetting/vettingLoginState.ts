export type VettingLoginOutcome =
  | { status: 'ok'; accessToken: string; characterId: number; name: string }
  | { status: 'cancelled' }
  | { status: 'failed' };

let held: VettingLoginOutcome | null = null;

export function holdVettingLogin(outcome: VettingLoginOutcome): void {
  held = outcome;
}

export function heldVettingLogin(): VettingLoginOutcome | null {
  return held;
}

export function dropVettingLogin(outcome: VettingLoginOutcome): void {
  if (held === outcome) held = null;
}
