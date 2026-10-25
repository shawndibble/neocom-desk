# 0030 — One EVE sign-in per Character covers every Alerts Grant permission its ticked events need

## Status

Accepted (2026-10-25). Amends ADR 0029's consent rule ("a fresh Turn on never asks for mail; an explicit per-Character Add mail"); follows ADR 0020 and 0028.

## Context

A Character could need three EVE round trips for closed-app alerts: Turn on (notifications), Add nearby (location), Add mail. At 20 Characters that is 60 sign-ins. The floor is one per Character: the server needs each Character's own authorization, refresh tokens rotate, and device tokens never go to the server (issue #5156).

## Decision

- Ticking a Device box never starts a sign-in. Settings → Alerts when closed reads the ticks and shows what each Character is missing; one walk, one Character at a time (EVE's page picks the Character), asks each for the union of the scopes its Device-ticked events need plus every scope its grant already holds.
- Before the walk, a screen lists the permissions, why, and for whom. That screen, confirmed, is the consent for location and mail, replacing the per-Character Add mail button. Because `newMail` and the nearby events default to Device-on, location and mail carry a checkbox on the listing to leave them out of the walk; the player's ticks are never changed for them.
- A scope is requested only after `registerDevice` reports the server takes it (`nearbyGrants` / `mailGrants`), as in ADR 0028 and 0029.
- `saveAlertGrant` already accepts every combination containing notifications; nothing changes server-side.
- The first-run offer keeps asking for notifications and location only.
- Future permissions (order fills and the like) are shipped as one grouped release so players re-authorize once.

## Consequences

- N Characters cost N sign-ins at most, and fewer when some already hold what they need.
- Mail is still opt-in in effect: it is requested only for a Character with `newMail` Device-ticked, only when listed, and can be left out at the listing. Custody of the mail-capable token is unchanged from ADR 0029.
- A permission left out is offered again at the next walk while its event stays ticked; unticking the event is the lasting choice.
