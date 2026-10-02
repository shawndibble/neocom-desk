# Scope decisions — Page-level paste offers Fittings or Appraisal

_Recorded 2026-10-01._

- **A paste made outside any field offers a destination; it never navigates on its own.** Ctrl+V / Cmd+V on a signed-in page with an EFT fit raises a toast, "Open in Fittings", and with an item list, "Appraise". The pilot may have pasted by accident, or be mid-edit on the page they are on, so a misread paste costs a toast that times out, not a lost page. There is no preview of the parsed rows: the button opens the fit (or the appraisal) directly, and the destination itself is the preview.
- **A paste into a field, or while an overlay is open, is left to that field.** Same guard as the single-key shortcuts (`OVERLAY_SELECTOR`), so the search box, the Fittings Load box and the Skill Planner's import dialog keep their own paste behaviour.
- **Conservative matching: unrecognised text is a no-op.** A fit needs an EFT header naming a hull (a type under the Ships root Market Group, so special-edition hulls count); an item list needs a strict majority of its lines to be market item names. URLs, chat lines and prose raise nothing. Share Links and killmail links are out of scope for now, although Fittings' Load reads them.
- **Desktop only in practice.** Phones have no page-level paste gesture; the Fittings Load box and the Appraisal box remain the way in there.
