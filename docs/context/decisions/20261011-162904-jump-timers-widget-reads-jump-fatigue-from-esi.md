# Scope decisions — Jump timers widget reads jump fatigue from ESI (issue #3581)

_Recorded 2026-10-11 · issue #3581._

- **Jump fatigue is read from ESI, not a manual timer.** `GET /characters/{id}/fatigue` (`esi-characters.read_fatigue.v1`) exists; the earlier "no ESI endpoint for jump fatigue" line in `20261011-082556-overview-customize-flow-details.md` was wrong and is superseded. The kind keeps the name "Jump timers" and shows both the clone jump cooldown and jump fatigue. ESI gives no separate jump activation timer, so none is shown.
- **The scope is an opt-in Permission (`jumpFatigue`), not in the Base Grant.** Only the widget needs it, so it is requested on Grant access and never at sign-in; existing Characters are untouched.
- **A partial grant keeps the widget.** With one scope, the readable timer shows and a Grant access for the other sits under it. With neither, the widget is in its needs-permission state. There is no separate empty state: a Character with no jump history reads "Ready" and "No fatigue".
- **A failed Infomorph Synchronizing lookup reads as level 0**, so the clone cooldown can show longer than it is; it never shows shorter.
