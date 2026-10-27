# Scope decisions — PI design refs: deliberate differences not built (issue #2717)

_Recorded 2026-10-05 · issue #2717. From the PI final pass (#2697)._

The built Plan, Map and Colonies tabs differ from `docs/design/pi-tabs/` in six places. Shawn decided these stay as built; none is a gap to close. Each was checked against the code.

- **Phone Map shows a tier list, not "Your best moves" / the trace panel.** `MapPhone.tsx` lists one tier at a time (tier switcher), with the traced product as the selected row. The mock's "Your best moves" / "How it is made" panel is not built on phone.
- **No "What matters more" on Find best.** The ISK / least-hauling switch lives only on Make more (`piPlan.make.matters`, `MakeMoreSections.tsx`). `FindBestPlan.tsx` reads the stored preference but offers no control for it.
- **No popover-with-link to the 60-second explainer.** The mock's "New to PI?" button opens a short popover that links to the full explainer on Plan. The app's "New to PI?" button (`PlanetaryIndustry.tsx`) opens the explainer drawer directly (`PiExplainer`); there is no popover and no link to it.
- **No planet diagram in "Show me how".** The mock's step 2 draws a globe with pins and dashed wires. `ShowMeHow.tsx` lists the pins as text with a 16px planet icon and the load meter; no diagram.
- **The "have" tag on Map planet toggles stays boxed.** `MapBoard.tsx` draws it with a success-coloured border. DESIGN-RULES says a box means "click me"; this static tag keeps its box as a deliberate exception.
- **No question toggle on Map** (added from #2767). The mock's "I have planets… / What's the best thing to make?" switch and its "Specific product in mind? Click it on the map" line are not built. The picks strip picks the mode itself: your rebuild picks with colonies, the best one-planet recipes without (`picks.kind`), and clicking any tile traces a specific product.

Do not list these as "differences from the mock" in reviews, and do not build them without a new decision.
