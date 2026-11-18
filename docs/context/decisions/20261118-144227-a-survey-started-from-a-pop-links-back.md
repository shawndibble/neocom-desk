# Scope decisions — A Survey started from a pop links back to it (issue #6405)

_Recorded 2026-11-18 · issue #6405._

- **A pop's start link carries `pop=<popId>`**, kept out of the Survey's own start-link fields (it is
  not a Survey field). After the first scan creates the Survey, a signed-in pilot's app calls the
  router action `linkSharedPopSurveyCallable` (`corpTaxBookAction`, no new function). The short URL
  `/s/<id>` is unchanged and still how a Survey is shared.
- **The action checks the pop is shared with the caller now** by reusing `sharedPopsFor`, and that
  the Survey exists. It stores `popSurveyId` on the Extraction beside the officer's `surveyId`
  (additive; never touched by the sync). No rules, index or new collection.
- **Newest wins.** Publishing uses `popSurveyId` over `surveyId`, and an officer's `linkSurvey`
  clears `popSurveyId`, so the latest action of either kind shows. Any viewer can replace the
  link; an officer can always re-link.
- **Still gated by the ore setting** (see the officer-link decision): no ore make-up shared, no Survey id.
- **Best effort.** A failed callback never blocks the Survey; a signed-out start has no Character to
  call as, so it does not link.
