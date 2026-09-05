# Scope decisions (round 43) — corp Notification Events

_Recorded 2026-09-03._

- **Five new Notification Events, each a diff over data the corp board (#296)
  already loads: `structureFuelLow`, `corpIndustryJobReady`,
  `corpMemberJoined`, `corpMemberLeft`, `corpWalletThreshold`.** The issue that
  scoped this work called them "four events"; Member Joined and Member Left are
  independently toggleable, so they are two `NotificationEventId`s, not one.
  None of the five duplicates what #274/#300 already deliver from EVE's own
  notification feed (structure attacks, fuel alerts at CCP's fixed point,
  services offline, moon extraction, war declarations) — that set was cut from
  the original seven precisely because rebuilding it by diffing hour-stale corp
  endpoints would be strictly worse than what already ships.
- **A corp event answers to two gates, not one — `scope` and a new
  `corpCapability` field on `NotificationEventDef`.** Every personal event
  already had `scope`; a corp event additionally names the
  `engine/corpRoles.ts` capability its underlying endpoint needs, since a
  granted scope and a held in-game role are independent facts (round 35). The
  poller's own `enabledEventsFor` still checks scope alone — the capability
  check lives inside each corp domain's own `pollDomains.ts` `load()`, ahead
  of its ESI call, on `boardData.ts`'s established rule that the capability
  check belongs at the caller. A capability that cannot be determined this
  poll (roles unreadable, corporation unknown) is treated the same as one
  known missing: the load returns `null` and nothing is fetched. This is what
  makes AC5 — "the poller never requests the endpoint" — true without a single
  branch added to `foregroundPoller.ts`.
- **Settings renders a capability-gated row disabled, with its own tooltip —
  a deliberate, narrow exception to round 35's "Corp UI hides, it never
  locks."** Round 35's doctrine is about whole nav surfaces: hiding an entire
  page a Character cannot use at all. This is one row inside an already-dense,
  already-visible Notifications panel that already disables rows for a missing
  OAuth scope with a tooltip (`reauthHint`) — extending that existing,
  in-panel disabled-with-tooltip idiom to a second gate is consistent with the
  row's own established pattern, not a new failure mode. The tooltip copy is
  deliberately not `reauthHint`'s: `corpCapabilityHint` says a Director has to
  grant the role, because re-authorizing cannot fix a missing role the way it
  fixes a missing scope.
- **A capability not yet resolved renders the row enabled, never disabled —
  and this covers a read that failed outright, not only one still in
  flight.** `NotificationsPanel.tsx` fetches `loadCharacterRoles` for every
  _stored_ Character on mount (an async fan-out, not a synchronous fact like
  scopes from `db.tokens`), so there is a real window before an answer
  exists; a Character whose read never lands (offline, a stuck refresh) stays
  in that same "not yet resolved" bucket indefinitely rather than moving to a
  third, disabled-forever state. Locking a row on absence of proof is worse
  than the optimism of showing it enabled — the same reasoning round 35 gives
  for `unknown` rendering as `none` rather than a spinner or a placeholder
  lock, deliberately generalised here to include a failed read, not only a
  pending one. This is a UI-only default: the poller's `load()` gate (above)
  always resolves synchronously to "don't fetch" on the same uncertainty, so
  AC5's substantive half — the endpoint is never requested — is never put at
  risk by this optimism. The cost is a Character who can never get an answer
  seeing a row that reads as available but produces nothing; that is judged
  the lesser failure, on round 35's own precedent.
- **The two threshold-carrying diffs compare each side of the crossing to the
  threshold that was actually in force when it was measured, not the current
  one twice.** `diffStructureFuelLow` and `diffCorpWalletThreshold`'s
  `balanceBelow` half both persist the threshold on the entry, and both read
  `prevEntry`'s own stored threshold — never `entry`'s current one — when
  asking "was this already inside its window and so already reported."
  Reusing the current threshold for that question as well would make
  _raising_ a threshold retroactively read every earlier poll as
  already-inside the new, wider window, so a structure or division genuinely
  newly eligible would silently never fire — breaking AC4's "take effect
  without a reload" in exactly the direction a Character is most likely to
  reach for (asking for more warning, not less). Lowering a threshold is
  judged the same way and stays correct: an entry already inside the old,
  wider window is not re-reported just because the window narrowed.
- **Fetching corp roles for every stored Character in Settings departs from
  round 37's active-character-only precedent for the Corp access row — on
  purpose, and for a different reason.** Round 37 avoided a per-stored-Character
  roles read because that row is hot and always mounted. This one runs once
  per Settings visit, against `loadCharacterRoles`, which `features/corp/roles.ts`
  already documents as "cheap enough to run for everyone" — a small payload, an
  hour of server-side cache, no role gate of its own. The cost/benefit is
  different, so the answer is allowed to be.
- **The corp wallet threshold event splits its two conditions across a
  different number of divisions, and that split is deliberate.**
  Balance-below is checked across every division `loadCorporationWallets`
  returns — one call already prices in all seven, so restricting it to the
  master division would throw away six divisions for free. Transaction-above
  is checked only on `MASTER_WALLET_DIVISION`'s journal: ESI publishes no
  all-divisions journal, the seven are separately paginated and separately
  role-gated, and `boardData.ts`'s existing reasoning for the vitals rail
  reading only the master division ("the rail's net and runway can only ever
  describe one wallet") applies here too. A truncated master-division journal
  page set skips the poll entirely, the same truncation-guard shape
  `walletDomain` already uses for the personal wallet.
- **Both channels default on for all five events, and that is not new
  machinery — it is the existing "absence means enabled" idiom
  (`eventSelection.ts`), applied deliberately rather than left implicit.**
  `isEventEnabledFor` already defaults every ordinary `NotificationEventId` to
  both channels on; these five needed no code change to get that default, only
  to _not_ be routed through `EVE_TYPE_DEFAULT`'s feed-on/browser-off idiom the
  ~100 `eveNotification` types use. The contrast is deliberate: those types are
  numerous and mostly informational, so a type must be opted _up_; these five
  are rare and high-stakes, so nothing needs opting up at all.
- **Structure fuel's lead time and the corp wallet's two ISK thresholds are the
  first Notification Event settings that are not a plain on/off, and they are
  stored device-local, per Character — `preferences.ts`'s existing
  `createLocalSetting` category (round 20), not a new persistence layer.**
  `thresholdsByCharacter` sits beside `perCharacter`, same shape of key,
  same never-synced guarantee. AC4's "takes effect without a reload" is
  satisfied by the poller re-reading the threshold from this store inside each
  corp domain's own `load()` on every ~5-minute tick — no push, no listener,
  just re-reading current state on the next poll — which is a plain
  consequence of `preferences.ts` already being the live source of truth
  the poller reads every cycle, not new mechanism built for this. Fuel
  defaults to 7 days (the issue's own justification: "a director planning a
  fuel run wants a week's warning"); the wallet floor and ceiling default to
  50,000,000 and 100,000,000 ISK, arbitrary but documented starting points a
  Character is expected to tune.
- **The fuel row says, in the UI itself, that it is not a copy of EVE's own
  alert — the issue's literal instruction ("say so in the UI, so nobody reads
  it as a second copy of the EVE alert"), not left to a code comment.** A
  sentence renders directly under the threshold control
  (`structureFuelLowNotDuplicateHint`) whenever the row is enabled: CCP's
  `StructureFuelAlert` fires later, at its own fixed point; this is an
  earlier, Character-chosen warning, additive rather than redundant.
- **The honesty requirement is UI text, attached per corp row, not a
  group-level block.** Search (`filterNotificationSections`) can narrow a
  Character's section down to a single visible event id, and a block rendered
  once per section would disappear exactly when a searching user is looking at
  one of these five rows. `settings.notifications.corpEventBestEffortHint`
  therefore renders under every row whose id is in the five, the same
  per-row-attachment shape `planetaryExtractorExpiring`'s existing hint
  already uses. Recorded here as the scope decision, verbatim:

  > These alerts are best-effort. With no server push (round 20), they fire
  > when the app is open, or when the browser chooses to run a background
  > sync. On iOS they do not fire in the background at all. They are not a
  > substitute for in-game alerts.
