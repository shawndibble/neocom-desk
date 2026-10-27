# Scope decisions — Pasted skill plan opens a new plan with Import ready (issue #2981)

_Recorded 2026-10-08 · issue #2981._

- **A pasted skill plan opens a brand-new plan in the Skills planner with the Import dialog already parsed.** Importing appends to a plan and a paste cannot say which one was meant, so touching an existing plan is ruled out; the cost is a stray empty plan if the pilot cancels the dialog (deletable like any plan).
- **A paste is a skill plan only when every non-blank line parses as a skill at level 1-5.** Skill books are market items, so "Gunnery 5" is ambiguous; any quantity (`x2`, `500`), price or non-skill name makes the Appraisal parse it instead. The check runs before the Appraisal's majority test, after the EFT test.
