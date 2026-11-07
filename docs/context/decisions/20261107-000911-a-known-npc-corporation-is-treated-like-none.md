# Scope decisions — A known NPC corporation is treated like none for corp grants (issue #6009)

_Recorded 2026-11-07 · issue #6009._

- **A Character whose corporation is a known NPC corporation is never offered
  the corp Grant.** An NPC corporation has no player officers, so no Corp Role
  and nothing the Corporation Permission could unlock. This refines
  20260924-174340: the Corporation row hides for a known NPC corporation as it
  does for `none`, and so does the Corporation projects row. Every `/corp*`
  page shows "You're in {{corporation}}, an NPC corporation…" with no Grant,
  whatever the denial reason, and Settings › Corporation says the same.
- **An unknown corporation keeps today's behavior.** A corporation not learned
  yet might be a player one, and before a grant nobody can tell a line member
  from a Director (20260910-123303).
- **Settings › Notifications drops the Corp topic only when every stored
  Character is in a known NPC corporation.** The list speaks for all
  Characters, so one player-corp (or not-yet-known) Character keeps it. It is
  dropped on the phone too, not only the desktop tab: there the topic read
  "Needs Corporation permission", the same grant that cannot work.
- **A player-corp Character without the grant sees the route's role line above
  the Grant** ("Member tracking needs Director. If that's you, grant…"), under
  the title "Corp officer pages" rather than a refusal.
