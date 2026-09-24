# Scope decisions — Single-key shortcuts get an off switch, not remapping (issue #1494)

_Recorded 2026-09-24 · issue #1494._

- **One Settings checkbox turns every single-key shortcut (`/`, `c`, `,`, `?`)
  off; there is no per-key remap and no "require a modifier" mode.** WCAG
  2.1.4 is satisfied by any one of off / remap / focus-only, and off is the
  one that fully fixes the accidental-trigger case (speech input, tremor)
  without inventing a remap UI nobody asked for. Escape is untouched — it was
  never dispatched by the listener; the native `<dialog>` owns it.
- **Device-local (`singleKeyShortcuts`), not synced.** The need follows the
  input device, not the pilot. Default on, preserving prior behaviour.
- **The shortcut list stays visible when off**, dimmed with a note, rather
  than hidden — it is also where the switch lives, and `?` can no longer
  reach it, so the page must still explain what was turned off.
