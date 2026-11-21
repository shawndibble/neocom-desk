# Scope decisions — Shared moon pop alert body names the refinery

_Recorded 2026-11-21. Amends the wording in `20261115-122511-corp-tax-book-shares-moon-pop-schedules.md`._

- **The Shared Moon Pop body names the refinery: "[Pop Time] at [time] · [Refinery] · taxed by [corporation] · [rate]%".** The Alerts panel row shows the body under the group label "Shared moon pop" without the title, so a pilot with several pops could not tell where one was. The title keeps "Moon pop · [Refinery]" (the toast and push still read well, at the cost of the refinery appearing twice there). The refinery's name carries its system. A pop with no known refinery keeps the old body. The in-app copy and the scheduled push read the same.
- **Calendar alerts are filed under their own "In-game calendar" chip, not Mail, and the calendar poll leaves out an event that is the same fleet as a Shared Pop already alerting that Character** (the Calendar page's `sharedPopEventMatcher`). Not applied when Shared moon pop alerts are off for the Character, the sharing corporation is muted, or the Character is outside the pop's audience: the event is then the only alert there is.
