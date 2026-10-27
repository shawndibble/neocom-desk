# Scope decisions — Skill plan import applies without a preview unless a line fails

_Recorded 2026-10-22._

- **Import applies at once when every line parsed; the preview shows only when something failed.** A clean parse has nothing to review, so the Parse step and the paste-from-clipboard button (native Ctrl+V already works) are gone. A failed line, an unresolved EFT item or a file error still opens the preview first, because applying would silently drop it. Supersedes the "Import dialog already parsed" part of the 2026-10-08 pasted-plan decision: a clean paste now imports into its new plan with no dialog.
- **The File tab is folded into the paste dialog.** `.emp` exports from other planners are compressed, so they cannot be pasted and the file path stays; it is an "or choose a file" link plus drop on the dialog and on the plan editor, through the same import. Direct imports carry an Undo (10 s) since nothing was previewed.
