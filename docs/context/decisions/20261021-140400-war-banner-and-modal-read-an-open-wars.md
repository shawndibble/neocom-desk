# Scope decisions — War banner and modal read an open-wars list from Firestore, not ESI

_Recorded 2026-10-21._

- **A War banner shows while the Character's corporation, or its alliance, has a war declared on it that is running or not yet started.** It sits under the header on the Overview and on the Corp overview. "Details" opens a modal with the aggressor, status, declared/start/end, allies and both sides' kill tallies. A war the pilot's own side declared does not show: this is the "you are dec'd" strip, not a war log.
- **It is a separate strip from the Danger banner, and it is not acknowledged away.** Danger is an Alert (structure under attack) cleared by Acknowledge. A war is a standing condition that ends when the war does, so there is nothing to dismiss, and the banner is a plain status rather than an announcement on every visit.
- **ESI cannot list one corporation's wars**, so the app reads `systemConditions/activeWars`, a list of every open war written by a scheduled function, and picks its own out client-side. `/wars` is a bare id list (about 763,000 ids, 2,000 a page) and `/wars/{id}` is rate-limited to 3,600 tokens per 15 minutes, so scanning it per client is not possible. Public data, so the same signed-in read as `systemConditions/lawless`; no rule change.
- **The list is hidden once it is 48 hours old** (four missed twice-daily runs): an early-ended war only shows as `finished` to a sweep, so a dead sweep must not leave a banner up. A war's own `finished` time is still checked at render, so a war that ends on schedule drops off without a sweep.
- **An ally counts as at war.** ESI's `allies` are always the defender's: only a defender can hire them.
- **Order of work:** the banner, modal and reader ship first and draw nothing until the list exists. The sweep function follows, then the Alerts-feed fast path (a war-declared notification asks for a fresh look so a new dec shows within minutes rather than at the next sweep).
