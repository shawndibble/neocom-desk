# Scope decisions — Alt colonies show their own figures, outside the plan (issue #2709)

_Recorded 2026-10-05 · issue #2709._

- **Another Character's colony row shows its own ISK a day and fixes, and its group header "Makes ~X/day", labelled "not in your plan".** Supersedes the "no ISK figures or fixes" line of the #2635 decision. Decision 20260906-145512 stands: alts never shape the plan. These are read-only display figures from a separate `buildPlanAdvice` call per alt (`colonies/altAdvice.ts`); they are never added to Plan, Map or Today's check totals.

- **Alt figures price with every skill unknown.** The roster never reads an alt's skills, so Customs Code Expertise, Command Center Upgrades, Interplanetary Consolidation and Accounting go in as unknown: the un-reduced customs rate and full sales tax, so the figure understates rather than invents. A colony with no cached detail gets no figure, not zero.

- **An alt colony in a system whose security has not resolved gets no figure.** The model reads an unknown security as highsec, which would price a nullsec colony at the cheap customs rate and overstate it. Security for the alt's own systems is resolved through the public, cached system lookup before it is priced.
