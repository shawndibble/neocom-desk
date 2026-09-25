# Scope decisions — Saved Fittings carry notes

_Recorded 2026-09-25. Amends `20260925-152418` (the Start screen preview) and the "a saved Fitting is just its name and share code" line in `src/features/fittings/myFittings.ts`._

- **A saved Fitting has optional free-text notes, up to 500 characters.** They are a field on the saved record (`FittingRecord.notes`), synced like the name and code (last-write-wins on `updatedAt`; "none" travels as an empty string because Firestore rejects `undefined`), and edited on the Start screen's Notes tab, saved when the field loses focus. The Share Link is unchanged: notes are not part of the fit's code, so a shared or compared link never carries them.
- **Notes are the description on Save to EVE.** Saving the open saved fitting to the game sends its notes as ESI's description (also capped at 500 characters, ESI's limit), and an In-game fitting's description shows read-only on its Notes tab. Notes are not read back from the game into a saved record: In-game fittings are a separate list, opened rather than imported.
- **Renaming or re-saving never drops notes.** A save that names no notes keeps the record's existing ones; only an explicit empty string clears them.
- **Not included:** editing notes inside the editor (they are edited from the Start screen), and notes on a fitting that is not saved.
