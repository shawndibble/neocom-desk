# Scope decisions (round 21) — Skill Plans side-by-side layout

_Recorded 2026-09-02._

- SkillPlans is the first of round 19's three deferred pages (Calendar,
  SkillPlans, Industry) to convert from vertically-stacked master-detail to
  a real side-by-side pane, mirroring Mail's shipped two-pane shape
  (round 18): list left, detail right, each with its own independent
  scroll, `useIsDesktop`-driven `hidden`-class toggling on narrow screens,
  and a back control shown only when narrow. Calendar and Industry remain
  deferred.
- **The list/editor route split (round 17) is unchanged.** `/skills/plans`
  and `/skills/plans/:planId` stay separate routes — this round is purely
  about how the two are presented together, not about merging them. Both
  routes render the same `PlanListPane` (data + create/duplicate/delete/
  rename) in the left column; the right column is either the character's
  current attributes (list route — round 26 replaced this round's "select a
  plan" placeholder, which only repeated what the list beside it said) or
  the full `PlanEditor` (editor route).
  Navigating between the two routes still unmounts/remounts that pane like
  any other route change; only switching which plan is open _within_ the
  editor route (`:planId` changing on the same route element) keeps it
  mounted.
- `SkillPlanEditor` widens from `max-w-3xl` to `max-w-5xl`, matching
  `SkillPlans`' round 19 tier — the two need one shared width now that they
  render as columns of the same page shape.
- The desktop-breakpoint media-query hook (`DESKTOP_QUERY` + the
  `isDesktop` state/effect pair) was identical in `Mail.tsx` and
  `Market.tsx` already; adding a third copy for SkillPlans was the trigger
  to extract it to `src/lib/useIsDesktop.ts` instead, adopted by all three.
