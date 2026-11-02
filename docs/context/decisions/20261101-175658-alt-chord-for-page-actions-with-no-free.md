# Scope decisions — Alt chord for page actions with no free Ctrl/Cmd chord

_Recorded 2026-11-01._

- **Alt+J (Option+J on Apple) opens the Appraisal in Janice.** The Ctrl/Cmd
  chord that would fit (Ctrl+Shift+J) is the browsers' DevTools console, which a
  page cannot override, and a bare `J` would be a single-character shortcut
  under WCAG 2.1.4. An Alt chord is outside that rule, collides with no browser
  shortcut, and works inside the paste box. It is matched on the physical key
  (`event.code`), because Option+J types `∆` on a Mac. Shown as `Alt J` / `⌥J`
  beside the menu entry and in Help › Shortcuts.
- **The chord is live only while it can act.** With no pasted text, a request in
  flight or a modal open, it is not intercepted, so Option+J still types `∆`.
- **Not added:** an Alt chord for anything that already has a Ctrl/Cmd chord.
