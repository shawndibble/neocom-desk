# Scope decisions — Corp Tax Book billing and forward-only bills (issue #4055)

_Recorded 2026-10-18 · issue #4055._

The calendar bill, its cadence, its roll-over minimum and its 100k tolerance floor below are superseded by decision 20261120-235011: every book is a Running account, and what is mailed is a Late notice. The other bullets still hold.

D-numbers are the decision numbers in epic #4055.

- **Everyone in the observer ledger is billed (D2):** corp members, alts and
  guests. The book shows each one's current corp, corp members by default with a
  filter for the rest. Billing works with no app use on the miner's side: mail
  plus donation.
- **Valuation is the personal tab's engine (D11)**, so a corp member and their corp
  reach the same tax. The book has its own trade hub (Jita by default) and Ore
  Form (Compressed by default), both printed on every Late notice. No refined
  value.
- **Rates: most specific wins (D3/D31).** Corp default → Guest default →
  per-moon → per-Miner → per-record (Miner beats moon: see the 20261020 "miner rate beats the moon rate" decision). Every rate has an effective-from date and
  is never retroactive. A per-record override is a logged officer correction,
  only on a day not yet closed. Per-rarity rates come later (#4069).
- **Tax is owed per day per character, with a running balance per Miner
  (D4).** The book first billed a monthly calendar bill (configurable) and
  mailed that; each closed day is now billed on the Miner's **Running account**
  as it closes, and a **Late notice** is what gets mailed.
- **Chunk ore and ISK (D13)** come from the ExtractionStarted notification,
  else a linked **Survey**, else "Ore unknown — link a survey". After
  fracture, mined vs left. Chunk volume per hour is configurable because
  sources disagree (#4070).
- **Lifecycle (D14):** Extracting → Ready → Fractured (laser fired, or
  auto-fracture at `natural_decay_time`) → Expired (fracture + 48h by default,
  overridable per structure up to 4 days). LaserFired and Cancelled
  notifications make the timeline exact.
- **Overdue comes 14 days (configurable) after a Late notice goes out while
  its days are unpaid (D19).** No interest. Reminders are manual.
- **A minimum before mailing (D20)**, changeable by any book editor. It was
  a 5M calendar-bill minimum whose balance rolled into the next period; it is
  now the least a Miner must owe before a Late notice goes out.
- **Forward-only.** What was billed never changes. Corrections, and late ore
  for days not yet paid, are billed as labelled lines on the Running account.
  Balance = billed days − payments − dismissals.
- **A paid day is closed for good (D22).** Late ore on them is
  logged as "Recorded after payment — written off" and never billed; officers
  see a count. "Rebill from date" can never reach a paid day, and for
  corp members it needs Director approval.
- **Day closing.** A UTC day becomes Billable only once day end + grace (6h by
  default, adjustable) has passed and an officer has synced after that.
- **Tolerance.** Payments within max(0.5%, 100k ISK) of a calendar bill
  settled it, with the remainder written off and logged. The tolerance is now
  per day, in percent, with no ISK floor (decision 20261117-033049).
- **Paid stays paid in the personal tab, for everyone (D23).** ADR 0024. This
  reverses "paid and dismissed growth still flags" for paid entries
  (`20261004-135551-mining-tax-redesign-owed-first-combined-entries-edit.md`,
  `20260905-180422-moon-mining-tax-v1-implementation-choices.md`); dismissed
  growth still flags.
