# Scope decisions — A plan opened from a Ranked builds or Owned blueprints row is the plan Add to Compare would make

_Recorded 2026-10-27._

- **A click on a Ranked builds or Owned blueprints row opens the plan "Add to Compare" would make from it, not a blank plan for the same blueprint.** The row's ISK/hour counts the materials the pilot already holds as free (the owned-materials claim, `ownedMaterialSourcing`); `createPlan` started a new plan with no claim, so the plan page read an Infiltrator I at 8K ISK/hour against the row's 144.5K. The click now seeds the plan with the row's own blueprint (that copy's ME/TE and runs), its owned-materials claim, its build-here picks and its hub (`planForOpportunityCandidate`, the same call Add to Compare makes), so the two agree. This is the existing rule from `planForOpportunityCandidate`'s own doc comment, applied to the click path it had missed.
- **A row with no pricing behind it opens a plain plan.** A corporation's blueprint, or a row not yet ranked, has no claim to carry, so it opens as before.
- **Not changed: owned stock counts as free in the row.** The claim is a judgement the rows already made (what can I build from what I hold); the plan now shows it as "Have N" on each material, where the pilot can drop it. Pricing held materials at their market value instead would be a different rule for rows and is not decided here.
