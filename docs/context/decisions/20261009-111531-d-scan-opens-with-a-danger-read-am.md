# Scope decisions — D-Scan opens with a danger read: am I in danger, and what should I watch

_Recorded 2026-10-09._

_Recorded 2026-10-09. Supersedes the READS AS card, the four-question cells, Worth and Since-last-scan as top-level cards of `20261008-124955` and `20261009-035139`; those cards now sit inside the collapsed Full scan. Their data rules stand._

- **The page answers one question first: "Am I in danger, and what should I watch?"** A **Danger read** opens the D-Scan view: a level (Clear on scan, Watch, Danger, or Busy), one sentence built from counts ("One ship can hurt you, and one can find you."), the pattern the scan reads as, what is new since the last scan, and the scan's age.
- **Wording stays a condition, never a verdict** (`20260912-172628`). "Danger" is the level word; no sentence calls a pilot safe, hostile or one to avoid.
- **Four things a ship can do to you**, in the order they press: pin you down (interdictor, HIC, interceptor, mobile disruptor), bring more (cyno field, capital, Black Ops), hurt you (damage ships big enough for your ship), find you (recon ships, combat probes). They replace the old four questions.
- **Level:** Clear when none apply. Danger when the scan reads as a drop or a gang, when pinning or bringing-more comes with damage ships, or at 10+ damage ships that can hurt you. Otherwise Watch. A mixed crowd of 30+ ships with no pattern is **Busy**, with no danger level: a scan lists hulls, not whose they are, so the page says to read the counts.
- **Your ship decides what "hurt you" means.** A damage ship threatens a hull one size smaller than itself or larger; frigates, destroyers and every industrial or transport hull fear any damage ship. With no ship known it counts cruiser-size and larger, and says so. The ship comes from the Character's current ship (`esi-location.read_ship_type.v1`, see `20261009-105258`), and a hull picked by hand, with autocomplete, overrides it. The pick is device-local (Dexie `dscan.ownShip`, no `sync.` prefix).
- **Watch these** ranks groups of identical hulls (pinning, bringing more, hurting, finding; larger group first; type id breaks ties), shows at most five, then "+N more groups". Each row states its reason in text. "New" marks hulls that arrived since the last scan on this device. Not-a-threat groups are named when there are one or two, counted otherwise.
- **Leave or re-check if** lists the four things with live counts ("None now", "3 now"). It has no scan-again button: the page cannot read the game client, so it only says to scan again and paste (Ctrl+V), and compares automatically.
- **Scan age** counts from the paste and turns to a warning after 2 minutes. A Shared D-Scan shows no age and no first-scan note, and still never reads or writes the device's last scan.
- **Fleet by role** moves up beside the answer from 12 ships. The role bar still expands the distance lanes. The full role list, Worth, Since-last-scan and the cloaked-ship caveat sit in the collapsed **Full scan**.
- **Every status is an icon plus a word**, never colour alone; secondary text meets 4.5:1; controls are 44px on touch.
