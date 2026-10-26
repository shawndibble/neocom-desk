# Scope decisions — A player's own Unmatched donations are claimed automatically

_Recorded 2026-10-26._

- **The app claims a player's own Unmatched donations as soon as the books load; no click.** The server already refuses anyone but the donor (`payment.uid`), so the list the page holds is only the player's own and a confirmation protects nothing. A first-time corp book knows none of a player's characters yet, so a moon-mining launch produced one prompt per donation, all clicked through unread. A wrong credit is cheap: an officer's "not tax" or reassignment reflows it. Each donation is tried once per session; a failed claim (offline) keeps the manual Claim prompt as a retry. This rules out a separate "Claim all" button: nothing is left to batch.
