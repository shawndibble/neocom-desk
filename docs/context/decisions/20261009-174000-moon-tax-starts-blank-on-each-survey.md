# Scope decisions — Moon tax starts blank on each survey

_Recorded 2026-10-09._

- **The Moon Tax row no longer remembers the last payee and rate across surveys.** It starts blank and shows only what that survey itself stored; the pilot sets it per survey if they want it shown. Autofilling from the previous survey put a wrong tax on a field the pilot had not configured. This supersedes the "kept device-locally between visits (`surveyTaxPref.ts`)" line in `20261009-112001-moon-ore-surveys-hand-a-payee-and-rate.md`; typing a known Payee name still fills that Payee's rate.
