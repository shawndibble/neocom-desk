# 0014 — Encrypted device backup for cross-device character setup

## Status

Accepted (2026-09-10)

## Context

ADR 0001 keeps refresh tokens device-only by design: no server ever holds a
character's EVE credentials. The accepted cost was that a new device requires
re-running EVE SSO for every character. That is fine at one or two characters,
but painful at 20+ alts — the exact case issue #789 was filed against.

Editable Data already syncs across devices via Firestore (see ADR 0001's
"Firebase backend exists solely to sync editable data"), but that sync itself
requires being signed in first, so it cannot bootstrap a new device on its
own.

## Decision

A client-side, no-backend-involvement encrypted backup file
(`src/backup/crypto.ts`, `src/backup/payload.ts`, `src/backup/io.ts`), reached
from Settings' Data tab:

- **Export**: always every character on the device, no picker. A password
  derives an AES-256-GCM key via PBKDF2-SHA256 (600,000 iterations,
  WebCrypto). The encrypted JSON bundle contains each character's record, its
  refresh/access tokens, its Editable Data
  (`sync/characterPurge.ts`'s `REMOTE_COLLECTIONS`), and its synced settings
  (`sync/syncedSettings.ts`'s `SYNCED_SETTING_KEYS` allow-list). `esiCache`
  and `notificationFeed` are excluded — both are already excluded from
  `REMOTE_COLLECTIONS` for the same reasons (API-derived, device-local).
- **Import**: decrypts the file and partitions by `characterId` — a character
  already present on this device is skipped whole (token and data untouched,
  no merge); a new character is written in full. This is deliberately not a
  data-merge operation; `sync/merge.ts`'s LWW logic does not apply here.
  `sync.`-prefixed settings follow the same skip-if-present rule.
- After import, the normal boot/sync path (`ensureSignedIn`, `planSync`)
  refreshes each newly-added character's token and pulls anything the backup
  didn't carry.

## Consequences

- The backup file is a bearer-credential bundle: whoever has the file and the
  password can sign in as every character in it. Today's scopes are
  read-only, so a leak is a privacy risk, not a destructive one, and is fully
  closed by revoking the character's EVE application authorization — but the
  UI states this plainly rather than let a pilot assume the file is inert.
  ADR 0001's "New devices require re-login per character" is now only
  partially true: a pilot can choose to trade that friction for the
  responsibility of protecting this file.
- No strength meter or minimum length is enforced on the export password for
  v1 — the panel copy says the password is the only protection, and a pilot
  who wants a weak one for convenience is trusted to have read that.
- Import failure (wrong password or a corrupted file) is a single
  "Unable to decrypt file" message — GCM's auth-tag failure does not
  distinguish the two, and there is no reason to guess at one over the other
  for the user.
- No QR/wireless transfer and no character-subset picker on export in v1;
  the whole-device file is the simplest shape that solves the 20+-alt case
  this was filed for.
