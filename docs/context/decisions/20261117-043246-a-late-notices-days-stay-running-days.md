# Scope decisions — A late notice's days stay running days (issue #6294)

_Recorded 2026-11-17 · issue #6294._

Narrows decision 20261117-033049 (a Corp Tax Book is a running account).

- **A late notice is a record of what was asked, not a bill.** On a running account the app reads
  a notice's days as running days: money pays the Miner's oldest unpaid day whatever code it
  carries, and a notice is settled once every day it lists is. A notice never takes the calendar
  bill's rules (the 100k tolerance, a coded payment pinned to it, its days closed for good once
  "paid"). This rules out a notice's days being paid twice, once as days and once as a bill.

- **A notice lists only the unpaid days no earlier notice listed.** Its lines (kept as they were
  priced) are the new days only, so the server and older clients, which read a notice in the
  calendar bill's old shape, never count a day twice; what earlier notices still owe is
  carried. A follow-up notice may list no new day. The mail itself always lists every
  day still owed, oldest first, with the total owed now.

- **"Day of month" means on or after that day, once a month.** A Miner who owes from before the
  book's day gets a notice the first time an officer's tab plans one on or after it that month, so
  an officer who opens Moons a day late still sends it; never a second that month.

- **Closing a guest's running account sends a final notice** of the unpaid days no notice listed;
  it changes neither what is owed nor the credit, since the days were owed already.
