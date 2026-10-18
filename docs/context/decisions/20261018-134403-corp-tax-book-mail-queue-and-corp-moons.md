# Scope decisions — Corp Tax Book mail queue and the /corp/moons page (issue #4055)

_Recorded 2026-10-18 · issue #4055._

D-numbers are the decision numbers in epic #4055.

- **One mail per debtor with the full breakdown (D16):** day, refinery, ore,
  quantity, unit price, price date and source, rate, tax, payments, credit,
  code and verify link. A breakdown past ESI's 10,000-character body is
  summarised by day per moon.
- **The officer previews first; Send explains the limit.** ESI's hidden
  anti-spam limit is about 5 mails a minute (520 MailStopSpamming with
  `remainingTime`), so the notice says N mails take about M minutes.
- **The queue runs in the background** at about 1 per 12–15s and waits out
  `remainingTime` on a 520. A top-bar progress chip on every page opens the
  queue (sent, waiting, paused, failed with retry, Done). The queue survives
  closing the tab and every mail is logged. "Open in EVE" compose is the
  fallback.
- **Route `/corp/moons` with three tabs (D21):** Extractions (timeline,
  states, ore and ISK, mined vs left; drill into a moon's history), Miners
  (owed, overdue first; drill into a miner's days, payments, dismissals and
  mail) and Statements (periods, sending, the queue). Settings open from the
  page header. The moon Kind Cards on `/corp` link here.
- **No UI is built before one of three mockup options is chosen** (#4056).
