# Scope decisions — Owned abyssal modules are ranked by effect on the fit, not inventory management (issue #5801)

_Recorded 2026-11-01 · issue #5801._

- **The owned-module list is a choice among modules the pilot already owns, by effect on the open fit.** It is not inventory management: no inventory page, collections, notes or contract search (ADR 0013). Rows show no price.
- **A price is offered only per row, on a press, through the existing abyssal estimate line.** That keeps the explicit-import consent flow (decision 20261016-085744) out of a list; nothing calls MutaMarket until asked.
- **Only the best-rolled 8 are evaluated.** Each is a worker compare; the list says "showing 8 of N". Default order is budget-fitting first, then better minus worse whole-fit changes, then roll quality.
- **No new evaluator API.** A candidate is the open Fitting after `setModuleMutation`, run through the existing `VariantEvaluator.compare`, so a row equals the fit after the pick.
