# Scope decisions — Corp Tax Book billing and forward-only Statements (issue #4055)

_Recorded 2026-10-18 · issue #4055._

D-numbers are the decision numbers in epic #4055.

- **Everyone in the observer ledger is billed (D2):** corp members, alts and
  guests. The book shows each one's current corp, corp members by default with a
  filter for the rest. Billing works with no app use on the miner's side: mail
  plus donation.
- **Valuation is the personal tab's engine (D11)**, so a corp member and their corp
  reach the same tax. The book has its own trade hub (Jita by default) and Ore
  Form (Compressed by default), both printed on every Statement. No refined
  value.
- **Rates: most specific wins (D3/D31).** Corp default → Guest default →
  per-moon → per-Miner → per-record (Miner beats moon: see the 20261020 "miner rate beats the moon rate" decision). Every rate has an effective-from date and
  is never retroactive. A per-record override is a logged officer correction,
  only on a day not yet on a Statement. Per-rarity rates come later (#4069).
- **Tax is owed per day per character, with a running balance per Miner
  (D4).** The Statement is monthly by default, configurable, and is what gets
  mailed.
- **Chunk ore and ISK (D13)** come from the ExtractionStarted notification,
  else a linked **Survey**, else "Ore unknown — link a survey". After
  fracture, mined vs left. Chunk volume per hour is configurable because
  sources disagree (#4070).
- **Lifecycle (D14):** Extracting → Ready → Fractured (laser fired, or
  auto-fracture at `natural_decay_time`) → Expired (fracture + 48h by default,
  overridable per structure up to 4 days). LaserFired and Cancelled
  notifications make the timeline exact.
- **Overdue comes 14 days (configurable) after a Statement is issued (D19).**
  No interest. Reminders are manual.
- **Minimum Statement 5M by default (D20)**, changeable by any book editor.
  Below it, the balance rolls into the next period.
- **Forward-only.** An issued Statement never changes. Corrections, and late
  ore for days not yet paid, go on the next Statement as labelled lines.
  Balance = Statements − payments − dismissals.
- **A paid Statement's days are closed for good (D22).** Late ore on them is
  logged as "Recorded after payment — written off" and never billed; officers
  see a count. "Rebill from date" can never reach a paid Statement, and for
  corp members it needs Director approval.
- **Day closing.** A UTC day becomes Billable only once day end + grace (6h by
  default, adjustable) has passed and an officer has synced after that.
- **Tolerance.** Payments within max(0.5%, 100k ISK) of a Statement settle
  it; the remainder is written off automatically and logged.
- **Paid stays paid in the personal tab, for everyone (D23).** ADR 0024. This
  reverses "paid and dismissed growth still flags" for paid entries
  (`20261004-135551-mining-tax-redesign-owed-first-combined-entries-edit.md`,
  `20260905-180422-moon-mining-tax-v1-implementation-choices.md`); dismissed
  growth still flags.
