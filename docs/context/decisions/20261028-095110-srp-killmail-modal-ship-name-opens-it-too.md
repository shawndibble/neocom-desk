# Scope decisions — SRP killmail modal: ship name opens it; Too-old losses are not listed (issue #5379)

_Recorded 2026-10-28 · issue #5379._

- **Too-old losses are not listed in "Or pick a lost ship".** Nothing can be filed for them, so a row only adds noise; pasting a link still reaches the server's `outside-window` refusal. The `old` row pill is gone.
- **Ship name override (§6c Entities): on the SRP member page a lost ship's name opens its killmail modal, not Show info.** The row's question is "what would I be repaid, and is my fit right?"; the modal shows the hull and fit anyway. It is the row's one accent cue (a row that opens a modal). The one step away: none needed, the modal carries the hull.
- **Repayment is hidden when it exceeds the Jita value of the lost ship and fit (no cargo)**; an officer reviews instead. Equal is shown. With no value to compare, it is shown.
- **Officer appraisal comparison prices modules and rigs only** (hull + modules + rigs on both sides), the parts a Doctrine Fit lists, so the percent difference compares like with like.
