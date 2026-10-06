# Scope decisions — PI quick win stays within one system (issue #2703)

_Recorded 2026-10-05 · issue #2703._

- **A quick win must be doable within one system.** Supersedes the last bullet of 20261005-123211: "room for factories" still reuses the network plan's opportunities, but a win routed from a colony in another system is dropped (a haul, not a quick win), as is one whose source system is unknown. Wins fed by the host's own surplus, a same-system colony's surplus, or bought inputs stay. No separate hauling option is shown: the Colonies/Map tabs own cross-system logistics. Pilots in nullsec, where colonies sit in different systems, therefore see fewer factory wins; the headline totals sum only what survives.
- **Known limit: the filter runs after the network plan.** The plan allocates surplus across all colonies first, so a win it routed from another system is dropped even if a same-system colony could have fed it; the same-system variant is never generated. Accepted as the simple, honest option; restricting the plan's sources by system is the follow-up if it bites.
