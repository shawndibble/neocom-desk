# Scope decisions — A charge is counted in whole ISK

_Recorded 2026-11-26._

- **The running account and the Payee ledger count each charge line in whole ISK.** Ore value times rate leaves fractions of an ISK, but every figure shown is whole and so is every payment, so a member who paid the figure shown still carried 0.144 or 0.544 ISK into later days and read "−0" or "−1" in red. Each line is rounded once where it enters the account (`runningDaysFromLines`) and the ledger (`payeeLedger`), so the Charged column adds up to the balance. It rules out hiding the residue in the display only, which left the arithmetic carrying it. The book's stored charges are not rewritten (Cloud Functions are not auto-deployed), so the rounding is client-side. An amount under 1 ISK counts as 0, and a reversal of it reads 0, never -0 (`wholeIsk`, `docs/SHARED-CODE.md`). A bare mark is capped at the rounded tax. Payments are not rounded, so a payment with cents can still leave a fraction.
