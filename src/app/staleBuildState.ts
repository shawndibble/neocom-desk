let inFlight: Promise<boolean> | null = null;

export function isRecoveringFromStaleBuild(): boolean {
  return inFlight !== null;
}

export function staleBuildRecoveryOutcome(): Promise<boolean> | null {
  return inFlight;
}

export function setStaleBuildRecovery(attempt: Promise<boolean> | null): void {
  inFlight = attempt;
}
