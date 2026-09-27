# Scope decisions — Removing a Character deletes its Production Log rows locally (issue #2053)

_Recorded 2026-09-26 · issue #2053._

- **Removing a Character deletes its Production Runs, sale links and order watches from this device**, like every other synced collection. Keeping them was only an artefact of `removeCharacter` predating the registry's purge rule (#2043), not a decision: the FAQ and the "Log out of this device" decision already say a Character's local rows go, the remote purge and owner-change wipe already delete them, and leftover rows would sync back up under the Character if re-added. Deleting a Build Plan still keeps its runs; that is a different action.
