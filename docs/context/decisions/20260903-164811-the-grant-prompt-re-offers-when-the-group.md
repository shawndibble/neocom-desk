# Scope decisions (round 42) — the grant prompt re-offers when the group grows

_Recorded 2026-09-03._

- **The dismissal record now stores what was offered, not just who saw it.**
  `GrantPromptDismissals` was `{ characterIds: number[] }`; it is now `{
offeredScopes: Record<number, readonly Scope[]> }`. Round 37's "offered once
  per Character per device" (superseded below) answered "has this Character
  ever seen the prompt" — the wrong question once the group can grow (round
  41). The right question is "has this Character seen _this_ offer," so the
  record now carries the scope set, and `isGrantPromptDismissed` is a
  superset check: dismissed only if what was recorded covers what is on offer
  now. A Character offered seven scopes who now faces eight is not dismissed
  for the eighth; a Character offered eight asked about seven is still
  dismissed, since nothing new is being asked of them.
- **This is structural, not sequential — no version bump, no migration
  step.** `CorpGrantPrompt` passes the current scope set to every dismissal
  check and every recorded dismissal, derived from `scopesForGroup('corp')` —
  the same derivation `esi/scopes.ts` already supplies to the SSO request and
  round 38's tests. A future round that grows
  the `corp` group again is caught by the same comparison automatically; it
  does not need its own round of this fix.
- **Declining now records "offered these scopes," not "never ask again."**
  This is a deliberate change from round 37: if the group grows later, the
  Character who declined is asked again, once, for the new state. Round 37's
  "never again on its own" meant never re-litigate the same question, not
  never ask a different one — the group growing is a different question.
  Granting still ends the prompt for the current group exactly as before,
  since both buttons funnel through the same record-the-offer path.
- **An old flat `{ characterIds: number[] }` record parses as nothing
  recorded, not as a migration target.** This is a `useLocalSetting`-backed
  value — device-local, never synced (CONTEXT.md) — so there is no migration
  concern beyond tolerant parsing. The old shape has no scope set to recover,
  and the correct fallback is exactly what the empty-record default gives:
  every Character it named is re-offered once, which is the fix for the
  Characters #331 actually affects.
- **Eligibility is untouched — only the comparison inside it changed.** The
  prompt still shows only when `useCorpAccess` reports
  `roles-without-grant`; a Character who has never held a corp role, and so
  has never reached that state, sees nothing different. This fix lives
  entirely inside `isGrantPromptDismissed`/`withGrantPromptDismissed`, not in
  when the prompt is allowed to render.
- **Round 37's "offered once per Character per device, and both buttons end
  it" is superseded by this round** — it is still true for an unchanged
  group, but no longer true across a group that has grown. The per-Character,
  device-local, not-synced parts of round 37 stand unchanged.
