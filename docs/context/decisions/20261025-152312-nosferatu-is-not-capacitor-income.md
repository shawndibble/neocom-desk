# Scope decisions — Nosferatu is not capacitor income (issue #5186)

_Recorded 2026-10-25 · issue #5186._

- **A Nosferatu's take stays out of the capacitor Delta, the stable % and the sustained tank.** It only drains a target that has capacitor, which a fit can't assume. The row still shows the figure, labelled "not in Delta". Rules out counting it as always-present income (Hurricane: +7.2 GJ/s, 43% of peak recharge).
- **Ancillary repairers' capacitor draw averages over the reload, as cap boosters' injection does.** Duty is `cycles × cycle ÷ (cycles × cycle + reload)`.
- **The Charge Picker and Cap Booster Guide work out a charge under the stats' own basis** (the pilot with the shown implants and skill overrides, Damage Profile, weather and projected effects), so its picks agree with the headline.
