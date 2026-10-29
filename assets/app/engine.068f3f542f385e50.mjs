/** Pure, deterministic training rules. Source option IDs and order are never modified. */
const DAY = 86400000;
// Product study recommendations, not legal exam requirements.
export const LEARNING_RULES = Object.freeze({
  recallDelayMs: DAY,
  mockWindowDays: 14,
  mockDays: 3,
  criticalFreshDays: 7,
});
const MAX_RECORDS = 200000;
const MISTAKE_IDS = [
  "vocabulary",
  "negation",
  "rule",
  "signs",
  "diagram",
  "numbers",
  "attention",
  "unknown",
];
// Known archived/current profile IDs remain verifiable even when readiness is
// called without a separate profile list. Application callers may pass profiles.
const CURRENT_POOLS = [
  { chapter: 1, critical_for_motorcycle: false, count: 8 },
  { chapter: 1, critical_for_motorcycle: true, count: 1 },
  { chapter: 2, count: 1 },
  { chapter: 3, count: 1 },
  { chapter: 5, count: 8 },
  { chapter: 6, count: 6 },
];
const CURRENT_PROFILES = ["A", "A1"].map((category) => ({
  id: `vn-${category}-2025-06`,
  bank_id: "vn-motorcycle-250-2025-06-v1",
  valid_from: "2025-06-01",
  valid_through: "2027-02-28",
  question_count: 25,
  duration_seconds: 1140,
  minimum_correct: category === "A" ? 23 : 21,
  critical_question_count: 1,
  critical_wrong_or_blank_fails: true,
  paper_pools: CURRENT_POOLS,
}));
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const timestamp = (value) =>
  typeof value === "number" ? value : Date.parse(value);
export function vnDate(ms = Date.now()) {
  const n = timestamp(ms);
  if (!Number.isFinite(n)) throw new Error("Invalid date");
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(n).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function profileValid(profile, ms = Date.now()) {
  const day = vnDate(ms);
  return !!profile && day >= profile.valid_from && day <= profile.valid_through;
}
function seeded(seed) {
  let n = 2166136261;
  for (const c of String(seed)) {
    n ^= c.codePointAt(0);
    n = Math.imul(n, 16777619);
  }
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function generatePaper(
  questions,
  profile,
  seed = `${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`,
) {
  if (!Array.isArray(questions) || !Array.isArray(profile?.paper_pools))
    throw new Error("Invalid paper configuration");
  const random = seeded(seed),
    selected = [],
    used = new Set();
  for (const pool of profile.paper_pools) {
    const eligible = questions.filter(
      (q) =>
        q.chapter === pool.chapter &&
        !used.has(q.id) &&
        !q.content_error &&
        !q.unavailable &&
        (!q.requires_image || q.images?.length) &&
        (pool.critical_for_motorcycle === undefined ||
          q.critical_for_motorcycle === pool.critical_for_motorcycle),
    );
    if (eligible.length < pool.count)
      throw new Error(
        `Not enough verified questions in chapter ${pool.chapter}`,
      );
    for (const q of shuffle(eligible, random).slice(0, pool.count)) {
      selected.push(q);
      used.add(q.id);
    }
  }
  if (
    selected.length !== profile.question_count ||
    selected.filter((q) => q.critical_for_motorcycle).length !==
      profile.critical_question_count
  )
    throw new Error("Paper composition does not match profile");
  return {
    ids: shuffle(selected, random).map((q) => q.id),
    seed: String(seed),
  };
}
export function validatePaper(questions, profile, ids) {
  if (
    !Array.isArray(ids) ||
    ids.length !== profile.question_count ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Invalid paper IDs");
  const byId = new Map(questions.map((q) => [q.id, q]));
  const selected = ids.map((id) => {
    const q = byId.get(id);
    if (!q) throw new Error(`Unknown question ${id}`);
    return q;
  });
  if (
    !Array.isArray(profile.paper_pools) ||
    profile.paper_pools.reduce((n, p) => n + p.count, 0) !== ids.length ||
    selected.filter((q) => q.critical_for_motorcycle).length !==
      profile.critical_question_count
  )
    throw new Error("Paper composition does not match profile");
  for (const pool of profile.paper_pools) {
    if (
      selected.filter(
        (q) =>
          q.chapter === pool.chapter &&
          (pool.critical_for_motorcycle === undefined ||
            q.critical_for_motorcycle === pool.critical_for_motorcycle),
      ).length !== pool.count
    )
      throw new Error("Paper pool composition does not match profile");
  }
  if (
    selected.some(
      (q) =>
        !profile.paper_pools.some(
          (pool) =>
            q.chapter === pool.chapter &&
            (pool.critical_for_motorcycle === undefined ||
              q.critical_for_motorcycle === pool.critical_for_motorcycle),
        ),
    )
  )
    throw new Error("Question is outside configured paper pools");
  return true;
}
export function scorePaper(questions, profile, ids, answers = {}) {
  validatePaper(questions, profile, ids);
  if (!plain(answers) || Object.keys(answers).some((id) => !ids.includes(id)))
    throw new Error("Invalid paper answers");
  const byId = new Map(questions.map((q) => [q.id, q]));
  let correct = 0,
    unanswered = 0,
    criticalWrong = false;
  for (const id of ids) {
    const q = byId.get(id);
    if (!q) throw new Error(`Unknown question ${id}`);
    const answer = answers?.[id],
      blank = answer === undefined || answer === null || answer === "";
    if (!blank && !q.options.some((o) => o.id === answer))
      throw new Error(`Invalid answer for ${id}`);
    if (blank) unanswered++;
    if (answer === q.correct_option_id) correct++;
    else if (q.critical_for_motorcycle) criticalWrong = true;
  }
  return {
    correct,
    total: ids.length,
    unanswered,
    criticalWrong,
    passed:
      correct >= profile.minimum_correct &&
      !(profile.critical_wrong_or_blank_fails && criticalWrong),
  };
}
function verifyExamEvidence(
  exam,
  questions,
  profiles,
  requireExplicitTimed = false,
) {
  const profile = profiles.find((p) => p.id === exam.profileId);
  if (!profile || exam.bankVersion !== profile.bank_id)
    throw new Error("Exam profile and bank do not match");
  validatePaper(questions, profile, exam.ids);
  if (
    (requireExplicitTimed && typeof exam.timed !== "boolean") ||
    (exam.timed !== undefined && typeof exam.timed !== "boolean") ||
    (exam.level !== undefined && exam.level !== 4)
  )
    throw new Error("Invalid exam mode");
  const startedAt = timestamp(exam.startedAt),
    deadline = timestamp(exam.deadline);
  if (
    !finiteTime(exam.startedAt) ||
    (exam.timed !== false &&
      (!finiteTime(exam.deadline) ||
        deadline - startedAt !== profile.duration_seconds * 1000 ||
        !profileValid(profile, startedAt)))
  )
    throw new Error("Exam timer does not match the verified profile");
  if (exam.status === "completed") {
    const finishedAt = timestamp(exam.finishedAt);
    if (
      !finiteTime(exam.finishedAt) ||
      finishedAt < startedAt ||
      (exam.timed !== false && finishedAt > deadline)
    )
      throw new Error("Invalid exam completion time");
    const actual = scorePaper(questions, profile, exam.ids, exam.answers);
    if (
      !plain(exam.result) ||
      Object.keys(actual).some((key) => actual[key] !== exam.result[key])
    )
      throw new Error("Stored exam result differs from its answers");
    return actual;
  }
  if (exam.result !== undefined && exam.result !== null)
    throw new Error("An unfinished exam cannot contain a completed result");
  // Check every selected option even before a mock is completed.
  scorePaper(questions, profile, exam.ids, exam.answers);
  if (
    exam.finishedAt !== undefined &&
    (!finiteTime(exam.finishedAt) || timestamp(exam.finishedAt) < startedAt)
  )
    throw new Error("Invalid exam end time");
  return null;
}
export function languagePolicy(level, committed = false, examFinished = false) {
  level = Number(level);
  if (!Number.isInteger(level) || level < 0 || level > 4)
    throw new Error("Unknown support level");
  const after = level === 4 ? !!examFinished : !!committed;
  return Object.freeze({
    english: after || level === 0,
    englishOnRequest: after || level === 1,
    phrases: level === 2 && !after,
    critical: level !== 4 || !!examFinished,
    feedback: after,
    source: after,
    hints: after,
    audio: level < 3 && !after,
    strict: level >= 3 && !after,
    assistedByDefault: level === 0,
  });
}
export function phraseSegments(text, phrases) {
  if (typeof text !== "string") return [];
  const lower = text.toLocaleLowerCase("vi"),
    candidates = [];
  // Include ambiguous/negative chunks as blockers before choosing automatic glosses.
  // An ambiguous larger chunk must never expose an unambiguous substring instead.
  const word = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
  for (const phrase of phrases ?? []) {
    if (typeof phrase.vi !== "string" || !phrase.vi) continue;
    const needle = phrase.vi.toLocaleLowerCase("vi");
    let start = lower.indexOf(needle);
    while (start !== -1) {
      const end = start + needle.length;
      if (!word(text[start - 1]) && !word(text[end]))
        candidates.push({ start, end, phrase });
      start = lower.indexOf(needle, start + 1);
    }
  }
  candidates.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const chosen = [];
  for (const c of candidates)
    if (!chosen.some((x) => c.start < x.end && c.end > x.start)) chosen.push(c);
  chosen.sort((a, b) => a.start - b.start);
  const segments = [];
  let offset = 0;
  for (const c of chosen) {
    if (c.start > offset) segments.push({ text: text.slice(offset, c.start) });
    const safe =
      c.phrase.automatic_gloss_allowed !== false &&
      !c.phrase.ambiguous_without_context;
    segments.push(
      safe
        ? { text: text.slice(c.start, c.end), phrase: c.phrase }
        : { text: text.slice(c.start, c.end) },
    );
    offset = c.end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset) });
  return segments.length ? segments : [{ text }];
}
export function usedStudyHelp(attempt) {
  // English visible by default is assistance even without a reveal click.
  return (
    attempt?.level === 0 ||
    (Array.isArray(attempt?.support) && attempt.support.length > 0)
  );
}
export function learningOutcome(attempt) {
  if (!hasAnswer(attempt)) return "unanswered";
  if (!attempt?.correct) return "incorrect";
  if (attempt.recentExposure) return "repair";
  if (usedStudyHelp(attempt)) return "assisted";
  if (attempt.level < 3) return "guided";
  if (independent(attempt)) return "independent";
  return attempt.confidence === "unrated" ? "unrated" : "uncertain";
}
export function independent(attempt) {
  return (
    !!attempt?.correct &&
    hasAnswer(attempt) &&
    !attempt.recentExposure &&
    attempt.confidenceSource !== "legacy-inferred" &&
    (attempt.level === 3 || attempt.level === 4) &&
    (!attempt.support ||
      (Array.isArray(attempt.support) && attempt.support.length === 0)) &&
    attempt.confidence === "sure"
  );
}
export function reviewState(attemptsForQuestion = [], scheduledAt = 0) {
  const attempts = [...attemptsForQuestion]
    .filter((a) => Number.isFinite(timestamp(a.at)))
    .sort(
      (a, b) =>
        timestamp(a.at) - timestamp(b.at) ||
        String(a.id).localeCompare(String(b.id)),
    );
  let intervalDays = 0,
    due = 0,
    lapses = 0,
    unresolved = false,
    successes = new Set(),
    last = null,
    lastIndependentAt = 0,
    latestAssistanceAt = 0;
  for (const a of attempts) {
    const at = timestamp(a.at),
      day = vnDate(at);
    if (!a.correct) {
      lapses++;
      successes = new Set();
      unresolved = true;
      intervalDays = 1;
    } else if (independent(a)) {
      successes.add(day);
      unresolved = false;
      lastIndependentAt = at;
      intervalDays = [1, 3, 7, 14, 30][Math.min(successes.size - 1, 4)];
    } else {
      if (usedStudyHelp(a)) latestAssistanceAt = at;
      // Skipping an optional rating is not an admission of uncertainty or an error.
      if (a.confidence === "unsure" || a.confidence === "guessed") {
        unresolved = true;
        intervalDays = 1;
      }
    }
    // A visit with help cannot postpone an outstanding cold retrieval.
    if (
      !a.correct ||
      independent(a) ||
      ["unsure", "guessed"].includes(a.confidence) ||
      !due
    )
      due = at + Math.max(1, intervalDays) * DAY;
    last = a;
  }
  const scheduledPending =
    finiteTime(scheduledAt) && timestamp(scheduledAt) > lastIndependentAt;
  if (scheduledPending)
    due = Math.min(due || timestamp(scheduledAt), timestamp(scheduledAt));
  const independentDates = [...successes].sort();
  const spaced = independentDates.some(
    (d, i) =>
      i > 0 &&
      Date.parse(`${d}T00:00:00Z`) -
        Date.parse(`${independentDates[i - 1]}T00:00:00Z`) >=
        3 * DAY,
  );
  const mastered = independentDates.length >= 3 && spaced && !unresolved;
  return {
    due,
    intervalDays,
    lapses,
    mastered,
    independentDates,
    unresolved,
    lastIndependentAt,
    latestAssistanceAt,
    last,
    needsRecheck: unresolved,
  };
}
export function readiness(
  questions,
  attempts = [],
  exams = [],
  now = Date.now(),
  profiles = CURRENT_PROFILES,
  scheduledChecks = {},
) {
  const currentTime = timestamp(now),
    histories = new Map(),
    validHistories = new Map();
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const a of attempts) {
    const q = byId.get(a.questionId);
    if (
      !q ||
      !finiteTime(a.at) ||
      timestamp(a.at) > currentTime ||
      (hasAnswer(a) && !q.options.some((o) => o.id === a.answerId)) ||
      a.correct !== (a.answerId === q.correct_option_id)
    )
      continue;
    if (!validHistories.has(q.id)) validHistories.set(q.id, []);
    validHistories.get(q.id).push(a);
    if (hasAnswer(a)) {
      if (!histories.has(q.id)) histories.set(q.id, []);
      histories.get(q.id).push(a);
    }
  }
  // Blanks are paper outcomes, not answered-question coverage. A blank after an
  // established answer can still request a recheck without inventing an answer.
  const states = questions.map((q) => ({
    q,
    history: histories.get(q.id) ?? [],
    state: reviewState(
      validHistories.get(q.id) ?? [],
      scheduledChecks[q.id] ?? 0,
    ),
  }));
  const completed = exams
    .filter((e) => {
      if (
        e.status !== "completed" ||
        e.timed !== true ||
        e.mode === "practice" ||
        timestamp(e.finishedAt) > currentTime
      )
        return false;
      try {
        verifyExamEvidence(e, questions, profiles);
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => timestamp(a.finishedAt) - timestamp(b.finishedAt));
  const recent = completed
    .filter(
      (e) =>
        timestamp(e.finishedAt) >=
        currentTime - LEARNING_RULES.mockWindowDays * DAY,
    )
    .slice(-10);
  const strong = (e) =>
    e.result.correct >= 24 && !e.result.criticalWrong && e.result.total === 25;
  const coverage = states.filter((x) => x.history.length).length;
  const revisited = states.filter(
    (x) => new Set(x.history.map((a) => vnDate(a.at))).size >= 2,
  ).length;
  const mastered = states.filter((x) => x.state.mastered).length;
  const critical = states.filter((x) => x.q.critical_for_motorcycle);
  const criticalMastered = critical.filter((x) => x.state.mastered).length;
  const criticalFresh = critical.filter(
    (x) =>
      x.state.mastered &&
      x.state.lastIndependentAt >=
        currentTime - LEARNING_RULES.criticalFreshDays * DAY &&
      x.state.due > currentTime,
  ).length;
  const due = states.filter(
    (x) => x.history.length && x.state.due <= currentTime,
  ).length;
  const mockDays = new Set(recent.map((e) => vnDate(e.finishedAt))).size;
  const lastTenStrong = recent.length === 10 && recent.every(strong);
  const timeBuffer =
    recent.length === 10 &&
    recent.filter(
      (e) => timestamp(e.finishedAt) - timestamp(e.startedAt) <= 16 * 60000,
    ).length >= 8;
  const missing = [];
  if (!profiles.some((p) => profileValid(p, currentTime)))
    missing.push("The verified profile has expired; use archived study only.");
  if (due)
    missing.push(
      `Complete the ${due} overdue question reviews before claiming current strong evidence.`,
    );
  if (coverage < questions.length)
    missing.push(
      `Answer all ${questions.length} questions (${coverage} answered).`,
    );
  if (revisited < questions.length)
    missing.push(
      `Revisit every question on another day (${revisited} revisited).`,
    );
  if (criticalMastered < critical.length)
    missing.push(
      `Build spaced unaided recall of all ${critical.length} critical questions (${criticalMastered} established).`,
    );
  if (criticalFresh < critical.length)
    missing.push(
      `Recheck critical questions unaided within 7 days and before they are overdue (${criticalFresh} current).`,
    );
  if (!lastTenStrong)
    missing.push(
      "Complete 10 strict mocks at 24–25/25 with no critical error within the last 14 days.",
    );
  if (mockDays < LEARNING_RULES.mockDays)
    missing.push(
      "Spread the recent strict mocks across at least 3 Vietnam-local days.",
    );
  if (!timeBuffer)
    missing.push(
      "Finish at least 8 of the last 10 strict mocks within 16 minutes.",
    );
  const lastEvidenceAt = [...histories.values()]
    .flat()
    .reduce((latest, a) => Math.max(latest, timestamp(a.at)), 0);
  return {
    coverage,
    revisited,
    mastered,
    criticalMastered,
    criticalFresh,
    criticalTotal: critical.length,
    due,
    completedMocks: completed.length,
    recentMocks: recent.length,
    strongMocks: recent.filter(strong).length,
    mockDays,
    lastTenStrong,
    timeBuffer,
    lastEvidenceAt,
    lastMockAt: completed.at(-1)?.finishedAt ?? null,
    ready: !missing.length,
    missing,
  };
}

export function hasAnswer(a) {
  return typeof a?.answerId === "string" && a.answerId.length > 0;
}
export function recentExposure(exposures, questionId, at = Date.now()) {
  const exposure = exposures?.[questionId];
  return (
    !!exposure &&
    timestamp(exposure.at) <= at &&
    at - timestamp(exposure.at) < LEARNING_RULES.recallDelayMs
  );
}

// Conservative migration: retain every event and score, retain the old field for
// audit, but never use a fabricated exam rating as explicit learner confidence.
export function migrateState(input) {
  const data = structuredClone(input);
  data.exposures ??= {};
  if ((data.evidence_version ?? 1) < 2) {
    for (const a of data.attempts) {
      if (
        a.level < 4 &&
        hasAnswer(a) &&
        (!data.exposures[a.questionId] ||
          timestamp(a.at) > timestamp(data.exposures[a.questionId].at))
      )
        data.exposures[a.questionId] = {
          at: a.at,
          type: "legacy-study-feedback",
        };
    }
    data.attempts = data.attempts.map((a) =>
      a.level === 4
        ? {
            ...a,
            legacyConfidence: a.confidence,
            confidence: "unrated",
            confidenceSource: "legacy-inferred",
            kind: hasAnswer(a) ? "answer-submitted" : "exam-blank",
          }
        : { ...a, kind: "answer-submitted" },
    );
    data.evidence_version = 2;
  }
  data.preferences = {
    adaptiveSupport: true,
    dailyMinutes: 20,
    examDate: "",
    ...data.preferences,
  };
  data.exposures ??= {};
  data.questionEvents ??= [];
  data.savedPhrases ??= [];
  data.delayedChecks ??= {};
  data.studySession ??= null;
  return data;
}

export function recommendedSupport(attempts = [], fallback = 0) {
  const answered = attempts.filter(hasAnswer),
    state = reviewState(attempts),
    last = answered.at(-1);
  if (!last)
    return {
      level: fallback,
      reason: "New question: start with your preferred English support.",
    };
  if (state.unresolved)
    return {
      level: 2,
      reason:
        "A mistake or uncertainty needs repair. Phrase help is available; ask for more English if needed.",
    };
  if (state.independentDates.length || state.mastered)
    return {
      level: 3,
      reason: "You have recalled this unaided before. Start in Vietnamese.",
    };
  if (last.correct)
    return {
      level: 2,
      reason:
        "You answered this correctly with support. Try reading with optional phrase help.",
    };
  return {
    level: 0,
    reason:
      "Revisit the meaning with English support, then schedule a cold check.",
  };
}

export function balancedQuestions(questions, count, seen = new Set()) {
  const families = [
    (q) => q.critical_for_motorcycle,
    (q) => q.chapter === 5,
    (q) => q.chapter === 6,
    (q) => q.chapter === 1 && !q.critical_for_motorcycle,
    (q) => q.chapter === 5,
    (q) => q.chapter === 6,
    (q) => q.chapter === 2,
    (q) => q.chapter === 3,
  ];
  const used = new Set(),
    out = [];
  const eligible = questions.filter((q) => !seen.has(q.id) && !q.content_error);
  for (
    let turn = 0;
    out.length < count && out.length < eligible.length;
    turn++
  ) {
    const pool = eligible.filter(
      (q) => !used.has(q.id) && families[turn % families.length](q),
    );
    const q =
      pool[0] ??
      (turn % families.length === families.length - 1
        ? eligible.find((q) => !used.has(q.id))
        : null);
    if (q) {
      out.push(q.id);
      used.add(q.id);
    }
  }
  return out;
}

export function dailyPlan(
  questions,
  attempts,
  preferences,
  now = Date.now(),
  learnMore = false,
  scheduledChecks = {},
) {
  const histories = new Map(
    questions.map((q) => [q.id, attempts.filter((a) => a.questionId === q.id)]),
  );
  // A diagnostic paper never substitutes for actually teaching a new item.
  const taught = new Map();
  for (const a of attempts.filter((a) => hasAnswer(a) && a.level < 4))
    if (
      !taught.has(a.questionId) ||
      timestamp(a.at) < timestamp(taught.get(a.questionId).at)
    )
      taught.set(a.questionId, a);
  const remaining = questions.length - taught.size;
  const newToday = [...taught.values()].filter(
    (a) => vnDate(a.at) === vnDate(now),
  ).length;
  const date = preferences.examDate,
    validDeadline = date && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const daysLeft = validDeadline
    ? Math.max(1, Math.ceil((Date.parse(date + "T16:59:59Z") - now) / DAY))
    : null;
  const deadlineSupported = !date || date <= "2027-02-28";
  const proposedNew = Math.min(
    250,
    Math.max(
      preferences.dailyLimit ?? 8,
      deadlineSupported && daysLeft
        ? Math.ceil(remaining / Math.max(1, daysLeft - 7))
        : 0,
    ),
  );
  const desiredNew = learnMore
    ? Math.min(proposedNew, remaining)
    : Math.min(Math.max(0, proposedNew - newToday), remaining);
  const measured = attempts
    .filter(
      (a) =>
        a.level < 4 &&
        hasAnswer(a) &&
        a.activeMs >= 5000 &&
        a.activeMs <= 30 * 60000,
    )
    .slice(-40)
    .map((a) => a.activeMs / 60000)
    .sort((a, b) => a - b);
  const minutesPerQuestion =
    measured.length >= 5 ? measured[Math.floor(measured.length / 2)] : null;
  const due = questions
    .filter((q) => {
      const h = histories.get(q.id),
        r = reviewState(h, scheduledChecks[q.id] ?? 0);
      return h.some(hasAnswer) && (r.unresolved || r.due <= now);
    })
    .sort((a, b) => {
      const x = reviewState(histories.get(a.id), scheduledChecks[a.id] ?? 0),
        y = reviewState(histories.get(b.id), scheduledChecks[b.id] ?? 0);
      return (
        Number(y.unresolved) - Number(x.unresolved) ||
        Number(b.critical_for_motorcycle) - Number(a.critical_for_motorcycle) ||
        y.lapses - x.lapses ||
        x.due - y.due
      );
    });
  const capacity = minutesPerQuestion
    ? Math.max(
        3,
        Math.floor((preferences.dailyMinutes ?? 20) / minutesPerQuestion),
      )
    : proposedNew + Math.min(4, due.length);
  const newCount = Math.min(desiredNew, Math.max(1, Math.ceil(capacity * 0.6)));
  const newIds = balancedQuestions(questions, newCount, new Set(taught.keys()));
  const reviewIds = due
    .filter((q) => !newIds.includes(q.id))
    .slice(0, Math.max(1, capacity - newIds.length))
    .map((q) => q.id);
  // A short delayed unaided check ends the session where one is available.
  const final = reviewIds.pop();
  const ids = [...reviewIds, ...newIds, ...(final ? [final] : [])];
  return {
    ids,
    newIds,
    reviewIds: [...reviewIds, ...(final ? [final] : [])],
    remaining,
    newToday,
    proposedNew,
    daysLeft,
    deadlineSupported,
    minutesPerQuestion,
    estimatedMinutes: minutesPerQuestion
      ? Math.ceil(ids.length * minutesPerQuestion)
      : null,
    overloaded:
      !!minutesPerQuestion &&
      proposedNew * minutesPerQuestion > (preferences.dailyMinutes ?? 20),
    targetComplete: newToday >= proposedNew,
  };
}

export function phraseReviewState(attempts = []) {
  let intervalDays = 1,
    due = 0,
    dates = new Set(),
    lapses = 0,
    lastSuccessAt = 0;
  for (const a of [...attempts].sort(
    (a, b) => timestamp(a.at) - timestamp(b.at),
  )) {
    const at = timestamp(a.at);
    if (!a.correct) {
      dates = new Set();
      intervalDays = 1;
      lapses++;
      lastSuccessAt = 0;
      due = at + DAY;
    } else if (
      !dates.size ||
      (vnDate(at) !== vnDate(lastSuccessAt) && at >= due)
    ) {
      dates.add(vnDate(at));
      lastSuccessAt = at;
      intervalDays = [1, 3, 7, 14, 30][Math.min(dates.size - 1, 4)];
      due = at + intervalDays * DAY;
    }
  }
  return { intervalDays, due, lapses, successes: dates.size };
}
export function phraseDailyQueue(
  phrases,
  attempts,
  now = Date.now(),
  limit = 8,
  criticalIds = new Set(),
) {
  const rows = phrases.map((p) => ({
    p,
    h: attempts.filter((a) => a.phraseId === p.id),
  }));
  const rank = (a, b) =>
    Number(criticalIds.has(b.p.id)) - Number(criticalIds.has(a.p.id)) ||
    (a.p.initial_priority ?? 5) - (b.p.initial_priority ?? 5) ||
    (b.p.occurrences?.length ?? 0) - (a.p.occurrences?.length ?? 0);
  const due = rows
    .filter((x) => x.h.length && phraseReviewState(x.h).due <= now)
    .sort(rank);
  const fresh = rows.filter((x) => !x.h.length).sort(rank);
  const selectedDue = Math.min(due.length, Math.max(1, limit - 2));
  const out = due.slice(0, selectedDue);
  out.push(...fresh.slice(0, limit - out.length));
  out.push(...due.slice(selectedDue, selectedDue + limit - out.length));
  return [...new Set(out.map((x) => x.p.id))].slice(0, limit);
}

function plain(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function rejectUnsafe(value, depth = 0) {
  if (depth > 30) throw new Error("Backup is nested too deeply");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Backup contains an invalid number");
  if (value && typeof value === "object") {
    if (!Array.isArray(value) && !plain(value))
      throw new Error("Backup contains an unsupported object");
    for (const [key, entry] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe backup key");
      rejectUnsafe(entry, depth + 1);
    }
  }
}
function finiteTime(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    Number.isFinite(timestamp(value)) &&
    timestamp(value) >= 0 &&
    timestamp(value) < 8640000000000000
  );
}
function stringId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
export function validateBackup(
  data,
  bankId,
  knownIds,
  questions,
  profiles = CURRENT_PROFILES,
) {
  rejectUnsafe(data);
  if (!plain(data) || data.schema_version !== 1 || data.bank_version !== bankId)
    throw new Error("Backup schema or question-bank version is incompatible");
  if (!plain(data.preferences))
    throw new Error("Backup preferences are invalid");
  const preferences = data.preferences;
  if (
    preferences.level !== undefined &&
    (!Number.isInteger(preferences.level) ||
      preferences.level < 0 ||
      preferences.level > 3)
  )
    throw new Error("Invalid saved support level");
  if (
    preferences.dailyLimit !== undefined &&
    (!Number.isInteger(preferences.dailyLimit) ||
      preferences.dailyLimit < 1 ||
      preferences.dailyLimit > 250)
  )
    throw new Error("Invalid saved daily target");
  if (
    preferences.theme !== undefined &&
    !["system", "light", "dark", "amoled"].includes(preferences.theme)
  )
    throw new Error("Invalid saved theme");
  if (
    preferences.profileId !== undefined &&
    !["vn-A-2025-06", "vn-A1-2025-06"].includes(preferences.profileId)
  )
    throw new Error("Invalid saved exam profile");
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const byId = Array.isArray(questions)
    ? new Map(questions.map((q) => [q.id, q]))
    : null;
  const collections = [
    "attempts",
    "exams",
    "phraseAttempts",
    "bookmarks",
    "mistakeEdits",
  ];
  for (const name of collections)
    if (!Array.isArray(data[name]) || data[name].length > MAX_RECORDS)
      throw new Error(`Invalid ${name} collection`);
  const checkUnique = (records, kind) => {
    const ids = new Set();
    for (const item of records) {
      if (!plain(item) || !stringId(item.id) || ids.has(item.id))
        throw new Error(`Invalid or duplicate ${kind} event ID`);
      ids.add(item.id);
    }
  };
  const questionId = (id) => {
    if (!known.has(id)) throw new Error(`Unknown question ID: ${String(id)}`);
  };
  const answerId = (id, answer) => {
    if (
      answer !== null &&
      answer !== "" &&
      answer !== undefined &&
      (typeof answer !== "string" ||
        (byId
          ? !byId.get(id)?.options.some((o) => o.id === answer)
          : !new RegExp(`^${id}_opt_[1-4]$`).test(answer)))
    )
      throw new Error("Invalid answer ID");
  };
  checkUnique(data.attempts, "attempt");
  checkUnique(data.exams, "exam");
  checkUnique(data.phraseAttempts, "phrase");
  checkUnique(data.mistakeEdits, "mistake");
  for (const a of data.attempts) {
    questionId(a.questionId);
    answerId(a.questionId, a.answerId);
    if (
      typeof a.correct !== "boolean" ||
      !finiteTime(a.at) ||
      (a.startedAt !== undefined && !finiteTime(a.startedAt)) ||
      !Number.isInteger(a.level) ||
      a.level < 0 ||
      a.level > 4 ||
      !["sure", "unsure", "guessed", "unrated"].includes(a.confidence) ||
      !Array.isArray(a.support) ||
      a.support.length > 10000 ||
      !Array.isArray(a.mistakes) ||
      a.mistakes.some((m) => !MISTAKE_IDS.includes(m))
    )
      throw new Error("Invalid attempt data");
    if (a.startedAt !== undefined && timestamp(a.startedAt) > timestamp(a.at))
      throw new Error("Attempt was submitted before it started");
    if (
      byId &&
      a.correct !== (a.answerId === byId.get(a.questionId).correct_option_id)
    )
      throw new Error("Attempt correctness differs from its answer");
  }
  for (const e of data.exams) {
    const validDeadline =
      finiteTime(e.deadline) ||
      (e.timed === false && e.deadline === Number.MAX_SAFE_INTEGER);
    if (
      !Array.isArray(e.ids) ||
      e.ids.length !== 25 ||
      new Set(e.ids).size !== e.ids.length ||
      !plain(e.answers) ||
      !["active", "completed", "abandoned"].includes(e.status) ||
      !["vn-A-2025-06", "vn-A1-2025-06"].includes(e.profileId) ||
      e.bankVersion !== bankId ||
      !finiteTime(e.startedAt) ||
      !validDeadline ||
      timestamp(e.deadline) < timestamp(e.startedAt)
    )
      throw new Error("Invalid exam data");
    for (const id of e.ids) questionId(id);
    for (const [id, answer] of Object.entries(e.answers)) {
      if (!e.ids.includes(id))
        throw new Error("Exam answer is outside its paper");
      answerId(id, answer);
    }
    if (e.status === "completed") {
      const r = e.result;
      if (
        !finiteTime(e.finishedAt) ||
        !plain(r) ||
        !Number.isInteger(r.correct) ||
        r.correct < 0 ||
        r.correct > 25 ||
        r.total !== 25 ||
        !Number.isInteger(r.unanswered) ||
        r.unanswered < 0 ||
        r.unanswered > 25 ||
        r.correct + r.unanswered > 25 ||
        typeof r.criticalWrong !== "boolean" ||
        typeof r.passed !== "boolean"
      )
        throw new Error("Invalid completed exam result");
    }
    if (byId) verifyExamEvidence(e, questions, profiles, true);
  }
  if (byId) {
    const examsById = new Map(data.exams.map((e) => [e.id, e]));
    for (const a of data.attempts.filter((a) => a.level === 4)) {
      const exam = examsById.get(a.sessionId);
      const expectedMode = exam?.timed === false ? "practice" : "exam";
      if (
        !exam ||
        exam.status !== "completed" ||
        !exam.ids.includes(a.questionId) ||
        a.mode !== expectedMode ||
        (exam.answers[a.questionId] ?? null) !== (a.answerId ?? null) ||
        timestamp(a.at) !== timestamp(exam.finishedAt) ||
        a.support.length ||
        ((data.evidence_version ?? 1) < 2
          ? a.confidence !== "sure"
          : a.confidence !== (exam.flags?.[a.questionId] ?? "unrated"))
      )
        throw new Error("Exam attempt does not match its completed paper");
    }
  }
  for (const p of data.phraseAttempts)
    if (
      !stringId(p.phraseId) ||
      !finiteTime(p.at) ||
      typeof p.correct !== "boolean"
    )
      throw new Error("Invalid phrase attempt");
  for (const id of data.bookmarks) questionId(id);
  if (new Set(data.bookmarks).size !== data.bookmarks.length)
    throw new Error("Duplicate bookmarks");
  const attemptIds = new Set(data.attempts.map((a) => a.id));
  for (const m of data.mistakeEdits) {
    if (!attemptIds.has(m.attemptId))
      throw new Error("Mistake classification refers to an unknown attempt");
    if (m.questionId !== undefined) questionId(m.questionId);
    const tags = m.mistakes ?? m.tags;
    if (
      !finiteTime(m.at) ||
      !Array.isArray(tags) ||
      tags.some((tag) => !MISTAKE_IDS.includes(tag))
    )
      throw new Error("Invalid mistake classification");
  }
  if (
    preferences.dailyMinutes !== undefined &&
    (!Number.isInteger(preferences.dailyMinutes) ||
      preferences.dailyMinutes < 5 ||
      preferences.dailyMinutes > 240)
  )
    throw Error("Invalid daily study minutes");
  if (
    preferences.adaptiveSupport !== undefined &&
    typeof preferences.adaptiveSupport !== "boolean"
  )
    throw Error("Invalid adaptive support preference");
  if (
    preferences.examDate !== undefined &&
    preferences.examDate !== "" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(preferences.examDate) ||
      !Number.isFinite(Date.parse(preferences.examDate)))
  )
    throw Error("Invalid exam date");
  if (data.evidence_version !== undefined && data.evidence_version !== 2)
    throw Error("Unsupported learning evidence version");
  for (const e of data.exams) {
    if (
      e.flags !== undefined &&
      (!plain(e.flags) ||
        Object.entries(e.flags).some(
          ([id, flag]) =>
            !e.ids.includes(id) || !["unsure", "guessed"].includes(flag),
        ))
    )
      throw Error("Invalid paper uncertainty flags");
    if (
      e.timings !== undefined &&
      (!plain(e.timings) ||
        Object.entries(e.timings).some(
          ([id, t]) =>
            !e.ids.includes(id) ||
            !plain(t) ||
            !Number.isFinite(t.activeMs) ||
            t.activeMs < 0 ||
            !Number.isInteger(t.visits) ||
            t.visits < 1 ||
            !finiteTime(t.firstViewedAt),
        ))
    )
      throw Error("Invalid paper activity times");
  }
  if (data.exposures !== undefined) {
    if (!plain(data.exposures)) throw Error("Invalid exposure history");
    for (const [id, e] of Object.entries(data.exposures)) {
      questionId(id);
      if (!plain(e) || !finiteTime(e.at) || typeof e.type !== "string")
        throw Error("Invalid exposure");
    }
  }
  if (data.delayedChecks !== undefined) {
    if (!plain(data.delayedChecks)) throw Error("Invalid delayed checks");
    for (const [id, at] of Object.entries(data.delayedChecks)) {
      questionId(id);
      if (!finiteTime(at)) throw Error("Invalid delayed retrieval date");
    }
  }
  if (data.questionEvents !== undefined) {
    if (
      !Array.isArray(data.questionEvents) ||
      data.questionEvents.length > MAX_RECORDS
    )
      throw Error("Invalid question events");
    checkUnique(data.questionEvents, "question");
    for (const e of data.questionEvents) {
      questionId(e.questionId);
      if (
        !finiteTime(e.at) ||
        !["presented", "teaching-completed", "exam-blank"].includes(e.kind)
      )
        throw Error("Invalid question event");
    }
  }
  if (data.savedPhrases !== undefined) {
    if (!Array.isArray(data.savedPhrases) || data.savedPhrases.length > 10000)
      throw Error("Invalid saved phrases");
    checkUnique(data.savedPhrases, "saved phrase");
    for (const p of data.savedPhrases) {
      questionId(p.questionId);
      if (
        typeof p.vi !== "string" ||
        !p.vi.trim() ||
        p.vi.length > 500 ||
        typeof p.en !== "string" ||
        p.en.length > 1000 ||
        !finiteTime(p.at)
      )
        throw Error("Invalid personal phrase");
    }
  }
  const checkSession = (session) => {
    if (
      !plain(session) ||
      !Array.isArray(session.ids) ||
      !session.ids.length ||
      session.ids.length > 1000 ||
      !Number.isInteger(session.index) ||
      session.index < 0 ||
      session.index >= session.ids.length ||
      !Number.isInteger(session.level) ||
      session.level < 0 ||
      session.level > 3 ||
      !Array.isArray(session.support) ||
      !Array.isArray(session.reveals) ||
      !Array.isArray(session.retried) ||
      !finiteTime(session.startedAt)
    )
      throw Error("Invalid saved study session");
    for (const id of session.ids) questionId(id);
    answerId(session.ids[session.index], session.answerId);
    if (session.attemptId && !attemptIds.has(session.attemptId))
      throw Error("Saved study answer is missing");
  };
  if (data.studySession) {
    checkSession(data.studySession.study);
    if (data.studySession.repairOrigin)
      questionId(data.studySession.repairOrigin);
    if (data.studySession.transferStudy)
      checkSession(data.studySession.transferStudy);
    if (
      data.studySession.phraseQueue &&
      (!Array.isArray(data.studySession.phraseQueue) ||
        data.studySession.phraseQueue.some((id) => !stringId(id)))
    )
      throw Error("Invalid saved phrase queue");
  }
  return migrateState(data);
}
export function mergeBackups(existing, incoming) {
  if (
    existing.schema_version !== incoming.schema_version ||
    existing.bank_version !== incoming.bank_version
  )
    throw new Error("Cannot merge incompatible backups");
  const merged = structuredClone(existing);
  // Existing events/results are immutable: imported duplicates never overwrite them.
  for (const key of [
    "attempts",
    "exams",
    "phraseAttempts",
    "mistakeEdits",
    "questionEvents",
    "savedPhrases",
  ]) {
    merged[key] ??= [];
    const known = new Set(merged[key].map((e) => e.id));
    for (const event of incoming[key] ?? [])
      if (!known.has(event.id)) {
        merged[key].push(structuredClone(event));
        known.add(event.id);
      }
  }
  merged.bookmarks = [
    ...new Set([...existing.bookmarks, ...incoming.bookmarks]),
  ];
  merged.preferences = {
    ...existing.preferences,
    ...structuredClone(incoming.preferences),
  };
  merged.exposures ??= {};
  for (const [id, e] of Object.entries(incoming.exposures ?? {}))
    if (
      !merged.exposures[id] ||
      timestamp(e.at) > timestamp(merged.exposures[id].at)
    )
      merged.exposures[id] = structuredClone(e);
  merged.delayedChecks ??= {};
  for (const [id, at] of Object.entries(incoming.delayedChecks ?? {}))
    if (
      !merged.delayedChecks[id] ||
      timestamp(at) < timestamp(merged.delayedChecks[id])
    )
      merged.delayedChecks[id] = at;
  merged.evidence_version = 2;
  if (!merged.studySession && incoming.studySession)
    merged.studySession = structuredClone(incoming.studySession);
  if ((incoming.lastBackupAt ?? 0) > (merged.lastBackupAt ?? 0)) {
    merged.lastBackupAt = incoming.lastBackupAt;
    merged.backupAttemptCount = incoming.backupAttemptCount;
  }
  return merged;
}
