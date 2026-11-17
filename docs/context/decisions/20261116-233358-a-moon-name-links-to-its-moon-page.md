# Scope decisions — A moon name links to its moon page from the Extractions tab (issue #6299)

_Recorded 2026-11-16 · issue #6299._

- **On the Extractions tab a moon name is a real link to the moon page, though the row click opens the Extraction.** The row's click and the name go to two different pages (an Extraction vs every Extraction of that moon), so the name is not a duplicate cue. This is an exception to §6c's "a row's primary action beats name links inside it"; recorded in §6c Overrides.
- **A moon is known by its `moonId`; the list is built from the book's Extractions.** `/corp/moons/moons/:moonId`. A refinery with no Extraction yet has no known moon (decision 20261115-173527) and is not listed.
