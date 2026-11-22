# Scope decisions — Vetting Skills table links skills to the reader's Skill modal (issue #6654)

_Recorded 2026-11-22 · issue #6654._

- **The skill name in the Vetting raw data Skills table is a `SkillLink`; the modal is the reader's reference view.** `SkillDetailModal` shows the active character's trained levels, while a vetting row may belong to another character. The row's own level stays in the table (`SkillBar` in the next column). Ruled out here: a modal mode hiding trained-state and plan-add for a non-active character; if the mismatch proves misleading, that is a separate ticket.
