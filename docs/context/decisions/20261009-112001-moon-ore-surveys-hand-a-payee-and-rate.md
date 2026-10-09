# Scope decisions — Moon-ore Surveys hand a Payee and rate to the Mining Tax tab

_Recorded 2026-10-09._

- **A Survey that shows a moon ore asks who taxes it and at what rate.** On the creator's Survey tab only (the public page has no pilot to tax), a row with a Payee name and a percent. The name completes from the pilot's existing Payees (a datalist) and picking one fills in its `defaultTaxPct`. The creator can change either at any time; both are kept device-locally between visits (`surveyTaxPref.ts`), and the Payee itself is the ordinary synced Payee record.
- **The hand-off is the Payee itself, remembered for the Assign dialog.** "Open in Mining Tax" finds or creates the Payee (name matched ignoring case; an existing one takes the new rate as its default, which is safe since Assignments keep the rate they were made at), remembers its id (`surveyPayeePref.ts`) and opens `/mining/tax` unfiltered: the Payee filter would hide every row until the Payee has an Assignment. The Assign dialog preselects that Payee, with its rate, when the pilot's history in the row's system suggests none. It does not open the Assign dialog: an Assignment must claim ore the Mining Ledger already holds, and a Survey has none. The ledger shows what is owed once ESI has the ore.
- **Moon ore is detected by the scanner's ore name** against the SDE's moon ore types (`useHasMoonOre`).
