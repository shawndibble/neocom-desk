# Scope decisions — Calendar shows Shared Pops as a Shared moon pop kind (issue #6224)

_Recorded 2026-11-15 · issue #6224._

- **A Shared Pop is hidden when the pilot reads its refinery's drill as a corp moon chunk**, matched by refinery (structure id), since one refinery holds one moon's drill at a time. "Reads" is any extraction the corp read returned, arrived or not, so a pop does not reappear once the pilot's own row passes its arrival. The `?pop=` deep link still opens a hidden pop's detail: the notification fired for it.
- **The row counts down to the Pop Time, then to the belt's expiry** ("belt expires"), the `moonChunk` arrival-then-decay pattern, so a popped Shared Pop never reads "Overdue" while the field is still there.
- **Sharing corporation is not the Corporation events filter.** A Shared Pop carries its corporation as `sharedBy`, not `corporation`, so "Hide corporation events" never hides it. Its own submenu ("Shared moon pops by") offers All and each sharing corporation, and only with two or more: with one, All is the only choice and the kind row already hides them all, so there is no Hide entry either.
- **The fetch is held five minutes** (`calendarSharedPopsRead.ts`); Refresh within that window reuses it. A failed read leaves the kind unreadable and silent (no "Unavailable" row), like the opt-in corp kinds.
- **The start link names the refinery and payee by ID** (the payee's name comes from ESI on the Survey page) and carries no notes: the notes show in the detail instead.
- **Colour `--color-kind-shared-moon-pop: #8880b8`** (slate violet): ΔE ≥ 25 (CIE76) from every other clock kind, ≥ 39 from the four status tones, AA 5.37 / 5.04 / 4.70 on bg / panel / panel-2, normal vision only. Glyph: `Icon.SharedMoonPop` (Phosphor MoonStars).
