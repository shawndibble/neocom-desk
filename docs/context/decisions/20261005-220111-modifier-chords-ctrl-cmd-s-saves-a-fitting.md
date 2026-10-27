# Scope decisions — Modifier chords: Ctrl/Cmd+S saves a fitting, Ctrl/Cmd+Enter submits a paste box

_Recorded 2026-10-05._

- **Three modifier chords, no new single letters.** Ctrl/Cmd+S saves the
  open Fitting, Ctrl/Cmd+Shift+S saves it as a new copy (only once there is an
  original to keep), and Ctrl/Cmd+Enter submits any paste box (`TextArea`'s
  `onSubmitChord`: Fit Import, Appraisal, the Fittings load card, the skill
  clipboard import, Ansiblex paste). Chords with Ctrl/Cmd are outside WCAG
  2.1.4's character-key rule and work inside text fields, like the palette's
  Ctrl/Cmd+K. Ctrl/Cmd+S always blocks the browser's "save page", even while
  Save is unavailable.
- **Not added:** more single-letter page jumps (ten are taken and Ctrl/Cmd+K
  reaches every page), browser-owned keys (Ctrl+F/P/W/T/N/R), and Ctrl/Cmd+Enter
  on the EVE mail compose box (sending a mail is not undoable by Back).
- **Undo is the browser's Back button.** A Fitting's edits live in the URL, so
  Back steps through them; no Ctrl/Cmd+Z handler. Help › Shortcuts says so.
