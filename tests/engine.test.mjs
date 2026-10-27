import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  generatePaper,
  validatePaper,
  scorePaper,
  independent,
  reviewState,
  readiness,
  hasAnswer,
  migrateState,
  validateBackup,
  mergeBackups,
  recentExposure,
  dailyPlan,
  recommendedSupport,
  phraseReviewState,
  phraseDailyQueue,
  profileValid,
} from "../engine.mjs";
import { criticalProgress } from "../critical.mjs";
const bank = JSON.parse(
  readFileSync(new URL("../data/questions.json", import.meta.url)),
);
const questions = bank.questions,
  profiles = JSON.parse(
    readFileSync(new URL("../data/exam_profiles.json", import.meta.url)),
  ).profiles;
const phrases = JSON.parse(
  readFileSync(new URL("../data/phrases.json", import.meta.url)),
).phrases;
const p = profiles[0],
  byId = new Map(questions.map((q) => [q.id, q]));
const at = (day) =>
  Date.parse(`2026-10-${String(day).padStart(2, "0")}T05:00:00Z`);
const answer = (id, day, extra = {}) => ({
  id: `${id}-${day}`,
  questionId: id,
  answerId: byId.get(id).correct_option_id,
  correct: true,
  at: at(day),
  startedAt: at(day) - 60000,
  level: 3,
  support: [],
  confidence: "sure",
  mistakes: [],
  ...extra,
});
const paper = (day, seed = `day-${day}`) => {
  const ids = generatePaper(questions, p, seed).ids,
    answers = Object.fromEntries(
      ids.map((id) => [id, byId.get(id).correct_option_id]),
    );
  const startedAt = at(day),
    finishedAt = startedAt + 15 * 60000;
  return {
    id: seed,
    ids,
    answers,
    startedAt,
    finishedAt,
    deadline: startedAt + p.duration_seconds * 1000,
    status: "completed",
    timed: true,
    level: 4,
    mode: "exam",
    profileId: p.id,
    bankVersion: bank.bank_id,
    result: scorePaper(questions, p, ids, answers),
  };
};
const fresh = () => ({
  schema_version: 1,
  evidence_version: 2,
  bank_version: bank.bank_id,
  preferences: {
    level: 0,
    dailyLimit: 8,
    profileId: p.id,
    theme: "system",
    dailyMinutes: 20,
    examDate: "",
    adaptiveSupport: true,
  },
  attempts: [],
  exams: [],
  phraseAttempts: [],
  bookmarks: [],
  mistakeEdits: [],
  exposures: {},
  questionEvents: [],
  savedPhrases: [],
  delayedChecks: {},
  studySession: null,
});
const check = (data) =>
  validateBackup(data, bank.bank_id, new Set(byId.keys()), questions, profiles);

test("one answered paper item and 24 blanks score strictly but add coverage of one", () => {
  const e = paper(26);
  const id = e.ids.find((id) => !byId.get(id).critical_for_motorcycle);
  e.answers = { [id]: byId.get(id).correct_option_id };
  e.result = scorePaper(questions, p, e.ids, e.answers);
  assert.equal(e.result.correct, 1);
  assert.equal(e.result.unanswered, 24);
  assert.equal(e.result.criticalWrong, true);
  assert.equal(e.result.passed, false);
  const attempts = e.ids.map((qid) =>
    answer(qid, 26, {
      id: `${e.id}-${qid}`,
      answerId: e.answers[qid] ?? null,
      correct: !!e.answers[qid],
      level: 4,
      confidence: "unrated",
      mode: "exam",
      sessionId: e.id,
      at: e.finishedAt,
    }),
  );
  const r = readiness(questions, attempts, [e], at(27), profiles);
  assert.equal(r.coverage, 1);
  assert.equal(attempts.filter(hasAnswer).length, 1);
  const plan = dailyPlan(questions, attempts, fresh().preferences, at(27));
  assert.equal(plan.newToday, 0);
  assert.equal(plan.remaining, 250);
  assert.ok(plan.newIds.length);
  assert.equal(criticalProgress(questions, attempts, at(27)).unseen, 20);
});

test("exam confidence is unprovided or explicitly flagged; a correct score never invents Sure", () => {
  const e = paper(26),
    data = fresh();
  data.exams = [e];
  data.attempts = e.ids.map((id) =>
    answer(id, 26, {
      id: `${e.id}-${id}`,
      at: e.finishedAt,
      level: 4,
      confidence: "unrated",
      mode: "exam",
      sessionId: e.id,
    }),
  );
  assert.ok(data.attempts.every((a) => !independent(a)));
  assert.doesNotThrow(() => check(data));
  e.flags = { [e.ids[0]]: "guessed" };
  data.attempts[0].confidence = "guessed";
  assert.doesNotThrow(() => check(data));
  data.attempts[1].confidence = "sure";
  assert.throws(() => check(data), /match/);
});

test("legacy migration keeps scores, event IDs and original inferred rating for audit", () => {
  const old = fresh();
  delete old.evidence_version;
  const e = paper(26);
  old.exams = [e];
  old.attempts = e.ids.map((id) =>
    answer(id, 26, {
      id: `${e.id}-${id}`,
      level: 4,
      mode: "exam",
      sessionId: e.id,
      at: e.finishedAt,
    }),
  );
  const migrated = check(old);
  assert.deepEqual(migrated.exams, old.exams);
  assert.deepEqual(
    migrated.attempts.map((a) => a.id),
    old.attempts.map((a) => a.id),
  );
  assert.ok(
    migrated.attempts.every(
      (a) =>
        a.confidence === "unrated" &&
        a.legacyConfidence === "sure" &&
        !independent(a),
    ),
  );
  assert.deepEqual(check(migrated), migrated);
  assert.deepEqual(migrateState(migrated), migrated);
});

test("mastery survives correct assisted revision but a later wrong answer needs a recheck", () => {
  const id = questions[0].id,
    successes = [1, 2, 5].map((day) => answer(id, day));
  const before = reviewState(successes);
  assert.equal(before.mastered, true);
  const assisted = answer(id, 6, { level: 0, support: [{ type: "english" }] });
  const after = reviewState([...successes, assisted]);
  assert.equal(after.mastered, true);
  assert.equal(after.latestAssistanceAt, at(6));
  assert.equal(after.due, before.due);
  const wrong = answer(id, 7, {
    correct: false,
    answerId: byId
      .get(id)
      .options.find((o) => o.id !== byId.get(id).correct_option_id).id,
  });
  const recheck = reviewState([
    ...successes,
    assisted,
    wrong,
    answer(id, 8, { level: 0 }),
  ]);
  assert.equal(recheck.mastered, false);
  assert.equal(recheck.needsRecheck, true);
});

test("immediate exposure is a repair, including after support changes; delay is 24 hours", () => {
  const id = questions[0].id,
    exposures = { [id]: { at: at(26), type: "translation" } };
  assert.equal(recentExposure(exposures, id, at(26) + 23 * 3600000), true);
  assert.equal(recentExposure(exposures, id, at(27)), false);
  assert.equal(independent(answer(id, 26, { recentExposure: true })), false);
  assert.equal(
    independent(answer(id, 26, { support: [{ type: "english" }] })),
    false,
  );
});

test("current readiness needs fresh critical checks and mocks across days; history remains", () => {
  const attempts = questions.flatMap((q) =>
      [20, 21, 24].map((day) => answer(q.id, day)),
    ),
    exams = Array.from({ length: 10 }, (_, i) => paper(17 + i));
  const strong = readiness(questions, attempts, exams, at(27), profiles);
  assert.equal(strong.ready, true);
  assert.equal(strong.criticalFresh, 20);
  const stale = readiness(
    questions,
    questions.flatMap((q) => [1, 2, 5].map((day) => answer(q.id, day))),
    Array.from({ length: 10 }, (_, i) => paper(6, `old-${i}`)),
    at(27),
    profiles,
  );
  assert.equal(stale.ready, false);
  assert.equal(stale.completedMocks, 10);
  assert.equal(stale.recentMocks, 0);
  assert.equal(stale.criticalFresh, 0);
  assert.equal(stale.mastered, 250);
  const clustered = readiness(
    questions,
    attempts,
    Array.from({ length: 10 }, (_, i) => paper(26, `cluster-${i}`)),
    at(27),
    profiles,
  );
  assert.equal(clustered.lastTenStrong, true);
  assert.equal(clustered.mockDays, 1);
  assert.equal(clustered.ready, false);
});

test("balanced plan starts critical, signs and junctions; deadline changes workload and target is optional", () => {
  const prefs = fresh().preferences,
    plan = dailyPlan(questions, [], prefs, at(27));
  assert.ok(plan.newIds.some((id) => byId.get(id).critical_for_motorcycle));
  assert.ok(plan.newIds.some((id) => byId.get(id).chapter === 5));
  assert.ok(plan.newIds.some((id) => byId.get(id).chapter === 6));
  const near = dailyPlan(
    questions,
    [],
    { ...prefs, examDate: "2026-11-03" },
    at(27),
  );
  assert.ok(near.proposedNew > plan.proposedNew);
  const after = dailyPlan(
    questions,
    [],
    { ...prefs, examDate: "2027-03-02" },
    at(27),
  );
  assert.equal(after.deadlineSupported, false);
  assert.equal(after.proposedNew, 8);
  const learned = questions
    .slice(0, 8)
    .map((q) => answer(q.id, 27, { level: 0 }));
  assert.equal(
    dailyPlan(questions, learned, prefs, at(27)).targetComplete,
    true,
  );
  assert.ok(dailyPlan(questions, learned, prefs, at(27), true).newIds.length);
});

test("one session can recommend bilingual for new items and Vietnamese for familiar items", () => {
  assert.equal(recommendedSupport([]).level, 0);
  assert.equal(recommendedSupport([answer(questions[0].id, 25)]).level, 3);
  assert.equal(
    recommendedSupport([answer(questions[0].id, 25, { level: 0 })]).level,
    2,
  );
});

test("phrase lapses reset spacing and same-day repetition cannot escalate intervals", () => {
  const first = [
    { at: at(1), correct: true },
    { at: at(2), correct: true },
    { at: at(5), correct: true },
    { at: at(12), correct: true },
  ];
  assert.equal(phraseReviewState(first).intervalDays, 14);
  const lapsed = [
    ...first,
    { at: at(20), correct: false },
    { at: at(21), correct: true },
  ];
  assert.equal(phraseReviewState(lapsed).intervalDays, 1);
  assert.equal(
    phraseReviewState([
      ...lapsed,
      { at: at(21) + 1000, correct: true },
      { at: at(21) + 2000, correct: true },
    ]).intervalDays,
    1,
  );
  const queue = phraseDailyQueue(phrases, [], at(27));
  assert.equal(queue.length, 8);
  assert.equal(new Set(queue).size, 8);
});

test("backup round-trip keeps exposures, personal spans and a resumable session; rejects corrupt extras", () => {
  const data = fresh(),
    q = questions[0];
  data.attempts = [answer(q.id, 26)];
  data.exposures[q.id] = { at: at(26), type: "feedback" };
  data.savedPhrases = [
    {
      id: "saved-phrase",
      questionId: q.id,
      vi: q.question.vi.slice(0, 12),
      en: "Personal reminder",
      at: at(26),
    },
  ];
  data.studySession = {
    study: {
      ids: [q.id],
      index: 0,
      level: 3,
      support: [],
      reveals: [],
      retried: [],
      startedAt: at(26),
      answerId: q.correct_option_id,
      attemptId: data.attempts[0].id,
    },
    repairOrigin: q.id,
  };
  assert.deepEqual(check(JSON.parse(JSON.stringify(data))), data);
  assert.deepEqual(check(mergeBackups(data, data)), data);
  const broken = structuredClone(data);
  broken.studySession.study.index = 10;
  assert.throws(() => check(broken), /session/);
  const badFlags = fresh();
  const e = paper(26);
  e.flags = { outside: "sure" };
  badFlags.exams = [e];
  assert.throws(() => check(badFlags), /flags/);
});

test("paper blueprint and source fields retain exact official option order and transition boundary", () => {
  assert.equal(questions.length, 250);
  assert.equal(
    questions.reduce((n, q) => n + q.options.length, 0),
    790,
  );
  assert.equal(questions.filter((q) => q.critical_for_motorcycle).length, 20);
  const original = JSON.stringify(questions);
  for (let i = 0; i < 100; i++) {
    const ids = generatePaper(questions, p, `paper-${i}`).ids;
    assert.equal(validatePaper(questions, p, ids), true);
    assert.equal(ids.filter((id) => byId.get(id).chapter === 5).length, 8);
    assert.equal(ids.filter((id) => byId.get(id).chapter === 6).length, 6);
    assert.equal(
      ids.filter((id) => byId.get(id).critical_for_motorcycle).length,
      1,
    );
  }
  assert.equal(JSON.stringify(questions), original);
  assert.equal(profileValid(p, Date.parse("2027-02-28T16:59:59Z")), true);
  assert.equal(profileValid(p, Date.parse("2027-02-28T17:00:00Z")), false);
});

test("explicit delayed checks become due and resolve only after an unaided retrieval", () => {
  const id = questions[0].id,
    attempts = [1, 2, 5].map((day) => answer(id, day)),
    scheduled = at(7);
  assert.equal(reviewState(attempts, scheduled).due, scheduled);
  assert.equal(
    reviewState([...attempts, answer(id, 7, { level: 0 })], scheduled).due,
    scheduled,
  );
  assert.ok(
    reviewState([...attempts, answer(id, 8)], scheduled).due > scheduled,
  );
  const data = fresh();
  data.delayedChecks[id] = scheduled;
  assert.doesNotThrow(() => check(data));
});
