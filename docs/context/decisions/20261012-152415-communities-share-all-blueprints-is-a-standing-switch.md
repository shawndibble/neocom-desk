# Scope decisions — Communities: share all blueprints is a standing switch, one tab per kind

_Recorded 2026-10-12. Mockup: `docs/design/mockups/communities-share/`._

- **The Community page is one flat tab row: Blueprints, Fittings, (later) Skill plans, Members.** Tabs within tabs were rejected: two selected states at once, two rows on a phone, and Members is a peer of the others. The Community Library is no longer a tab; it opens from a button on Blueprints, with a Back button.
- **"Share all my blueprints" is a standing switch, like Fittings.** While on, a blueprint acquired later is shared too, so the choice is stored as share-all plus the blueprints stopped since (an exclusion list), not as an allowlist of type ids. Stopping one blueprint under share-all adds an exclusion; sharing it again lifts it.
- **With the switch off, blueprints are added one at a time from a search**, and stopped one at a time from the list. Turning the switch off asks first and then shares nothing, including blueprints picked one by one, as for Fittings.
- **The list on the page is the choice, not a picker.** Each shared blueprint has a Stop sharing button; the old "Choose what to share…" dialog and its market-group tree stay only on the join page.
- **Storage:** the allowlist row is unchanged; share-all is a second row under the same `communityShare:{characterId}:{communityId}` prefix (`…:all`, holding the exclusions), so existing logout and Character-removal cleanup covers it.
