/**
 * Pledge writes in flight from the Request panel. A write goes out under the
 * Firebase session of its Character; the background delivery sweep signs in
 * as each Character in turn, which would swap that session under the write.
 * The sweep checks `pledgeWritesInFlight` and leaves the other Characters for
 * its next run.
 */
let inFlight = 0;

export const pledgeWritesInFlight = () => inFlight;

/** Runs `write`, counted as in flight until it settles. */
export async function trackPledgeWrite<T>(write: () => Promise<T>): Promise<T> {
  inFlight += 1;
  try {
    return await write();
  } finally {
    inFlight -= 1;
  }
}
