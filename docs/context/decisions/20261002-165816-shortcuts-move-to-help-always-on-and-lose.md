# Scope decisions — Shortcuts move to Help, always on, and lose slash

_Recorded 2026-10-02._

- **Keyboard shortcuts move from Settings to Help & FAQ, as its first tab
  (`/help/shortcuts`; `/help` opens on it).** A list to look up is help, not a
  setting. `/settings/shortcuts`, `/settings#shortcuts`, the `?` key and the
  palette's command all land there.
- **Supersedes `20260924-135633-single-key-shortcuts-get-an-off-switch-not`:
  single-key shortcuts are always on; the Settings off switch and its
  device-local `singleKeyShortcuts` setting are gone.** The owner's call.
  Known cost: WCAG 2.1.4 (Character Key Shortcuts, level A) asks that
  single-character shortcuts can be turned off, remapped, or limited to focus;
  with none of those, a speech-input user can fire one by saying a letter.
  Typing in a field still never fires one (`isTypingTarget`), and an open
  overlay still owns the keyboard.
- **`/` is removed.** It said "Jump to search" but only focused the Market
  browser's search box; the command palette (Ctrl+K / Cmd+K, the rail's Go to
  button) is the global search now. Market's focus-on-arrival hook went with it.
