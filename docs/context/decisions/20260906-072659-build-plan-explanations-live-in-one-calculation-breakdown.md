# Scope decisions — Build Plan explanations live in one Calculation Breakdown modal

_Recorded 2026-09-06._

- **One modal, not more tooltips.** Every "where did this number come from"
  answer for a Build Plan lives in the Calculation Breakdown, reached from a
  single trigger on the results panel. The per-row `InfoTooltip`s stay
  one-liners: a second sentence in a tooltip is unreadable on touch, and
  spreading the explanation across a dozen of them means no reader ever sees
  how the figures compose. Rules out per-row "explain this" affordances.
- **The breakdown quotes live values, it is not a help page.** Each section
  states the rule and then the same rule with this plan's own numbers
  substituted in, so it cannot be read as generic advice about EVE industry.
  It reads the fee percentages from `engine/industry/fees` (the same module
  `buildVsBuy` computed the result with) rather than from new `BuildResult`
  fields, so the explanation cannot drift from the arithmetic.
- **Three price facts are stated outright, because they are the ones that
  mislead.** Materials follow the plan's material price basis (sell or buy);
  the product is always the hub's lowest sell whichever side the materials
  use; owned units cost 0 ISK, so self-mined ore is free and no opportunity
  cost is charged for it. Refining is not modelled anywhere — a plan that
  consumes minerals prices minerals, never the ore behind them.
- **The break-even "?" is the door to the breakdown.** Its tooltip stays a
  one-liner and says "Click for the full breakdown", so the shallow answer and
  the deep one share one affordance instead of competing for the same row.
- **Owned stock gets a use-or-sell comparison, not just a zero.** Pricing owned
  units at zero answers "what does this job cost today" and is silent on the
  question a miner actually asks. The Use-or-Sell Check answers it by comparing
  the plan's profit against the Liquidation Basis proceeds; it is deliberately a
  read on the plan's own owned units, not a general "should I mine" tool.
- **Selling is quoted on both bases, buying is not.** Sell now and Sell order
  are computed together from the snapshot already in hand, so the toggle
  re-renders rather than refetches — the same rule the material price basis
  follows.
