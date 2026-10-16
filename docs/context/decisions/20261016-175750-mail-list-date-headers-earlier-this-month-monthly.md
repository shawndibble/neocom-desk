# Scope decisions — Mail list date headers: Earlier this month, monthly older headers, No date (issue #3971)

_Recorded 2026-10-16 · issue #3971._

- **Mail list buckets are Today, Yesterday, This week, Earlier this month, Last month, then one header per older month ("March 2020"), then No date.** Days follow the Time format zone the row dates print in; the week starts per the Calendar's week-start setting. "Earlier this month" fills the gap between the week's start and the 1st, which the ticket's list left unnamed; naming the current month as if it were an older one would read wrong. Older mail gets a month header, not a per-year one, so a pilot scanning back sees each month. Rules out year-only headers and dropping mail with no timestamp.
- **Headers are sticky `<h3>`s, matching the Coming up rail's day headers.** Not focusable, so Tab order is unchanged; each section's rows are their own list.
