# Scope decisions — Communities: a blueprint with no readable place is skipped and counted

_Recorded 2026-10-12. Refines "Location is the station or structure plus its system" in `20261011-160026-communities-share-blueprint-libraries.md`._

- **One unreadable place no longer holds back the whole library.** Publishing used to give up entirely when any selected blueprint sat in a station or structure whose name or system could not be resolved (a player structure the Character has no access to is enough). One such blueprint meant none of the Member's blueprints reached the Community. Now only that blueprint is left out.
- **A skipped blueprint is never shared with a guessed place** (unchanged): a blueprint in a container that cannot be traced, or in an unreadable structure, is left out, not shared with an "unknown" location.
- **The Member is told.** The Blueprints tab shows how many selected blueprints are not shared and why, and checks when the tab opens, so the count does not wait for a change. If nothing could be published at all, it says so.
- **It heals itself.** The library hash covers only what is published, so when a skipped blueprint's place later resolves, the next sweep pushes it. A transient lookup failure therefore shrinks the Community's copy for at most one sweep (30 minutes), which is the price of not blocking on a permanent one.
