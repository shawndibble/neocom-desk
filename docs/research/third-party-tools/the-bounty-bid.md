# The Bounty Bid

Thread: https://forums.eveonline.com/t/introducing-the-bounty-bid/519299 | read 2026-10-07 (.json summary; thebounty.bid not fetched)

## What

Player-run bounty board. Sponsors send ISK to "Officer Bounty" with reason "Bounty: <pilot>". Server watches killmails, pays hunters monthly manually. Needs a trusted server holding ISK.

## Features

| Feature                                                                                          | Tool does                  | Neocom Desk  | Evidence                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------- | ------------ | ------------------------------------------------ |
| Sponsor-funded bounty pool, payout 70% of (Jita sell of kill loss - Platinum insurance), 10% fee | yes                        | OUT OF SCOPE | needs custody of ISK + server; third-party trust |
| EVE-mail notice to bounty target                                                                 | yes (10 rotating messages) | OUT OF SCOPE | server sends mail                                |
| Killmail eligibility tracking                                                                    | yes                        | n/a          | no companion value                               |

## Calculations worth borrowing

- Kill value = Jita sell of destroyed ship+items (dropped excluded, implants included) minus insurance payout. Only relevant if we ever show "your loss value net of insurance" (no insurance hits in docs/features; insurance table is ESI /insurance/prices, public). Low priority.

## Candidate gaps

None credible. Replies: trust (4-day-old char), self-claim abuse, weak incentive.

## Out of scope

Whole service: escrow/server-side, trust model.
