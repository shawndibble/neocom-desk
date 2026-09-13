# Scope decisions — Settings owns the reaction location default, and Shift narrows rather than blocks

_Recorded 2026-09-13._

- **The Reaction Location default gets its Settings control, closing a synced
  key that nothing could write.** `sync.industryReactionFacilityDefaults` has
  been on the allow-list, named in the FAQ's "What We Store" prose and read by
  `BuildPlanDetail` since issue #698 — with no `setValue` call site anywhere,
  so every plan's first Reaction Location was an unfitted Athanor no matter
  what the pilot wanted, and the FAQ described a setting that did not exist.
  The control mirrors the manufacturing facility block beside it rather than
  folding into it: a pilot's refinery and their factory are two standing facts
  that share no facility, and `normalizeReactionFacilityDefaults` already
  rejects a non-reaction pick, and `REACTION_FACILITY_PRESETS` is the one
  spelling of that restriction the Reaction Location picker already open-coded.
  The manufacturing picker is left offering every preset, refineries included
  — see the later decision on why that is correct rather than deferred.

- **Shift narrows a shortcut match instead of blocking every press.**
  `useKeyboardShortcuts` dropped any key held with Shift, which made `?` — the
  key a reader already reaches for to ask what the shortcuts are — impossible
  to bind at all on a layout that types it as Shift+/. Shift now leaves the
  early return, and a Shift-held press has to match a shortcut that opted in
  via `allowsShift`. Ctrl, Meta and Alt still bail unconditionally: this rules
  out `Cmd+K`-style bindings, deliberately, since those collide with the
  browser's own and nothing here needs them. Capital letters stay ordinary
  text — `shortcuts.test.ts` pins that only a key which is its own upper- and
  lower-case (`?`, not a letter) may opt in.

- **What counts as "an overlay owns the keyboard" moves into
  `lib/shortcuts.ts` as `OVERLAY_SELECTOR`, and grows two cases.** The guard
  matched `dialog[open], [role="menu"], [role="listbox"]`, which misses every
  Radix primitive that renders a plain `div` with `role="dialog"` (Popover,
  HoverCard) and misses the Market Compare drawer entirely — a deliberate
  non-modal `<section>` that already stopped Escape propagating, i.e. already
  believed it owned the keyboard while the global listener disagreed. The
  drawer opts in with a `data-keyboard-overlay` attribute rather than
  borrowing `role="dialog"`: it is not a dialog, and claiming the role to win
  a keyboard guard would announce it as one to every screen reader. This was
  a live bug for the shipped `c` shortcut, not only for the new `?`.
