# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the label strings used in this repo's issue tracker.

| Canonical role    | Label in our tracker | Meaning                                  |
| ----------------- | -------------------- | ---------------------------------------- |
| `needs-triage`    | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`      | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent` | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human` | `ready-for-human`    | Requires human implementation            |
| `wontfix`         | `wontfix`            | Will not be actioned                     |

Category roles: `bug`, `enhancement` (both already exist as default GitHub labels).

All five state labels exist in the repo. `/next-ticket` grabs open issues carrying `ready-for-agent`.

`in-progress` is a separate, sixth label — not one of the five canonical triage
roles above. It's a concurrency claim marker `/next-ticket` applies for the
duration of a run (see `docs/agents/issue-tracker.md` "Concurrency claim"), not
a triage state.

`hold-for-review` is a modifier, not a triage state. On a `ready-for-agent` ticket it makes `/next-ticket` open the PR without arming auto-merge, attach screenshots, release the claim and swap the ticket to `ready-for-human`. Used for UI tickets where the agent designs its own mockups. See `.claude/commands/next-ticket.md` "Hold for review".
