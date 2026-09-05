# Scope decisions (round 35) — the corp access gate

_Recorded 2026-09-03._

- **Corp UI hides, it never locks.** `none` and `roles-without-grant` both
  render nothing at all — no nav item, no tab, no lock marker. This departs
  from the app-wide `ScopeGate`/`useLockedRoutes` idiom, where a missing scope
  shows a lock the user can act on, and the reason is that a role is not
  something re-authing can fix. Offering a Character a lock they can never open
  is the `ReauthBanner`-over-a-403 failure `ScopeGate.tsx` already warns about,
  made routine. The grant for `roles-without-grant` is offered by the prompt
  and the Settings row from the incremental-auth work, never by the nav.
- **`unknown` renders as `none`** — as nothing, never a placeholder or a
  spinner. A nav item that flickers into existence a beat into load is worse
  than one that appears a beat late. `useCorpAccess` reports the state and
  nothing more; the rule above is what every consumer branches on, and only
  `ready` renders.
- **A roles read that could not complete stays `unknown`, and there is no error
  state.** `none` is a claim — "this Character holds no corp role" — and a read
  that never landed is no evidence for it, so a Director who cold-starts
  offline must not be pinned to `none` for the session. Both render nothing, so
  the distinction is invisible to the user and only ever costs a beat. `roles`
  is the one corp-adjacent endpoint with no role gate of its own, so for a line
  member it genuinely _succeeds_ and returns an empty set: a failure there is a
  network problem, never "you are not a Director".
- **`esi-characters.read_corporation_roles.v1` joins the base `SCOPES` set**,
  alone among the corp-adjacent scopes. It is cheap, ungated, and every corp
  surface downstream needs it for _every_ Character in order to know whether to
  render at all — a scope that decides visibility cannot itself be opt-in. The
  other corp scopes stay out of the base grant and arrive behind the opt-in
  Scope Group of round 37.
- **The two halves of the gate live on opposite sides of the engine boundary.**
  Role -> Corp Capability is pure game logic in `engine/corpRoles.ts`; Corp
  Capability -> scope is an ESI concern in `features/corp/corpScopes.ts`,
  because `src/engine` may never import `esi/registry.ts`. Since round 37 those
  scope strings are typed as the registry-derived `Scope` union, so an
  unregistered one is a build error, and the map is a _selection_ from
  `ESI_REGISTRY` rather than a second copy of it.
- **Only the corporation-wide `roles` array counts.** The `roles_at_hq` /
  `roles_at_base` / `roles_at_other` grants apply at one office and do not open
  the corporation-wide endpoints each capability stands for.
- **`ready` is judged per capability held, not against one corp bundle.** A
  Factory_Manager who is not an Accountant is `ready` once the industry scope
  is granted, rather than being held at `roles-without-grant` forever by a corp
  wallet scope their roles make useless. This settles what the four states mean
  here; how the grant is subsequently offered is the incremental-auth
  ticket's to decide.
