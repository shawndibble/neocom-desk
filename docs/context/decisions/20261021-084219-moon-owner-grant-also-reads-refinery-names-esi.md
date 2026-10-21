# Scope decisions — Moon owner grant also reads refinery names (esi-universe.read_structures.v1) (issue #4654)

_Recorded 2026-10-21 · issue #4654._

- **A moon owner's grant asks for `esi-industry.read_corporation_mining.v1` plus
  `esi-universe.read_structures.v1`.** Owner decision; it overrides spec #4504's
  "one scope only (ledger-only)". The corp mining ledger carries no refinery name or
  system, and the miner-learned system (#4650) is unverified. The extra scope is the
  same single SSO round trip and needs no extra corporation role. Nothing else is
  allowed on the grant: the server takes the ledger scope alone (grants from before)
  or both, and refuses any other.
- **Grants from before keep syncing.** A missing structure scope is never stale or
  disconnected; the sync just never calls `/universe/structures` for that grant (each
  403 would burn the shared ESI error budget). The grant doc records `readsStructures`;
  the moon owner record and view carry whether names are read, and the moon owner's page
  shows an optional, quiet "Grant again" that reuses the Reconnect round trip. Existing
  moon owners must grant again to get names.
- **The server reads each refinery with the moon owner's own token, after a good ledger
  read, and caches it on the moon owner record** (`refineryStructures`, beside
  `refinerySystems`): name, system, `checkedAt`. Re-read after 7 days; a 403 (no
  docking access) or 404 is remembered as `denied` and not retried for 7 days; an
  unanswered lookup is not kept. At most 20 lookups per moon owner per run. The lookup
  is best effort and never moves the moon owner's health.
- **Label chain:** officer label, then the structure name, then the system (the
  structure lookup's wins over the miner-learned one, which stays as fallback), then the
  moon owner's name plus the id, never on a miner's line. The structure name is the moon
  owner's own data; it may show on the accounting side and on miners' lines, like other
  structure names.
