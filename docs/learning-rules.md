# Learning evidence and compatibility

These are app study recommendations, separate from the official exam pass conditions. Dates use `Asia/Ho_Chi_Minh`.

## Events and coverage

- `questionEvents` records presentation, teaching completion and blank paper outcomes separately.
- `attempts` retains submitted-answer events and explicit `exam-blank` outcomes. Only a valid, non-empty `answerId` contributes to answered-question coverage or another-day coverage.
- A mock's blanks still count as wrong for scoring and can require a recheck of an already learned item. A never-answered blank remains eligible for new teaching.
- The daily new-content recommendation counts first teaching answers at levels 0–3. Timed and untimed diagnostic papers do not consume it. `Learn more` deliberately starts another recorded study session.

## Confidence, assistance and mastery

Confidence is `sure`, `unsure`, `guessed` or `unrated`. There is no default Sure. Papers collect optional `unsure` / `guessed` flags before feedback; otherwise their answers remain unrated. Strict scores remain useful evidence separately from explicit confidence. Timed and untimed papers retain separate modes.

Mastery requires three explicitly confident, correct, unaided responses at levels 3–4 on different Vietnam-local dates, with a gap of at least three days between consecutive qualifying dates. A new wrong answer resets the qualifying sequence. Explicit uncertainty requires a cold recheck; an assisted success cannot resolve an outstanding error.

Correct assisted revision preserves existing qualifying dates and mastery evidence. It records the latest assistance independently and does not postpone the outstanding retrieval date. Simply choosing English does not revoke historical achievement.

`exposures` stores the most recent answer/translation exposure per question. Feedback, a translation, a phrase gloss, a reading breakdown or contextual repair is exposure. A retry within **24 hours** is a repair check and cannot add independent recall. Help already used stays attached when changing support, including bilingual text visible without a reveal click. Exposure and sessions survive reloads and backups. The explicit Retrieve tomorrow action saves a delayed check, which appears in due reviews and stays pending until an unaided retrieval after its scheduled date. A completed-paper explanation records exposure when the learner actually opens its disclosure.

The 24-hour delay is an explicit conservative product rule. It is not an official examination rule and does not establish a probability of retention.

## Current readiness and historical achievement

Historical scores and established mastery remain visible. The current “strong study evidence” recommendation requires:

1. Every item answered and revisited on another local day, with no overdue question reviews.
2. All 20 motorcycle-critical items meeting the mastery recommendation.
3. Each critical item checked unaided within seven days, with its retrieval date not overdue.
4. The last ten strict mixed mocks within 14 days scoring 24–25/25 without a critical error.
5. Those recent mocks spread across at least three Vietnam-local days.
6. At least eight of those ten mocks finished within 16 minutes.

The dashboard shows when evidence was last collected. Expired profiles cannot establish current-format readiness. These conservative targets are distinct from the legal A/A1 pass marks.

## Study selection and timing

New-content selection rotates critical rules, signs, junctions, other rules, culture and technique. This adaptive mix never changes the fixed mock blueprint. Due and repeated-error work is prioritised while reserving room for new teaching.

A supported exam date raises the daily recommendation to cover remaining teaching items while reserving seven days for retrieval. It is a workload suggestion, not a forecast that the learner will finish or master the bank. A deadline after 28 February 2027 is explicitly unsupported by this bank.

After five usable measurements, the duration estimate uses the median of the last 40 active question times, excluding background tabs. Very short accidental visits and measurements longer than 30 minutes are excluded. Exam time remains wall-clock time; it always continues in the background. Per-question active time and visits are distinct from paper duration. Old records without real per-item timings remain unmeasured.

Support recommendations start new items at the learner's preferred level, offer phrase help during development or repair, and start familiar items in Vietnamese. Learners can override the current item. A session can contain different levels.

## Phrase scheduling and repair

Daily phrase queues are finite, mix due and new phrases, and prioritise critical-question relevance, phrase priority and frequency. Wrong answers reset spacing to one day. Intervals 1, 3, 7, 14 and 30 days advance only on a different local date and when the prior review is due. Same-day repetition cannot accelerate them.

Contextual repair preserves the originating question and session position. The original occurrence is used first; another occurrence is explicitly labelled transfer practice. Empty linked lists have a clear fallback. Saved personal spans stay distinct from source or reviewed teaching content. Teaching activities never change official text, figures, keys or option order and never appear inside strict papers.

## Migration policy

The storage database remains `duong-learning-v1`, backup `schema_version: 1`. The learning evidence revision is `evidence_version: 2`; original-format exports remain importable through validation and migration.

- Every old attempt ID, selected answer, timestamp and exam result is retained.
- Old level-4 confidence was inferred by the application, so it becomes `unrated`; `legacyConfidence` retains the old value for audit and `confidenceSource: legacy-inferred` prevents it being interpreted as an explicit learner rating.
- Old blanks are labelled `exam-blank` and excluded from coverage. Their saved paper score is unchanged.
- No historical confidence or per-question active time is invented. Legacy study feedback exposure is conservatively derived from the existing answer-submission timestamp; the migration does not guess when collapsed paper explanations were read.
- Exposures, question events, personal phrases and resumable sessions are included in exports and validated on import. Existing immutable events win duplicate IDs; exposure merges retain the more recent timestamp.
- A validated pre-import state is retained as the local rollback point.

The official question JSON, phrase source dataset, original figures and exam profiles are unchanged from reviewed deployment `d200cc6918694be332744bd138fc280a0b6f2607`.
