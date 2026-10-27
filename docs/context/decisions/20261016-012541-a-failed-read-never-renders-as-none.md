# Scope decisions — A failed read never renders as none

_Recorded 2026-10-16._

- **A view whose read failed (or came back with nothing cached) never uses its "none yet" copy.** It shows `LoadFailedState` ("Couldn't load — you're offline", or "try again" while online) with Retry; "Every structure is fuelled", "No NPC standings yet" and "No ships found" are reserved for a read that succeeded and found nothing. This rules out mapping `null` to `[]` at a loader boundary: `null` stays "unknown" up to the view.
- **A cached copy is labelled, not hidden.** Rows served from cache keep the existing "Showing cached data" line; they are not replaced by the failed state.
- **A fan-out names who it skipped.** A cross-character view (Ships, Move plan, Assets search) lists the characters whose data didn't load instead of letting them vanish.
- **Market pricing unavailable offline is accepted** (owner decision); price placeholders are a separate change and this one leaves the price copy alone.
