# Scope decisions — Overview Contracts row feeds Next deadline (issue #1714)

_Recorded 2026-09-25 · issue #1714._

- **Overview gains a folded Contracts row (phone) and a Contracts card (desktop), and the Next deadline strip draws from it.** It counts only contracts on a clock: accepted couriers by deliver-by, and the pilot's own outstanding listings expiring within 24h. Longer-dated listings are excluded entirely, so a trader with a dozen open listings reads "Nothing due". This reverses part of `20260907-153621` ("The Contracts tile is dropped") for that deadline-relevant subset only — a bare count of active contracts stays out, and that decision's rule that the next deadline is drawn from the cards below still holds.
- **Contracts is outside the phone severity ranking, like Alerts.** It is always a folded row on a phone and never competes for one of the two full cards.
