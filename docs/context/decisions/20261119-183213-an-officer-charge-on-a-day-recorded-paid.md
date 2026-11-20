# Scope decisions — An officer charge on a day recorded paid stays owed

_Recorded 2026-11-19._

- **A day at or before a Miner's stored paid-through stays closed (D22), but an officer's positive Adjustment on it is owed.** Before, the recorded-paid pin forgave any shortfall on the day, so a charge an officer added to fix a balance was silently written off (a Miner showed Owed 0 with the charge listed). The charge is pooled and stays owed on the oldest recorded-paid day that ended short, wherever oldest-first payment fell.
- **Late ore on a recorded-paid day is still forgiven** (D22); only an officer's own charge is exempt.
- **Known limit:** the charge is pooled across recorded-paid days, not tracked per payment, so a charge that was fully paid while another recorded-paid day ended short for another reason can make that shortfall owed instead of forgiven. Rare; a held day or one paid within tolerance takes no part.
- **A ledger correction row is dated by the day the officer picked, not the day they typed it.**
