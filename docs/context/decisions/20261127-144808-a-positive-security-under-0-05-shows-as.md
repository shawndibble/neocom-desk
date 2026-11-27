# Scope decisions — A positive security under 0.05 shows as 0.1 lowsec

_Recorded 2026-11-27._

- **`shownSecurity` rounds a true security in (0, 0.05) up to 0.1, not down to 0.0.** This refines `20260905-004207` ("`securityBand` bands the rounded status"): CCP's system security guide says "if the security status is in the range 0.0 < x < 0.05, it is rounded to 0.1, instead of 0.0". The old test asserted `0.0499 → nullsec`, an untested assumption. 13 systems in `systems.json` sit in that window (Egbinger 0.0346, Vestouve 0.0426, Espigoure 0.0499, …); they now show 0.1 lowsec, so route safety, the reaction location rule, the rig multiplier (1.9x, not 2.1x) and the PI customs rate all treat them as lowsec. Zero and below stay nullsec. Found by the Nov 2026 UX audit (EVE survey #6). The colour palette was not changed.
