# Scope decisions — corp role gating: one rule for the Corporation option (issue #4739)

_Recorded 2026-10-22 · issue #4739._

- **The Corporation option follows ESI's `x-required-roles`, nothing more.** A read that names a role shows only to a Character holding scope and role; a read that names none (corp contracts) shows on scope alone. Contracts' scope-only gate and Market orders' role gate are both correct. Rules out copying one page's gate onto the other. Evidence: `docs/research/corp-role-gating.md`.
- **No role means no option, not a locked one.** Consistent with GLOSSARY round 35; a direct `/corp/*` link lands on `CorpDenied`.
- **`corpRoles.ts` matches the spec** for every capability; no change. One read is gated wrong: `/corporations/{id}/divisions` is Director-only but loads under `canReadWallet`. Follow-up: #4756.
