# Scope decisions — Training shows the typed-in accelerator's expiry by default

_Recorded 2026-11-03._

- **The Training widget carries the accelerator's expiry, as a Widget Show: "Skills and accelerator" (the default) or "Skills only".** A cerebral accelerator running out is a skill-training fact, so it lives on the widget that already answers "what is my training doing", not a widget of its own. It leads the table and list (so "+N more" never hides it) and is a deadline for the header's Next chip. Only a typed-in accelerator counts: a Detected Accelerator has no expiry (GLOSSARY.md **Accelerator**), so there is nothing to count down.
- **Omega expiry is not part of this.** ESI does not report it and the app stores only an Alpha/Omega flag, so a date would have to be typed in per Character. Left for its own ticket.
- **A table's first column reserves an icon column only while some row draws a severity icon.** It used to reserve it always, so on most widgets every first-column label sat about 22px right of its header. The header takes the same indent when the column exists.
