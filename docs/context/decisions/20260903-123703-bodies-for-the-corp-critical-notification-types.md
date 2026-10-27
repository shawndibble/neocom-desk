# Scope decisions (round 36) — bodies for the corp-critical notification types

_Recorded 2026-09-03._

- **The generic body stays the floor, and a real body is an upgrade on top of
  it.** Round 34 called this the follow-up; issue #300 is it. Seventeen `type`
  strings get a hand-written body naming the thing at stake — the structure,
  the bill's amount and due date, the war's aggressor, the applicant. Every
  other type, including anything CCP ships tomorrow, still renders
  generically. `eveNotificationText.ts` routes _every_ failure back to that
  generic body: an unknown type, a payload field the body needed and did not
  get, a payload the parser made nothing of, a missing translation key, and
  anything thrown on the way. A renderer that threw or returned nothing would
  be a regression against round 34's AC2 even though it looks like an
  improvement.
- **The payload is parsed as a flat `key: value` subset, not with a YAML
  library.** The blob is YAML, but the part these bodies read is top-level
  scalars — a general parser would be a large runtime dependency for a dozen
  keys. `engine/eveNotificationPayload.ts` owns the three quirks that matter:
  the `&id001` anchor CCP attaches to every `structureID`, values that
  contain colons (`structureLink`), and indentation as the only marker
  separating a nested block's keys from top-level ones.
- **Name resolution is a separate, best-effort, time-boxed step that cannot
  hold a notification back.** `eveNotificationNames.ts` does the async lookups
  — structure names through the existing ACL-checked structure cache, entity
  ids through the existing bulk `postUniverseNames` path — catching each one
  on its own _and_ racing each against a fixed budget;
  `eveNotificationText.ts` stays synchronous and renders an id or a neutral
  phrase for anything it was not handed. Catching a rejection alone would not
  satisfy the rule: an ESI call that merely hangs delays the alert just as
  effectively as one that throws. A structure outside the Character's ACL is a
  normal outcome, not an error state.
- **`CorpBecameWarEligible` renders a fixed body, and that is not a violation
  of round 34's AC2.** Its payload really is empty (`{}`), so "an empty
  payload" is its _normal_ case rather than a degraded one; falling back to
  the generic body for it would mean it never gets a real body at all.
  `CorpOfficeExpirationMsg` is the near case: CCP publishes no schema for it
  and it appears in no public sample, so it reads `dueDate` opportunistically
  — the key every other billing type uses — and says the plain sentence when
  that is absent. Neither guesses at a key name it has no evidence for: a
  wrong expiry date would cost the office the notification exists to save.
- **A reinforcement timer is derived from the notification's own timestamp
  plus the payload's `timeLeft` duration**, not from the payload's sibling
  `timestamp` key. The envelope timestamp is the instant ESI vouches for, and
  the two agree on the sample where both can be checked — but only one of
  them is a field CCP can silently repurpose.
