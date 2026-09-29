# Scope decisions — make-or-buy advice counts the blueprint purchase, bought once per plan

_Recorded 2026-09-28._

- **A make-or-buy verdict charges the full Blueprint Acquisition cost to the
  build side — not a share of the blueprint's runs.** The verdict used to compare materials plus
  job fee against the buy price, while clicking "build" made the plan resolve
  and charge a Blueprint Acquisition tier. A component whose blueprint had to
  be bought read "build" and then deepened the plan's loss (a Pacifier's
  Sustained Shield Emitter: -6.4M to -13.4M). The pilot still has to buy the
  blueprint to build at all, so the whole price counts, even for a BPO
  that would outlive this plan. Quoted at the acquired tier's ME, honoring
  the include-blueprint-cost setting and a blueprint override price exactly
  as the plan total does, so the verdict predicts which way clicking moves
  the total. An **Auto Build** with the `cost-effective` **Build Strategy**
  inherits this, since it reuses the same verdict.

- **A blueprint is bought once per plan, not once per node.** Supersedes the
  "independently of every other node's" clause of
  `20260911-073307-blueprint-acquisition-cost-as-a-tier-optimized-material.md`
  for purchases: once a resolution pass buys a BPO, every later node needing
  that blueprint builds with it for free, and a bought BPC's unused runs are
  spent before another copy is bought. Tier selection per node is otherwise
  unchanged. Raising a plan's runs only buys more when a BPC's runs run out.

- **Blueprint Acquisition sizes BPC runs from units.** `acquisitionFor`'s
  `needed` is always units of the product and is converted to job runs
  inside the lookup; a nested node used to count units as runs, buying ten
  times the BPC runs for a recipe making ten units a run.

- **Out of scope:** the tooltip still ignores the account skill gate Auto
  Build applies, and each verdict (and each Auto Build node) is quoted
  against its own fresh blueprint pool, so a blueprint reached from two
  branches can be charged in both verdicts even though the plan pays once.
  A pilot-forced tier the app can't see (priced by override) is still
  charged at every node that needs it — nothing records it as bought.
