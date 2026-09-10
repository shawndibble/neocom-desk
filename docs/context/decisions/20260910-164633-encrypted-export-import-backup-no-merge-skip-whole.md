# Scope decisions — Encrypted export/import backup — no merge, skip-whole-character on conflict (issue #789)

_Recorded 2026-09-10 · issue #789._

- **Import conflict policy is skip-whole-character, never merge.** A
  character already present on this device is left entirely untouched
  (token, Editable Data, everything) when importing a backup that also
  contains it; only characters new to the device are written, in full. This
  rules out `sync/merge.ts`'s per-field LWW logic for this feature —
  reconciling two devices' independent edits to the _same_ character's data
  is a different, harder problem than seeding a new device, and the ticket
  does not need it solved to fix the 20+-alt re-login pain it was filed for.
- **Export always bundles every character on the device — no subset
  picker.** The point of the file is to replace re-login for every alt at
  once; a picker adds a UI step that buys nothing for the common case and
  can be added later if a real need for partial exports shows up.
- **The backup file is a bearer-credential bundle, not an inert data
  export.** It carries refresh tokens, so Export panel copy states plainly
  that the password is the only protection and there is no recovery if it's
  lost — this is not a "just in case" caveat, it changes what the user
  should do with the file (treat it like a password manager export, not a
  CSV). See `docs/adr/0014-encrypted-device-backup-for-cross-device-setup.md`.
