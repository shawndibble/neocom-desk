# Scope decisions — Dev and production share one Firebase project

_Recorded 2026-10-19._

- **`dev.neocomdesk.com` and `neocomdesk.com` share one Firebase project, so one set of synced data.** A Firestore uid is `char:<characterId>` (`uidForCharacter`), with no notion of which site or EVE application signed in, so a Character sees the same plans, fittings and settings on both. Shawn chose this over a separate dev project or a `dev:`-namespaced uid: real data on dev is useful and a second project doubles the deploys. It rules out destructive testing on dev, and it means anything `develop` writes to Firestore must stay readable by the `main` build: schema changes are additive and backward-compatible, and a migration ships to `main` before anything depends on it. Functions, rules and indexes are one deployment either way, deployed by hand; a new EVE client ID (the dev app has its own) goes in `functions/.env`'s `EVE_CLIENT_ID` list.
