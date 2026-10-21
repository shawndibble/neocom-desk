# Scope decisions — Corp contracts is open to every member and additive (issue #4607)

_Recorded 2026-10-20 · issue #4607._

- **`canReadContracts` is held by every corp member and is additive.** ESI's corp contracts routes carry no `x-required-roles`, so `corpCapabilities` grants it whatever the roles, and a member holding no role is not hidden from it. Its scope, `esi-contracts.read_corporation_contracts.v1`, joins the corp group and `ADDITIVE_CORP_CAPABILITIES`: a Character who granted the group earlier stays `ready`, the widget stays undrawn, and nothing reads the feed into a 403 until the scope arrives.
- **It never opens a corp surface by itself.** `hasAnyCorpCapability` ignores it, so a member with no corp role still gets `none` and no Corp nav. The Corp overview's Contracts widget is therefore reached by role holders; a plain member sees contracts through the Contracts page's Corp view (the remaining half of #4607).
- **Rules out** a role-gated guess (Director/Accountant only) that would hide contracts from the members ESI lets read them.
