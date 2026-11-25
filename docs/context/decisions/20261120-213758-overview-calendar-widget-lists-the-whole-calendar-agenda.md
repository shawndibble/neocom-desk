# Scope decisions — Overview Calendar widget lists the whole Calendar agenda

_Recorded 2026-11-20._

- **The Overview's Coming up widget is renamed Calendar and lists the Calendar page's agenda: every
  Character Board Item it reads, the same rows as the Coming Up Rail.** Reverses "Coming up lists
  calendar events only" (20260929-140431-six-more-overview-cards.md). Named "Coming up", the widget
  read as the rail's twin while it showed one of fourteen kinds; Shared Pops, structure timers
  and fuel, skyhook raids and the other corp clocks had no Overview home at all. The stored kind id
  stays `comingUp`, so saved layouts keep their widget.
- **A new widget shows every kind. Its own Types filter hides some, stored on the widget as the kinds
  it hides.** A pilot who also has Training, Industry or Contracts widgets can switch those kinds off
  here. Stored as exclusions, like the page's filter (`calendarKindFilter.ts`), so a kind added later
  shows the day it ships.
- **The widget's filter is never the Calendar page's.** The page's filter is device-local and tidies
  one page. The widget's lives in the synced Overview layout, like every widget setting, and is per
  instance: two Calendar widgets may show different kinds. Hiding a kind on the page must not
  silently empty a widget, or the other way round. Does not reverse 20260907-123312 (the page's
  filter stays device-local); that decision governs the page's filter only.
- **The Events choice (accepted and tentative, or all) still narrows calendar events only.** Every
  other kind has no RSVP.
- **Next deadline still takes calendar events only from this widget, the committed ones.** The other
  clocks reach the strip through their own widgets, and two offers of one clock could contradict
  each other.
- **Items overdue from before today are left out (`splitLongOverdue`).** The rail folds them into
  one summary row; a widget has no room for that fold, and a month of idle extractors would bury
  what is current.
- **Shared Pops show once, at the viewer's Pop Time, exactly as on the page.** Both surfaces run
  `boardSourcesWithSharedPops`.
