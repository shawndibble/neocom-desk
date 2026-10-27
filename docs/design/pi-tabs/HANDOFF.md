# PI tabs: handoff for the next agent

Epic: Plan · Map · Colonies tabs; the Advisor retires. Spec: this folder (`README.md`,
`GRAMMAR.md`, `DESIGN-RULES.md`, mockups, `ref/`). Scope decision:
`docs/context/decisions/*pi-section-becomes-plan-map-and-colonies-tabs.md`.

## Status (2026-10-05)

Merged: #2629 spec, #2630 tab skeleton + header strip, #2631 SDE planet finder helper,
#2632 recommendation model (`buildPlanAdvice` in `src/features/pi/planAdviceModel.ts`).
In flight or open: #2620 settings, #2633 Plan "make more", #2634 Plan "find best",
#2635 Colonies, #2636 Map, #2618 retire the Advisor.

## Gate: building blocks first

DESIGN.md §6c is the new interaction grammar. Its building blocks ship in rollout #2639
Wave 1 (entity links `EntityLink` / `MarketItemLink` / `SystemLink`, `ExternalLink`,
`HintText`). The UI tickets #2633, #2634, #2635, #2636 are **deliberately unlabelled
`ready-for-agent`** until those are in `main`. Check `src/components/` for them (or #2639's
Wave 1 D and B boxes). When present, add `ready-for-agent` to those four and run them.
If a block is still missing, build to the rule in `GRAMMAR.md` and use the primitive later.
The PI folders are excluded from the #2639 sweep, so these tickets are where §6c lands.

## Order

#2633 → #2634; #2635 and #2636 in parallel with #2633 (all read `buildPlanAdvice`;
#2636 also uses the SDE helper). #2620 any time. #2618 last (after #2633, #2635, #2636, #2620).

## Per ticket, every time

Use `/next-ticket` with the explicit issue number (`scripts/next-ticket/select-ticket.mjs <n>`).
Read the issue with `gh api repos/shawndibble/neocom-desk/issues/<n>` (`gh issue view` is empty here).

1. TDD for model and engine code; `src/engine` stays pure; tests under 10 s.
2. **Browser verification BEFORE `open-pr`** (it arms auto-merge). The ticket's
   "Browser verification against the mockup" block is the procedure: seed e2e fixtures
   (`e2e/support/piColonies.ts`), screenshot at 1440 and 390, compare with `ref/` via a
   read-only reviewer sub-agent. Compare structure, order, wording, icons, states and which
   elements are interactive. **Not numbers**: mockups use a toy model. Expected differences:
   everything in `GRAMMAR.md`. List any other as "Deliberate differences from the mockup".
3. `/code-review` and fix findings BEFORE `open-pr`.
4. `open-pr.mjs`, `drive-ci.mjs` to green. Subagents can't merge; auto-merge lands it.
   Confirm with `gh pr view <n> --json state`.
5. Do not build mockup-only parts (pilot switcher, sample systems, fake alts, "Mockup only").

## Final pass (after #2618)

One reviewer sweep of all three tabs against `ref/`, Advisor fully gone (grep for
deleted components), plus the new-player / veteran / hostile / bug-hunter personas from the
original ask, and accessibility (keyboard, a non-visual equivalent for the Map).
Then close the epic.
