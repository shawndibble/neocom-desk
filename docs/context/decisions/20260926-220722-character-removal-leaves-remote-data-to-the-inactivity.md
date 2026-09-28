# Scope decisions — Character removal leaves remote data to the inactivity purge (issue #2066)

_Recorded 2026-09-26 · issue #2066._

- **Removing a Character clears local Dexie data only.** Its synced Editable
  Data stays in Firestore and is deleted by the `purgeStaleAccounts` inactivity
  purge (issue #2065) once no device has synced it for 90 days. Supersedes the
  "which also deletes the Character's synced data" wording in the "Log out of
  this device" decision (`20260925-084119-…`) and the "client's purge on
  Character removal stays for now" line in the 90-day decision
  (`20260926-214853-…`), and the "deletion promise is stated with its caveat"
  bullet in the What We Store decision (`20260907-205018-…`).
- **Removal pushes first.** Removing one Character runs a last best-effort
  push (as "Log out of this device" already did), since the synced copy is
  what re-adding restores. Immediate server deletion is by request only
  (the public Delete Your Data page).
- **Re-adding a removed Character restores it from sync.** The pull cursors
  and tombstones go with the local rows, so the next sync pulls everything
  back.
- **No pending-purge machinery.** The client-side remote purge
  (`sync/characterPurge.ts`), its `remotePurgePending.<id>` marker and the
  retry in `syncCharacter` are removed. Markers already on a device are inert
  and left in place.
- **Owner change is unchanged.** A sold Character's local wipe
  (`planSync.handleOwnerHashChange`) is a different case and stays as is.
