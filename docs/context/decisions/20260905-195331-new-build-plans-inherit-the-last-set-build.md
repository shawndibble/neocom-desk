# Scope decisions — New Build Plans inherit the last-set build location

_Recorded 2026-09-05._

- **A new Build Plan carries the picked Build Location, not just the fields
  that pick filled.** Facility, rig, security band, build system, facility tax
  and trade hub already defaulted from the Character's most-recently-updated
  plan (issue #456); the location pair added by #527 did not, so every new plan
  opened with an empty location box even though the numbers behind it were
  already the pilot's. The box is the only part of that group not folded behind
  "Override", which made the whole carry look broken.
- **The carry is gated on the source plan hosting the same Industry Activity,
  the same check `facility` uses — not merely on the source plan having a
  location.** Across activities the new plan's facility is the hardcoded
  fallback rather than the picked place's, so the name would label a job whose
  numbers came from somewhere else.
- **No device-local "last used location" setting.** "Most recently set" is read
  off `updatedAt` on the plans themselves, which is where every neighbouring
  default already comes from. A separate setting would be a second source of
  truth that can disagree with the plan it was copied from.
