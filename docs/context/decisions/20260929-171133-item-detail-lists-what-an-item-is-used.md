# Scope decisions — Item Detail lists what an item is used in

_Recorded 2026-09-29._

- **Item Detail gets a "Used in" section: every product whose blueprint or
  reaction formula consumes the item, with its quantity per run.** Each row
  carries the full item menu (Build Plan, View in Market, Show info…), so a
  component is a starting point for planning what it feeds. This is the
  full-SDE reverse index round 49 declined for Assets' "View in Industry as
  material" — that action still links off the character's own Build Plans;
  here the question is "what is this for", which the character's plans can't
  answer.
- **Blueprints and reactions only, not PI schematics.** Planetary commodities
  already get "Planetary production" (how it's made); a PI "used in" is a
  separate ask.
- **50 rows at a time behind "Show more", with a name filter past 10.** A
  mineral feeds thousands of blueprints and every row is a full item menu.
- **One row per product, from the blueprint Build Plan opens for it**
  (`byProductTypeID`), so the quantity per run matches the plan.
- **The section loads the blueprint catalog itself** and renders nothing if it
  fails, or on a surface without Item Actions (a shared, read-only view).
