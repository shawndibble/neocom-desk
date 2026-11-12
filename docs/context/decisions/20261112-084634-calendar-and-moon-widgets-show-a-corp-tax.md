# Scope decisions — Calendar and moon widgets show a Corp Tax Book's moon owner pops (issue #6116)

_Recorded 2026-11-12 · issue #6116._

- **The Calendar, Due soon and the Moon extractions widget also read the moon owners' Extractions a Corp Tax Book holds.** A CEO who runs one book for many corporations looks for pops there, and those corporations are read by the book's grants, not by a stored Character with a corp grant. It rules out asking players to add every alt CEO as a Character just to see pops.
- **Who reads a book: a Character whose roles open the Moons page** (Director, Accountant, Junior Accountant; `canViewCorpTaxBook`), under the officer rules. A lapsed officer record is renewed once, as the book's other reads do. One Character per book; the active one when it qualifies.
- **ESI wins per corporation.** A corporation some Character reads from ESI keeps its ESI rows, and the book's copy is dropped, so no pop shows twice and the fresher read wins. Only the book's moon-owner rows are read (`sourceCorporationId` set); the book's own chunks already come from ESI.
- **Best effort, reused 5 minutes.** A book that cannot be read adds nothing and never turns a widget into Retry. A widget whose every ESI read failed still lists a book's pops. A failed book read is not reused.
- **No Corporation column in the widgets yet**, as decided on 2026-11-11 (`20261111-221423`). The Calendar names each event's corporation through its existing corporation filter.
- **Out of scope:** server-side alerts (push or mail) for moon owners' chunks.
