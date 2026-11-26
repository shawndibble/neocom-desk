export type JumpsAwayReason = 'noLocation' | 'noRoute';

export type JumpsAwayResult =
  { kind: 'known'; jumps: number } | { kind: 'unknown'; reason: JumpsAwayReason };
