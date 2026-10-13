# Scope decisions — React Compiler in annotation mode

_Recorded 2026-10-13._

- **React Compiler runs in `annotation` mode only.** Only files with a `'use memo'` directive compile. A component the compiler rejects is skipped silently, so a blanket "compile everything" switch would hide the ~226 of 664 component files that have a rejected component today. Opt-in pages first; widen once the rejects are fixed. Rules out `infer` mode for now.
- **A page that breaks the rules gets no gain and no error.** Measured on `DataTable` with an inline-`columns` consumer: 2,800 → 0 cell renders when it compiled, no change when it bailed.
