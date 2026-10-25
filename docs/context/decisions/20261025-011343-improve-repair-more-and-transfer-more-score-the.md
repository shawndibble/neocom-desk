# Scope decisions — Improve: Repair more and Transfer more score the remote figures (issue #5030)

_Recorded 2026-10-25 · issue #5030._

- **Repair more scores the relative gain in total remote repair HP/s; Transfer more scores the relative gain in remote capacitor GJ/s.** Both read `support.ts` (`remoteRepair` shield, armor and hull added on one scale; `capTransfer`), never the fit's own tank. Each row shows the figure before and after. Disabled with a reason when the fit hands out none ("No remote repairers on this fit", "No remote capacitor transmitters on this fit").
- **Cap stability is the guardrail, with no new code.** The search already rejects any swap that turns a stable capacitor unstable and lists it under the closest rejected swaps as `capStable`; logistics goals use it as is. A fit that is already unstable is not rejected for staying so.
- **The two goals protect each other's job in Rework.** Remote capacitor transmitters (group 67) leave the `remoteRepair` job and get their own `capTransfer` job, so each goal guards only the job it scores: Repair more may swap out the last transmitter, which it does not score, and Transfer more may swap out the last repairer. Rework groups: remote shield boosters, armor and hull repairers and the ancillary remote boosters and repairers for Repair more; the remote capacitor transmitter for Transfer more.
