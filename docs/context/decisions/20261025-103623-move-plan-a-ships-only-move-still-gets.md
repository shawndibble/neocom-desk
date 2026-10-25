# Scope decisions — Move plan: a ships-only move still gets a route

_Recorded 2026-10-25._

- **<Decision>.** <Why, and what it rules out.>

- **Show my route no longer needs a hauler.** A move of only assembled ships (no cargo, so no hauler is suggested) still opens a route, as does any plan whose cargo no hull can carry but which has ships to fly.
- **A flown ship is a flight of two legs: take it at its pickup, fly it to the destination.** Each ship is a trip of its own (one pilot, one hull at a time), flown after the cargo trips, nearest pickup first from where the last one landed. Flight legs carry `ships` instead of a volume and show no hold. This supersedes "flown ships are noted, never routed"; only a ship at a place with no solar system stays a note.
