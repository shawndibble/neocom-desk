# Scope decisions — SRP: pilots file, officers approve, corp-set rules price the claim (issue #4608)

_Recorded 2026-10-23 · issue #4608._

- **Any pilot in the corp files; only the Character that died.** The filer must have been in the corporation when the ship died, and files within 30 days (corp-adjustable). One **SRP Claim** per killmail. A rejected claim may be re-filed once, with a note. Rules out filing for an alt or for another pilot's loss.
- **Members need no corp grant.** A pilot signs in with EVE SSO and the app reads their corporation from public affiliation. Their SRP is the SRP sub-view of the personal Overview (`/srp`, beside Clones and Employment), shown only when their corp has SRP on. Hidden, never locked. Officers work at `/corp/srp` (Queue, Settings).
- **Filing is a pasted killmail link, or a pick from the pilot's lost ships.** The lost-ships list needs `esi-killmails.read_killmails.v1`, an opt-in grant the SRP page prompts for. Paste works without it. This is a deliberate exception to the standing preference against new opt-in scope groups, because the page asks at the point of need.
- **The server verifies the killmail.** It fetches it from ESI, checks the victim and the corporation at the time, fills in hull, system and time, and rejects duplicates.
- **Amount is worked out by a chain.** A fixed price for the hull (**Hull Rule**), else killmail value (zKillboard) × the corp's killmail percent, else Jita **Appraisal** × the corp's Appraisal percent, else the officer types it. Each hull or class is **Pay**, **Not covered** or **Officer decides**. The officer may override the amount on any claim, with a reason.
- **States are Pending → Approved → Paid, plus Rejected.** Approved and Paid are separate because the ISK moves in game. A rejection needs a reason. Corp "ISK owed" is Approved and not yet Paid.
- **Optional "Fleet or FC" note on the claim,** which the corp may make required. The officer judges it; the app does not verify it. Doctrine-fit checking is a separate later ticket.
- **Pay: corp percent follows the corp's chain.** A Hull Rule set to the corp's percent carries no figure of its own: the killmail percent then the Appraisal percent apply, each as the corp set it.
- **Who does what.** A Director turns SRP on and sets pricing and Hull Rules; the CEO can reclaim it. A Director or Accountant approves, rejects, overrides and marks paid.
- **An officer never decides their own claim.** Approve, reject, change amount and mark paid refuse when the officer's Character is the claim's Character; another officer must decide. An approval or payment also fails if the amount changed since the officer looked, and the amount may be overridden on any unpaid claim (Pending or Approved).
- **Visibility.** A pilot sees only their own claims. Officers see all. Other members see none.
- **Retention.** Paid and Rejected claims are deleted 1 year after they close, leaving one audit entry per corporation per run (claim ids only, no pilot identity).
- **Result mail is best effort.** The approving officer's client sends it. The in-app status is the record.
- **Names.** **SRP Claim** and **Reimbursement**; "Payout" stays with mining tax.
- **Data lives under a `corps/{id}` umbrella** (`corps/{id}/srp`), written only through callables. The Corp Tax Book moves under it in a separate ticket; it stays put until then.
- **A hull with no Hull Rule runs the percent chain if the corp set one up.** If no percent is set, the claim has no computed amount and the officer types it. **Officer decides** always means the officer types the amount.
