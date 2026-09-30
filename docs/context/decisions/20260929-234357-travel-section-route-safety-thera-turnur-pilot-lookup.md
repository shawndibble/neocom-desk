# Scope decisions — Travel section: route safety, Thera/Turnur, pilot lookup are in scope (issue #2328)

_Recorded 2026-09-29 · issue #2328._

- **Intel and travel tools are now on remit.** Route Safety (this ticket),
  Thera/Turnur connections (#2330) and Pilot Lookup (#2331) are in scope. This
  **reverses** the `/add-missing-features` ledger's habit of clearing intel,
  wormhole and killboard tools as "non-ISK" or "out of remit"
  (`.claude/skills/add-missing-features/TOOLS.md`). Those three tools are the
  ones the remit now takes in; the ledger's notes say so, so the skill stops
  auto-rejecting them. It does not reopen every intel tool the ledger cleared —
  a Local scanner or DScan backend is still read-from-the-client work this app
  cannot do (kill-test 2).

- **They live in a new top-level Travel section, not inside Market or
  Contracts.** Where you are going and who is there is its own errand, not a
  step in hauling a contract. The rail groups it under an **Intel** heading
  rather than "Travel", which would sit over one item of the same name.

- **Signed-in, like every other route.** Travel reads only public ESI and the
  local stargate graph, so no scope can lock it (`UNGATED`), but it still sits
  behind a signed-in Character (kill-test 15). Logged-out access is a possible
  follow-up, not part of this.

- **Two requests per visit, never one per system.** `GET
/universe/system_kills/` and `/universe/system_jumps/` each answer the whole
  universe in one call, cached globally (not per Character) and revalidated
  with an ETag. That keeps faith with `20260912-165245`, which refused a
  per-row route lookup against the shared error budget — the route itself comes
  from the local stargate graph, as the Courier board's distances do.

- **Unknown is never zero.** ESI lists only systems that had activity, so a
  system absent from a response that arrived had none. A feed that failed with
  nothing cached is unknown for every system, and wormhole space — which both
  feeds exclude — is always unknown. A route total is withheld when any system
  on it is unknown, because a partial sum reads low.

- **Conditions, never verdicts** (`20260912-172628`). Rows say "12 ship kills
  in the last hour" and name a Gank Chokepoint; nothing scores a system or a
  route. A test scans the section's copy for the verdict words.

- **The Route Preference stays URL-only.** Travel is the second control offering
  one, but it is not persisted either, so the vocabulary unification CONTEXT.md
  records as owed before a second _persisted_ preference still has not come due.
  `ROUTE_PREFERENCES` moved to `features/route/routePreferences.ts` so the two
  controls cannot drift apart.
