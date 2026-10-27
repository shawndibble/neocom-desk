# 0004 — Radix for menu primitives only

## Status

Accepted (2026-08-30). Amended by ADR 0008 — `Tooltip` also moved to Radix,
for collision-aware placement; the "and nothing else" below no longer holds
for `Tooltip`, but does for every other hand-rolled primitive.

## Context

The Market Browser needs a right-click context menu, a dropdown menu and a
select — three components the design system does not have, and three of the
harder ones to get right: focus movement, typeahead, roving tabindex, submenu
timing, and correct behaviour under a screen reader. The components the app
already hand-rolls are the ones the platform supports well: `Modal` is a native
`<dialog>`, and `Tooltip` is CSS hover and focus-within.

## Decision

Adopt the single `radix-ui` package for menu-family primitives (ContextMenu,
DropdownMenu, Select) and nothing else. Every Radix part is wrapped in
`src/components/ui`, so no call site imports Radix directly. The existing
primitives stay as they are.

## Consequences

- Two component idioms coexist. That is deliberate: a library dialog would be a
  downgrade from the native one, which gets top-layer placement, background
  inertness and Escape handling from the platform for free — and `DESIGN.md`
  already rules out hand-rolled focus traps.
- The wrapper boundary is what makes the choice reversible. Swapping Radix out
  means rewriting a handful of files in `components/ui`, not every menu in the
  app.
- Radix is unstyled, so it inherits the existing Tailwind tokens rather than
  bringing a competing theme.
