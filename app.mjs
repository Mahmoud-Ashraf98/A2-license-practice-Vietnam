import { breakdowns, junction487, repairPrompts } from "./teaching.mjs";
import { criticalProgress, criticalDrillSummary } from "./critical.mjs";
import {
  vnDate,
  profileValid,
  generatePaper,
  scorePaper,
  languagePolicy,
  phraseSegments,
  independent,
  usedStudyHelp,
  learningOutcome,
  reviewState,
  readiness,
  validateBackup,
  mergeBackups,
  hasAnswer,
  migrateState,
  dailyPlan,
  recommendedSupport,
  recentExposure,
  LEARNING_RULES,
  phraseReviewState,
  phraseDailyQueue,
} from "./engine.mjs";
import {
  openStore,
  readState,
  saveState,
  saveRollback,
  readRollback,
} from "./storage.mjs";
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID(),
  now = () => Date.now(),
  prettyDate = (n) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(n),
  fold = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
const chapterNames = {
  1: "Road rules",
  2: "Culture & responsibility",
  3: "Riding technique",
  5: "Road signs",
  6: "Junctions & right of way",
};
const levels = [
  "Bilingual",
  "English on request",
  "Phrase help",
  "Vietnamese only",
];
const taxonomy = {
  vocabulary: "Vocabulary / unknown phrase",
  negation: "Negation / qualifier",
  rule: "Traffic rule / concept",
  signs: "Similar road signs",
  diagram: "Junction / priority diagram",
  numbers: "Numbers / measurements",
  attention: "Attention / time pressure",
  unknown: "Not sure why yet",
};
const icons = { today: "◌", learn: "▤", review: "↻", test: "✓" };
const appVersion = import.meta.url.match(/app\.([a-f0-9]{16})\.mjs(?:[?#]|$)/)?.[1] ?? "development";
function confidenceControls(ctx) {
  const note = ctx.recentExposure
    ? "Repair check: you saw this answer or translation within 24 hours."
    : usedStudyHelp(ctx)
      ? "With help today. Try Vietnamese again tomorrow."
      : ctx.level < 3
        ? "Guided practice. Try a Vietnamese-only check later."
        : "Vietnamese only. Confidence is optional.";
  return `<p class="source-note">${note}</p><div class="confidence" role="group" aria-label="Confidence in this answer, optional">${["sure", "unsure", "guessed"].map((c) => `<button class="chip ${ctx.confidence === c ? "active" : ""}" data-action="confidence" data-value="${c}" aria-pressed="${ctx.confidence === c}">${c[0].toUpperCase() + c.slice(1)}</button>`).join("")}</div><details class="confidence-disclosure"><summary>How this practice counts</summary><p>Mastery requires three explicitly confident Vietnamese-only successes on separate days, including a gap of three days. Translation, phrase help, audio and immediate retries do not add mastery evidence. Correct assisted revision preserves established evidence; a later mistake or uncertainty asks for a recheck. The 24-hour answer-exposure delay is an app study rule, not an exam rule.</p></details>`;
}

function questionProgressLabel(q, attempt) {
  const progress = qState(q.id),
    outcome = learningOutcome(attempt);
  if (progress.needsRecheck) return "Needs a Vietnamese-only recheck";
  if (progress.mastered) return "Established Vietnamese mastery";
  if (outcome === "unanswered")
    return "No submitted answer · new learning available";
  if (outcome === "repair") return "Repair check · delayed recall still due";
  if (outcome === "assisted")
    return "Correct with English / phrase help · not mastered";
  if (outcome === "guided")
    return "Guided correct · needs a Vietnamese-only check";
  if (outcome === "independent")
    return `Unaided recall on ${progress.independentDates.length} separate day(s) · mastery still in progress`;
  if (outcome === "unrated")
    return "Correct · confidence unrated · not mastered";
  if (outcome === "uncertain")
    return attempt.confidence === "guessed"
      ? "Correct guess · needs unaided review"
      : "Correct but unsure · needs unaided review";
  return "Needs another try";
}
function learningEvidence(q, ctx) {
  const outcome = learningOutcome(ctx),
    progress = qState(q.id);
  let title, description;
  if (outcome === "repair") {
    title = "Useful repair check";
    description =
      "You saw help or the answer within 24 hours. Retrieve it tomorrow for cold recall evidence.";
  } else if (outcome === "assisted") {
    const english =
      ctx.level === 0 || ctx.support?.some((help) => help.type === "english");
    title = english ? "Correct with English help" : "Correct with phrase help";
    description = progress.mastered
      ? "Established mastery is preserved. This visit used help; your cold-check due date stays unchanged."
      : "Correct with help today. Retrieve it in Vietnamese tomorrow; this visit does not add independent mastery evidence.";
  } else if (outcome === "guided") {
    title = "Correct in guided practice";
    description =
      "No in-app help was revealed. This is useful practice; use Vietnamese-only mode later to check mastery.";
  } else if (outcome === "independent") {
    title = progress.mastered
      ? "Vietnamese mastery confirmed"
      : "Unaided Vietnamese success";
    description = progress.mastered
      ? "This question meets the separate-day mastery target through confident answers without translation help."
      : `${progress.independentDates.length} qualifying separate-day success(es) recorded. Mastery requires at least three, including a gap of three days. One correct answer is progress, not mastery.`;
  } else if (outcome === "unrated") {
    title = "Correct · confidence not rated";
    description =
      "Saved as practice. Skipping the optional rating does not mark you unsure or guessed, and it does not count as confident unaided recall.";
  } else if (outcome === "uncertain") {
    title =
      ctx.confidence === "guessed"
        ? "Correct answer, marked as a guess"
        : "Correct answer, marked unsure";
    description =
      "This stays in review and does not count toward Vietnamese mastery. Retrieve it again later without help.";
  } else {
    title = "Practice recorded";
    description =
      "This answer does not build mastery. Review the rule and language, then try again later.";
  }
  return `<div class="notice learning-evidence" data-learning-outcome="${outcome}" data-mastered="${progress.mastered}" aria-label="How this answer counts"><strong>${title}</strong><p>${description}</p></div>`;
}
function criticalTodayCard() {
  const c = criticalProgress(
    questions,
    state.attempts,
    now(),
    state.delayedChecks,
  );
  return `<section class="card" aria-label="Critical question practice" style="margin-bottom:26px;border-top:3px solid #b99b42"><div class="card-head"><div><p class="eyebrow">CRITICAL QUESTIONS · CÂU HỎI ĐIỂM LIỆT</p><h2>One question can decide the whole test.</h2></div><span class="tag critical">${c.secure}/${c.total} SECURE</span></div><p>Each A/A1 mock contains exactly one of these ${c.total} questions. A wrong or blank critical answer fails, even at 24/25.</p><p class="source-note">${c.unseen} not yet attempted · ${c.total - c.secure} not independently secure · ${c.due} due for review</p><div class="actions">${button("critical", "Open critical practice →", "primary")}${button("critical-priority", "Review what needs attention", "secondary", c.priorityIds.length ? "" : "disabled")}${button("critical-drill", "Check all 20 in Vietnamese", "ghost")}</div></section>`;
}
function criticalCollectionPanel() {
  const c = criticalProgress(
    questions,
    state.attempts,
    now(),
    state.delayedChecks,
  );
  return `<section class="card" aria-label="Critical training overview" style="margin-bottom:24px"><p class="eyebrow">THE EXACT MOTORCYCLE LIST · A AND A1</p><h2>The 20 questions you cannot afford to miss.</h2><p>The official A/A1 bank contains ${c.total} critical questions. Every current-format mock draws exactly one. Wrong or unanswered means automatic failure, whatever your total score.</p><div class="stats" style="margin:22px 0">${[
    [c.unseen, "Not yet attempted"],
    [c.needsUnaided, "Needs unaided retrieval"],
    [c.developing, "Building spaced recall"],
    [c.secure, "Independently secure"],
  ]
    .map(
      ([n, label]) =>
        `<div class="stat"><div class="stat-number">${n}</div><span class="stat-label">${label}</span></div>`,
    )
    .join(
      "",
    )}</div><div class="actions">${button("critical-priority", "Practise questions needing attention", "primary", c.priorityIds.length ? "" : "disabled")}${button("critical-drill", "Start all-20 Vietnamese drill", "secondary")}</div><p class="source-note">Targeted practice puts wrong or uncertain answers first, then unseen and due questions. The drill covers all 20 once, in a new order, with no English before each answer. It is a learning drill with feedback after every answer, not a mixed mock.</p><p class="source-note">“Secure” is our study target: three confident unaided successes on three Vietnam-local dates, including a gap of at least three days. One 20/20 drill is useful evidence but does not establish spaced mastery.</p><details><summary>Verify the official critical-question rule</summary><p>Guidance 2262/CSGT-P5: the A/A1 bank has 250 questions with 20 critical items; each current-format paper includes one critical question. Wrong or blank fails. The full 600-question bank for other categories has 60 critical items; only the motorcycle list applies here.</p><p><a href="https://xaydungchinhsach.chinhphu.vn/huong-dan-su-dung-bo-600-cau-hoi-dung-de-sat-hach-lai-xe-co-gioi-duong-bo-119250513110514585.htm" target="_blank" rel="noopener">Government guidance</a> · <a href="sources/official_guidance_2262.pdf#page=4" target="_blank" rel="noopener">Exact 20 IDs in Appendix I</a></p></details></section>`;
}
function showCriticalDrillSummary(sessionId) {
  const summary = criticalDrillSummary(questions, state.attempts, sessionId);
  openModal(
    `<p class="eyebrow">RECALL CHECK · NOT AN EXAM RESULT</p><h2>Critical drill complete</h2><p><strong>${summary.correct}/${summary.total} correct</strong> · ${summary.independentCorrect}/${summary.total} confident unaided answers.</p>${summary.needsReviewIds.length ? `<p>Review questions ${summary.needsReviewIds.map((id) => byId.get(id).official_id).join(", ")}. Wrong answers and correct guesses stay in your review history.</p>` : "<p>Every critical question was answered correctly and confidently in Vietnamese in this session.</p>"}<p>Keep retrieving them on separate days. Today’s result does not make all 20 independently secure or count as a completed mixed mock.</p><div class="actions">${button("critical", "See critical progress", "primary")}${closeButton()}</div>`,
  );
}
function criticalResultRepair(exam) {
  if (!exam.result?.criticalWrong) return "";
  const q = exam.ids
    .map((id) => byId.get(id))
    .find((q) => q.critical_for_motorcycle);
  if (!q) return "";
  return `<section class="notice" aria-label="Critical failure repair" style="margin-top:20px"><strong>The critical condition caused this failure.</strong><p>Question ${q.official_id} was ${exam.answers[q.id] ? "answered incorrectly" : "left unanswered"}. Even 24 correct answers cannot offset this. Review its rule and Vietnamese wording, then retrieve it again without help.</p><div class="actions">${button("repair-critical", "Repair the critical question", "primary", `data-id="${q.id}"`)}${button("critical", "Open all 20 critical questions", "secondary")}</div></section>`;
}
let bank,
  questions,
  phrases,
  phraseData,
  profiles,
  byId,
  byPhrase,
  state,
  storageReady = false,
  storageError = "",
  view = "today",
  study = null,
  examId = null,
  examIndex = 0,
  resultId = null,
  busy = false,
  search = "",
  chapter = "all",
  collection = "all",
  reviewFilter = "due",
  mistakeFilter = "all",
  phraseIndex = 0,
  phraseMode = "flash",
  phraseRevealed = false,
  phraseAnswer = null,
  phraseChoices = [],
  phraseQueue = [],
  importCandidate = null,
  registration = null,
  offline = { ready: false, done: 0, total: 0, error: "" },
  installPrompt = null,
  repairReturn = null,
  repairOrigin = null,
  pausedStudy = null,
  inlineGloss = null,
  repairTag = "unknown",
  repairAnswer = null,
  repairStage = 0,
  attentionDeadline = null,
  returnToPaperId = null,
  activityClock = { key: null, at: 0 },
  stateChanges = Promise.resolve();
const fresh = () => ({
  schema_version: 1,
  evidence_version: 2,
  exposures: {},
  questionEvents: [],
  savedPhrases: [],
  delayedChecks: {},
  studySession: null,
  bank_version: bank.bank_id,
  preferences: {
    level: 0,
    profileId: "vn-A-2025-06",
    dailyLimit: 8,
    theme: "system",
    adaptiveSupport: true,
    examDate: "",
    dailyMinutes: 20,
    setupComplete: false,
  },
  attempts: [],
  exams: [],
  phraseAttempts: [],
  bookmarks: [],
  mistakeEdits: [],
});
const profile = () =>
  profiles.find((p) => p.id === state.preferences.profileId) || profiles[0];
const activeExam = () =>
  state.exams.find((e) => e.id === examId && e.status === "active");
const latest = (id) =>
  state.attempts
    .filter((a) => a.questionId === id)
    .sort((a, b) => a.at - b.at)
    .at(-1);
const history = (id) => state.attempts.filter((a) => a.questionId === id);
const qState = (id) => reviewState(history(id), state.delayedChecks[id] ?? 0);
const tagsFor = (a) =>
  state.mistakeEdits
    .filter((e) => e.attemptId === a.id)
    .sort((a, b) => a.at - b.at)
    .at(-1)?.mistakes ??
  a.mistakes ??
  [];
function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.style.cssText =
    "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:1000;max-width:calc(100% - 30px);padding:12px 18px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);font-size:13px;box-shadow:var(--shadow)";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    node.textContent = "";
    node.style.cssText = "";
  }, 4500);
}
async function persist(next) {
  if (!storageReady) {
    state = next;
    toast(
      "Practice is temporary: browser storage is unavailable. Export a backup before leaving.",
    );
    return;
  }
  try {
    await saveState(next);
    state = next;
    storageError = "";
  } catch (error) {
    storageError = error.message;
    throw Error(
      "Progress could not be saved. Your previous saved record is intact. " +
        error.message,
    );
  }
}
async function change(fn) {
  const update = stateChanges
    .catch(() => {})
    .then(async () => {
      flushActivity();
      const next = structuredClone(state);
      fn(next);
      await persist(next);
      syncActivity();
    });
  stateChanges = update;
  await update;
}
function button(action, label, kind = "secondary", extra = "") {
  return `<button class="button ${kind}" data-action="${action}" ${extra}>${label}</button>`;
}
function openModal(html) {
  modal.innerHTML = `<div class="modal-body">${html}</div>`;
  if (!modal.open) modal.showModal();
}
const closeButton = () => button("close-modal", "Close", "ghost");
function applyTheme() {
  const theme = state.preferences.theme;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === "amoled" ? "#000000" : "#174f43";
  try {
    // Cache only appearance so the loading screen can match before IndexedDB opens.
    localStorage.setItem("duong-appearance", theme);
  } catch (_) { /* Practice still works when localStorage is unavailable. */ }
}
function setView(next) {
  if (study) pausedStudy = study;
  else if (repairReturn) pausedStudy = repairReturn;
  repairReturn = null;
  repairOrigin = null;
  const running = state.exams.find((e) => e.status === "active");
  if (running && next !== "test") {
    view = "test";
    examId = running.id;
    study = null;
    resultId = null;
    render();
    toast("Finish or abandon the active paper before opening study aids.");
    return;
  }
  if (next === "review") {
    collection = "all";
    search = "";
  }
  view = next;
  study = null;
  resultId = null;
  if (next !== "test") examId = null;
  render();
  window.scrollTo(0, 0);
}
function offlineLabel() {
  return offline.ready
    ? "Ready offline"
    : offline.error
      ? "Offline download incomplete"
      : offline.total
        ? `Preparing offline · ${offline.done}/${offline.total}`
        : "Preparing offline";
}
function shell(body) {
  const nav = ["today", "learn", "review", "test"]
    .map(
      (t) =>
        `<button class="nav-link ${view === t ? "active" : ""}" data-action="nav" data-view="${t}" aria-current="${view === t ? "page" : "false"}"><span class="nav-icon" aria-hidden="true">${icons[t]}</span><span>${t[0].toUpperCase() + t.slice(1)}</span></button>`,
    )
    .join("");
  return `<div class="shell"><aside class="sidebar"><nav aria-label="Main navigation">${nav}</nav><div class="sidebar-foot"><p class="eyebrow">ONE ROAD. A LITTLE CLEARER.</p><p>Learn the language.<br>Understand the rules.<br>Ride with confidence.</p><div class="divider"></div><button class="button ghost small" data-action="settings">Settings & backups</button><button class="button ghost small" data-action="about">About the question bank</button><p id="offline-label">${escape(offlineLabel())}</p></div></aside><main class="main ${study || activeExam() ? "practice-mode" : ""}"><a class="brand" href="#today" data-action="nav" data-view="today"><img class="brand-icon" src="assets/icons/duong-192-v1.png" alt="" width="38" height="38"><span>đường<span class="brand-caption">Motorcycle theory, understood</span></span></a><header class="topbar"><span>${escape(prettyDate(now()))}<span class="desktop-only"> · YOUR OWN PACE, EVERY DAY</span></span><div class="row"><span class="tag">LICENCE ${escape(profile().licence_category)}</span><button class="button ghost small" data-action="settings" aria-label="Settings and backups">⚙ <span class="desktop-only">Settings</span></button></div></header>${!storageReady ? `<div class="notice" role="alert"><strong>Progress is not saved on this browser.</strong> ${escape(storageError)} You can practice and export a backup, but timed mocks require working storage.</div>` : ""}${storageReady && storageError ? `<div class="error" role="alert">${escape(storageError)}</div>` : ""}${!profileValid(profile()) ? `<div class="notice"><strong>Archived study bank.</strong> This format was verified through 28 February 2027. Current-exam mocks are disabled until a new bank and profile are verified.</div>` : ""}${body}<p class="footer-note">Your progress stays on this browser. Export a backup to keep a copy. <button class="link" data-action="about">Content & sources</button></p></main></div>`;
}
function render() {
  if (!state) return;
  flushActivity();
  // Reloading an open answer or bilingual card is fresh exposure, too.
  if (study && (study.committed || study.level === 0))
    markExposure(
      study.ids[study.index],
      study.committed ? "answer-feedback" : "translation",
    );
  applyTheme();
  let body = study
    ? studyView()
    : view === "today"
      ? todayView()
      : view === "learn"
        ? learnView()
        : view === "review"
          ? reviewView()
          : view === "phrases"
            ? phraseView()
            : testView();
  app.innerHTML = shell(body);
  updateTimer();
  syncActivity();
}
const roadArt = `<svg viewBox="0 0 260 230" fill="none" aria-hidden="true"><circle cx="137" cy="112" r="95" stroke="#95b49d" stroke-opacity=".2"/><circle cx="137" cy="112" r="64" stroke="#95b49d" stroke-opacity=".2"/><path d="M35 234C10 171 212 198 191 131C169 65 80 109 83 39C84 15 108 0 115-17" stroke="#377061" stroke-width="48"/><path d="M35 234C10 171 212 198 191 131C169 65 80 109 83 39C84 15 108 0 115-17" stroke="#d2b76b" stroke-width="2" stroke-dasharray="9 10"/><circle cx="191" cy="133" r="11" fill="#d2b76b"/><circle cx="191" cy="133" r="4" fill="#174f43"/><path d="M213 51v29m-14-14h29" stroke="#d2b76b" stroke-width="2"/><circle cx="42" cy="91" r="4" fill="#d2b76b" opacity=".7"/><path d="M89 184h18m-9-9v18" stroke="#a8c0aa"/></svg>`;
function todayView() {
  const r = readiness(
      questions,
      state.attempts,
      state.exams,
      now(),
      profiles,
      state.delayedChecks,
    ),
    plan = dailyPlan(
      questions,
      state.attempts,
      state.preferences,
      now(),
      false,
      state.delayedChecks,
    );
  const todayAnswers = state.attempts.filter(
    (a) => hasAnswer(a) && vnDate(a.at) === vnDate(),
  ).length;
  const estimate = plan.estimatedMinutes
    ? `Question time: about ${plan.estimatedMinutes} min from recent active study. Phrase warm-up and repairs add time.`
    : "Time estimate appears after five measured answers. Long new questions may take longer.";
  const backupDue =
    state.attempts.length - (state.backupAttemptCount ?? 0) >= 50;
  return `<div class="page-head"><div><p class="eyebrow">A LITTLE PRACTICE. A CLEARER ROAD.</p><h1>Your next step starts here.</h1><p>Build your Vietnamese, one real question at a time.</p></div><span class="tag">${todayAnswers} answers today</span></div>
  ${state.studySession ? `<section class="notice"><strong>Your unfinished session is saved.</strong><div class="actions">${button("resume-study", "Resume study session", "primary")}</div></section>` : ""}
  ${!state.preferences.setupComplete ? `<section class="notice"><strong>Preparing for A or A1?</strong><p>A2 is the older category name in this repository. Check your current A/A1 category with your school. Add a date and realistic daily minutes to shape your plan, or skip setup.</p><div class="actions">${button("setup", "Set up my plan", "primary")}${button("skip-setup", "Skip for now", "ghost")}</div></section>` : ""}
  <section class="hero"><div class="hero-copy"><p class="eyebrow">TODAY’S PRACTICE</p><h2>Learn the language.<br>Know the way.</h2><p>A balanced mix of critical rules, signs and junctions.<br>English support adapts to each question.</p><div class="actions">${button("daily-learn", "Continue learning →", "primary")}${button("learn-more", "Learn more", "ghost")}</div></div><div class="hero-art">${roadArt}</div></section>
  <section class="stats" aria-label="Learning progress">${[
    [r.coverage, "/250", "Questions answered"],
    [r.mastered, "/250", "Established mastery"],
    [r.criticalFresh, "/20", "Critical checks current"],
    [r.due, "", "Reviews due"],
  ]
    .map(
      ([n, out, label]) =>
        `<div class="stat"><div class="stat-number">${n}<small>${out}</small></div><span class="stat-label">${label}</span></div>`,
    )
    .join("")}</section>
  ${criticalTodayCard()}<div class="grid-two"><section class="card"><div class="card-head"><h2>Your daily session</h2>${button("setup", "Adjust plan", "ghost small")}</div><p class="source-note">${state.preferences.dailyMinutes} minutes available${state.preferences.examDate ? ` · Exam date: ${escape(state.preferences.examDate)}` : ""}. ${estimate}</p>
  ${!plan.deadlineSupported ? '<div class="notice">Your date is after this bank’s 28 February 2027 boundary. This is archived-format study; a verified replacement bank is needed for that exam.</div>' : ""}
  ${plan.overloaded ? '<div class="notice">At your observed pace, the new-question workload exceeds your available time. Allow more minutes or discuss the exam date with your school. Time for reviews and mocks is also needed.</div>' : ""}
  ${[
    [
      1,
      "Phrase warm-up",
      "A finite queue of due and useful new chunks.",
      "warmup",
      "Warm up",
    ],
    [
      2,
      "Due retrieval",
      `${plan.reviewIds.length} priority reviews in today’s session. Delayed checks come before new errors pile up.`,
      "due-review",
      "Review",
    ],
    [
      3,
      "Balanced new content",
      `${plan.newToday}/${plan.proposedNew} recommended new items taught today · ${plan.remaining} left. ${plan.targetComplete ? "Target complete; Learn more is always available." : ""}`,
      "daily-learn",
      "Study",
    ],
    [
      4,
      "Final Vietnamese check",
      "The session ends with a due question when available. Help remains available if you need it.",
      "final-check",
      "Check",
    ],
  ]
    .map(
      ([n, title, desc, action, label]) =>
        `<div class="plan-row"><span class="plan-step">${n}</span><div><h3>${title}</h3><p>${desc}</p></div>${button(action, label, "secondary small")}</div>`,
    )
    .join("")}</section>
  <section class="card"><p class="eyebrow">CONFIDENCE COMES FROM EVIDENCE</p><h2>A pattern you can trust.</h2><p>Past achievement stays in history. Current study evidence needs recent critical checks and strict mocks across different days.</p><div class="progress-track"><div class="progress-fill" style="width:${(r.mastered / 250) * 100}%"></div></div><p class="source-note">${r.revisited}/250 revisited on another day · ${r.lastEvidenceAt ? "Last evidence: " + prettyDate(r.lastEvidenceAt) : "No answer evidence yet"}</p>${button("readiness", "See your readiness evidence", "ghost small")}</section></div>
  <div class="section-head"><h2>Choose your next stretch</h2>${button("browse", "Explore all 250", "ghost small")}</div><section class="topic-grid">${[
    [1, "Road rules", "100 authentic questions", "↗"],
    [5, "Road signs", "90 signs to understand", "△"],
    [6, "Right of way", "35 junction questions", "⇄"],
  ]
    .map(
      ([c, title, desc, icon]) =>
        `<button class="topic-card" data-action="chapter" data-chapter="${c}"><span class="topic-icon">${icon}</span><h3>${title}</h3><p>${desc}</p></button>`,
    )
    .join("")}</section>
  ${backupDue ? `<div class="notice">You have made substantial progress since your last backup. ${button("export", "Save a backup", "secondary small")}</div>` : ""}<p class="source-note">Last backup: ${state.lastBackupAt ? prettyDate(state.lastBackupAt) : "not exported yet"}. ${button("interface-lesson", "Vietnamese test controls", "ghost small")}</p>`;
}

function filteredQuestions(isReview = false) {
  let list = questions.filter(
    (q) => chapter === "all" || q.chapter === Number(chapter),
  );
  if (search) {
    const s = fold(search).trim();
    list = list.filter(
      (q) =>
        String(q.official_id) === s ||
        fold(
          `${q.question.vi} ${q.question.en ?? ""} ${q.options.map((o) => o.text.vi + " " + (o.text.en ?? "")).join(" ")}`,
        ).includes(s),
    );
  }
  if (collection === "critical")
    list = list.filter((q) => q.critical_for_motorcycle);
  if (collection === "saved")
    list = list.filter((q) => state.bookmarks.includes(q.id));
  if (isReview) {
    list = list.filter((q) => {
      const a = latest(q.id),
        r = qState(q.id);
      if (reviewFilter === "critical")
        return q.critical_for_motorcycle && !r.mastered;
      if (reviewFilter === "saved") return state.bookmarks.includes(q.id);
      if (!a) return false;
      if (reviewFilter === "due") return r.due <= now();
      if (reviewFilter === "mistakes") return r.unresolved || !a.correct;
      if (reviewFilter === "unsure")
        return ["unsure", "guessed"].includes(a.confidence);
      if (reviewFilter === "unrated") return a.confidence === "unrated";
      if (reviewFilter === "assisted") return a.correct && usedStudyHelp(a);
      return true;
    });
    if (mistakeFilter !== "all")
      list = list.filter((q) =>
        history(q.id).some(
          (a) => tagsFor(a).includes(mistakeFilter) && qState(q.id).unresolved,
        ),
      );
  }
  return list;
}
function chapterSelect() {
  return `<div class="field"><label for="chapter-select">Topic</label><select id="chapter-select" data-change="chapter"><option value="all">All topics</option>${Object.entries(
    chapterNames,
  )
    .map(
      ([id, title]) =>
        `<option value="${id}" ${chapter === id ? "selected" : ""}>${escape(title)}</option>`,
    )
    .join("")}</select></div>`;
}
function supportSelect() {
  return `<div class="field"><label for="support-select">Starting English support</label><select id="support-select" data-change="support">${levels.map((name, n) => `<option value="${n}" ${state.preferences.level === n ? "selected" : ""}>${n} · ${name}</option>`).join("")}</select></div>`;
}
function bankRows(list) {
  return list.length
    ? `<div class="bank-list">${list
        .map((q) => {
          const a = latest(q.id);
          return `<button class="bank-item" data-action="single" data-id="${q.id}"><span>${q.official_id}</span><div style="flex:1;min-width:0"><p lang="vi">${escape(q.question.vi)}</p><small>${escape(chapterNames[q.chapter])}${a ? ` · ${escape(questionProgressLabel(q, a))}` : " · Not yet attempted"}</small></div>${q.critical_for_motorcycle ? '<span class="tag critical">CRITICAL</span>' : ""}${state.bookmarks.includes(q.id) ? '<span aria-label="Saved">☆</span>' : ""}<span aria-hidden="true">→</span></button>`;
        })
        .join("")}</div>`
    : '<div class="empty"><h3>No questions here yet.</h3><p>Try another filter or topic.</p></div>';
}
function learnView() {
  const list = filteredQuestions();
  return `<div class="page-head"><div><p class="eyebrow">LEARN AT YOUR OWN PACE</p><h1>Understand, then remember.</h1><p>All 250 original questions. Choose the support that helps you move forward.</p></div>${button("phrases", "Vietnamese phrase course", "secondary")}</div><div class="chips">${[
    ["all", "Full bank · 250"],
    ["critical", "Critical · 20"],
    ["saved", `Saved · ${state.bookmarks.length}`],
  ]
    .map(
      ([id, name]) =>
        `<button class="chip ${collection === id ? "active" : ""}" data-action="collection" data-value="${id}">${name}</button>`,
    )
    .join(
      "",
    )}</div>${collection === "critical" ? criticalCollectionPanel() : ""}<div class="toolbar"><div class="field" style="flex:2"><label for="search">Search question number, Vietnamese or English</label><input id="search" type="search" value="${escape(search)}" placeholder="Try 362, nhường đường, or priority" data-input="search"></div>${chapterSelect()}${supportSelect()}</div><div class="row between" style="flex-wrap:wrap;margin:18px 0"><span class="muted">${list.length} questions</span><div class="actions">${button("selected-ids", "Choose question numbers", "ghost small")}${button("study-list", "Study this selection →", "primary", list.length ? "" : "disabled")}</div></div>${bankRows(list)}`;
}
function reviewView() {
  const list = filteredQuestions(true);
  return `<div class="page-head"><div><p class="eyebrow">MAKE IT STICK</p><h1>A second look, a stronger grasp.</h1><p>Revisit the question and the reason it was difficult. A confident unaided retrieval repairs an earlier mistake.</p></div></div><div class="chips">${[
    ["due", "Due"],
    ["mistakes", "Mistakes"],
    ["unsure", "Guessed / unsure"],
    ["assisted", "Correct with help"],
    ["unrated", "Unrated"],
    ["critical", "Critical"],
    ["saved", "Saved"],
  ]
    .map(
      ([id, name]) =>
        `<button class="chip ${reviewFilter === id ? "active" : ""}" data-action="review-filter" data-value="${id}">${name}</button>`,
    )
    .join(
      "",
    )}</div><div class="toolbar">${chapterSelect()}<div class="field"><label for="mistake-select">Mistake reason</label><select id="mistake-select" data-change="mistake"><option value="all">All reasons</option>${Object.entries(
    taxonomy,
  )
    .map(
      ([id, name]) =>
        `<option value="${id}" ${mistakeFilter === id ? "selected" : ""}>${escape(name)}</option>`,
    )
    .join(
      "",
    )}</select></div>${supportSelect()}${button("review-list", `Review ${list.length} questions →`, "primary", list.length ? "" : "disabled")}</div>${bankRows(list)}`;
}
function phraseText(text, policy) {
  return policy.phrases
    ? phraseSegments(text, phrases)
        .map((s) =>
          s.phrase
            ? `<button class="phrase-help" data-action="phrase-help" data-id="${escape(s.phrase.id)}" lang="vi">${escape(s.text)}</button>`
            : escape(s.text),
        )
        .join("")
    : escape(text);
}
function figures(q, strict = false) {
  return q.images.length
    ? `<div class="figures">${q.images.map((im, i) => `<figure class="figure"><button class="button ghost" style="padding:0;background:transparent;display:block;margin:auto" data-action="zoom" data-id="${q.id}" data-index="${i}" aria-label="${escape(strict ? im.alt_vi : "Enlarge " + im.alt_en)}"><img src="${escape(im.path)}" alt="${escape(strict ? im.alt_vi : im.alt_en)}" width="${im.width}" height="${im.height}" data-question-image="${q.id}"></button>${im.figure_label ? `<figcaption lang="vi">Hình ${escape(im.figure_label)}</figcaption>` : ""}</figure>`).join("")}</div>`
    : "";
}
function textBlock(q, field, vi, en, policy, ctx) {
  const showEn =
    ctx.examFinished ||
    (ctx.committed && ctx.level < 3) ||
    ctx.reveals?.has("review") ||
    ctx.level === 0 ||
    ctx.reveals?.has(field);
  const allowed = policy.english || policy.englishOnRequest;
  return `<div lang="vi">${phraseText(vi, policy)}</div>${showEn && allowed ? `<div class="translation" lang="en">${escape(en ?? "English content unavailable for this item.")}</div>` : policy.englishOnRequest && ctx.level === 1 ? `<button class="button ghost small" data-action="reveal" data-field="${escape(field)}">Reveal English</button>` : ""}`;
}
function questionContent(q, ctx) {
  const policy = languagePolicy(ctx.level, ctx.committed, ctx.examFinished),
    showFeedback = policy.feedback;
  return `<div class="question-top"><div class="row"><span>${ctx.paperPosition ? `Question ${ctx.paperPosition} of 25` : `QUESTION ${q.official_id}`}</span>${ctx.paperPosition ? `<span class="source-note">Bank ID ${q.official_id}</span>` : ""}${policy.critical && q.critical_for_motorcycle ? '<span class="tag critical">CRITICAL</span>' : ""}<span>${escape(chapterNames[q.chapter])}</span></div>${ctx.level !== 4 ? `<button class="button ghost small" data-action="bookmark" data-id="${q.id}" aria-label="${state.bookmarks.includes(q.id) ? "Remove bookmark" : "Save question"}">${state.bookmarks.includes(q.id) ? "★ Saved" : "☆ Save"}</button>` : ""}</div><div class="question-text">${textBlock(q, "question", q.question.vi, q.question.en, policy, ctx)}</div>${figures(q, policy.strict)}${ctx.level !== 4 ? decodeControls(q, ctx) : ""}<div class="options" role="radiogroup" aria-label="Answer options">${q.options
    .map((o) => {
      const selected = ctx.answerId === o.id,
        correct = showFeedback && o.id === q.correct_option_id,
        wrong = showFeedback && selected && !correct;
      return `<div class="option ${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "incorrect" : ""}" ${ctx.committed || ctx.examFinished ? "" : `data-action="answer" data-id="${o.id}" role="radio" tabindex="0" aria-checked="${selected}"`}><span class="option-number">${o.number}</span><div class="option-body">${textBlock(q, o.id, o.text.vi, o.text.en, policy, ctx)}</div>${correct ? '<span aria-label="Correct answer">✓</span>' : wrong ? '<span aria-label="Your incorrect answer">×</span>' : ""}</div>`;
    })
    .join("")}</div>${showFeedback ? feedback(q, ctx) : ""}`;
}
function feedback(q, ctx) {
  const correct = ctx.answerId === q.correct_option_id,
    english = ctx.examFinished || ctx.level < 3 || ctx.reveals?.has("review");
  return `<section class="feedback ${correct ? "good" : "bad"}"><h3>${correct ? "Correct answer." : ctx.answerId ? "A useful question to revisit." : "This question was unanswered."}</h3>${ctx.level !== 4 ? learningEvidence(q, { ...ctx, correct }) : ""}<p>Official answer: <strong>${q.correct_option_number}</strong> <span lang="vi">${escape(q.options.find((o) => o.id === q.correct_option_id).text.vi)}</span></p>${ctx.level === 3 && !english ? button("review-english", "Reveal English review", "secondary small") : ""}${english ? `<p>${escape(q.explanation?.en ?? "Use the official keyed choice above and the source reference to review this question.")}</p>${q.image_glosses_en?.length ? `<p class="muted">${escape(q.image_glosses_en.map((x) => (typeof x === "string" ? x : (x.en ?? x.text ?? ""))).join(" · "))}</p>` : ""}${q.language_chunks?.length ? `<p class="source-note">${q.language_chunks.map((c) => `<span lang="vi">${escape(c.vi)}</span> = ${escape(c.en)}`).join(" · ")}</p>` : ""}` : ""}${ctx.level !== 4 && (!correct || ["unsure", "guessed"].includes(ctx.confidence)) ? `<p class="source-note">${correct ? (ctx.confidence === "guessed" ? "A correct guess still deserves another retrieval." : "This answer was correct, but you marked it unsure. Revisit it later.") : "Name what made this difficult. These are your choices, not an automatic diagnosis."}</p>${reasonGrid(ctx.attemptId)}` : ""}<p class="source-note">Official source · PDF page ${q.source.pdf_pages_1_based.join(", ")} · <a href="${escape(q.source.pdf_path)}#page=${q.source.pdf_pages_1_based[0]}" target="_blank" rel="noopener">Open source after answering</a><br>English is AI-authored learning support, not an official translation.</p>${q.source_caution ? `<p class="notice">Source wording note: ${escape(q.source_caution)}</p>` : ""}${ctx.level !== 4 ? `<div class="actions">${button("repair-phrases", "Repair with linked phrases", "ghost small", `data-id="${q.id}"`)}${button("schedule-check", "Retrieve tomorrow in Vietnamese", "ghost small", `data-id="${q.id}"`)}</div>` : ""}</section>`;
}
function reasonGrid(attemptId) {
  const a = state.attempts.find((a) => a.id === attemptId);
  if (!a) return "";
  const tag = tagsFor(a)[0] ?? "unknown";
  return `<div class="field"><label for="repair-reason">What made this difficult?</label><select id="repair-reason" data-change="reason" data-attempt="${a.id}">${Object.entries(
    taxonomy,
  )
    .map(
      ([id, label]) =>
        `<option value="${id}" ${id === tag ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></div><p class="source-note">${escape(repairPrompts[tag])}</p>${button("start-repair", "Try a focused repair activity", "secondary small", `data-id="${a.questionId}" data-tag="${tag}"`)}`;
}

function startStudy(
  ids,
  level = null,
  mode = view === "review" ? "review" : "learn",
) {
  const running = state.exams.find((e) => e.status === "active");
  if (running) {
    view = "test";
    examId = running.id;
    study = null;
    render();
    toast("Finish or abandon your active paper before starting study.");
    return;
  }
  if (!ids.length) {
    toast("No questions match this selection.");
    return;
  }
  pausedStudy = null;
  if (!repairReturn) repairOrigin = null;
  study = {
    ids: [...ids],
    index: 0,
    level: 0,
    fixedLevel: level,
    mode,
    sessionId: uid(),
    answerId: null,
    committed: false,
    confidence: "unrated",
    reveals: new Set(),
    support: [],
    startedAt: now(),
    attemptId: null,
    retried: new Set(),
    activeMs: 0,
  };
  prepareStudyQuestion();
  render();
  window.scrollTo(0, 0);
}

function studyView() {
  const q = byId.get(study.ids[study.index]);
  return `<div class="page-head"><div><p class="eyebrow">${study.mode === "critical-drill" ? "ALL 20 CRITICAL QUESTIONS" : study.mode === "paper-repair" ? "REPAIR THIS PAPER" : "LEARN & UNDERSTAND"}</p><h1>${levels[study.level]} practice</h1><p>${study.index + 1} of ${study.ids.length} · ${study.mode === "critical-drill" ? "Learning drill with feedback, not a mock." : "Original choices stay in their original order."}</p>${returnToPaperId ? '<p class="source-note">Your original paper score stays unchanged.</p>' : ""}</div>${button("end-study", "Pause session", "ghost")}</div>
  ${attentionDeadline ? `<div class="notice" data-attention-clock>Controlled practice · ${Math.max(0, Math.ceil((attentionDeadline - now()) / 1000))} seconds left. This is a study activity; no exam score.</div>` : ""}
  <div class="question-shell"><div class="row between" style="margin-bottom:15px"><span class="tag">${levels[study.level]}</span>${study.mode === "critical-drill" ? "" : button("change-support", "Adjust English support", "ghost small")}</div><p class="source-note">${escape(study.supportReason ?? "")}</p>
  <section class="question-card">${questionContent(q, { ...study, examFinished: false })}
  ${!study.committed ? confidenceControls(study) : ""}<div class="study-controls"><span>${study.index + 1}/${study.ids.length}${study.answerId ? " · Option " + byId.get(q.id).options.find((o) => o.id === study.answerId)?.number + " selected" : " · Choose an answer"}</span>${!study.committed ? button("commit", "Check answer", "primary", study.answerId ? "" : "disabled") : button("next-study", study.index + 1 < study.ids.length ? "Next question →" : "Finish session", "primary")}</div></section>
  ${repairReturn ? button("return-question", "Return to question " + byId.get(repairOrigin).official_id, "secondary") : ""}</div>`;
}

function dailyLearn(learnMore = false) {
  const plan = dailyPlan(
    questions,
    state.attempts,
    state.preferences,
    now(),
    learnMore,
    state.delayedChecks,
  );
  if (!plan.ids.length) {
    openModal(
      `<h2>${plan.remaining ? "Today’s recommended new content is complete." : "You have taught the whole bank."}</h2><p>Keep practising deliberately. You can learn more, revisit familiar questions or use the full bank.</p><div class="actions">${plan.remaining ? button("learn-more", "Learn more", "primary") : ""}${button("browse", "Browse questions", "secondary")}${closeButton()}</div>`,
    );
    return;
  }
  view = "learn";
  startStudy(plan.ids, null, "daily");
  study.finalCheckId = plan.reviewIds.at(-1) ?? null;
}

async function commitStudy() {
  if (!study || study.committed || !study.answerId) return;
  const q = byId.get(study.ids[study.index]);
  if (q.content_error)
    throw Error(
      "This question needs its source diagram. Reload or retry offline preparation before answering.",
    );
  study.recentExposure =
    study.recentExposure ||
    (recentExposure(state.exposures, q.id) && !study.support.length);
  const at = now(),
    event = {
      id: uid(),
      kind: "answer-submitted",
      questionId: q.id,
      answerId: study.answerId,
      correct: study.answerId === q.correct_option_id,
      at,
      startedAt: study.startedAt,
      level: study.level,
      activeMs: study.activeMs,
      recentExposure: study.recentExposure,
      confidenceSource:
        study.confidence === "unrated" ? "unprovided" : "explicit",
      support: structuredClone(study.support),
      confidence: study.confidence,
      mistakes: [],
      taxonomy_version: 1,
      sessionId: study.sessionId,
      mode: study.mode,
    };
  await change((s) => {
    s.attempts.push(event);
    s.questionEvents.push({
      id: uid(),
      questionId: q.id,
      at,
      kind: "teaching-completed",
      sessionId: study.sessionId,
    });
  });
  markExposure(q.id, "answer-feedback");
  study.committed = true;
  study.attemptId = event.id;
  if (
    study.mode !== "critical-drill" &&
    (!event.correct || ["unsure", "guessed"].includes(event.confidence)) &&
    !study.retried.has(q.id) &&
    study.ids.length - study.index - 1 >= 3
  ) {
    study.ids.splice(study.index + 4, 0, q.id);
    study.retried.add(q.id);
  }
  render();
}
function setupPhraseQueue(ids = null) {
  const criticalIds = new Set(
    questions
      .filter((q) => q.critical_for_motorcycle)
      .flatMap((q) => q.phrase_ids),
  );
  phraseQueue =
    ids !== null
      ? ids.filter((id) => byPhrase.has(id))
      : phraseDailyQueue(phrases, state.phraseAttempts, now(), 8, criticalIds);
  phraseIndex = 0;
  resetPhrase();
}

function resetPhrase() {
  phraseRevealed = false;
  phraseAnswer = null;
  const p = byPhrase.get(phraseQueue[phraseIndex]);
  if (p) {
    const contrasting = (p.contrast_ids ?? [])
      .map((id) => byPhrase.get(id))
      .filter(Boolean);
    const alternate =
      contrasting[0] ||
      phrases.find((x) => x.id !== p.id && x.group === p.group) ||
      phrases.find((x) => x.id !== p.id);
    phraseChoices = [p, alternate].sort(() => Math.random() - 0.5);
  }
}
function phraseView() {
  const p = byPhrase.get(phraseQueue[phraseIndex]);
  if (!p)
    return `<div class="empty"><h2>${phraseQueue.length ? "Phrase session complete." : "No phrases due in this queue."}</h2><p>${repairOrigin ? "Return to your original question to finish the repair." : "New and due phrases return in the next daily queue."}</p><div class="actions">${repairOrigin ? button("return-question", "Return to question " + byId.get(repairOrigin).official_id, "primary") : button("browse", "Back to questions", "primary")}${button("phrases", "Start another phrase session", "secondary")}</div></div>`;
  const due = phrases.filter((p) => {
    const a = state.phraseAttempts.filter((x) => x.phraseId === p.id).at(-1);
    return a && a.at + (a.intervalDays ?? 1) * 86400000 <= now();
  }).length;
  const occurrence =
      p.occurrences?.find((o) => o.question_id === repairOrigin) ??
      p.occurrences?.[0],
    linked = occurrence ? byId.get(occurrence.question_id) : null;
  let sourceText = linked?.question.vi ?? "";
  if (linked && occurrence.field.startsWith("options.")) {
    const optionId = occurrence.field.split(".")[1];
    sourceText =
      linked.options.find((o) => o.id === optionId)?.text.vi ?? sourceText;
  }
  let sourceEnglish = linked?.question.en ?? "";
  if (linked && occurrence.field.startsWith("options."))
    sourceEnglish =
      linked.options.find((o) => o.id === occurrence.field.split(".")[1])?.text
        .en ?? sourceEnglish;
  const content =
    phraseMode === "sentence"
      ? `<p class="eyebrow">INTERPRET THE WHOLE SENTENCE</p><p lang="vi" class="question-text">${escape(sourceText)}</p><p>Identify the task, situation and any qualifier. Say its meaning before revealing English.</p>${phraseRevealed ? `<p>${escape(sourceEnglish)}</p><p>${escape(p.reading_note_en)}</p>` : button("phrase-reveal", "Reveal sentence meaning", "primary")}`
      : phraseMode === "meaning"
        ? `<p class="eyebrow">WHAT DOES THIS VIETNAMESE CHUNK MEAN?</p><div class="phrase-word" lang="vi">${escape(p.vi)}</div>${linked ? `<p lang="vi">${escape(sourceText)}</p>` : ""}<div class="actions">${phraseChoices.map((x) => button("phrase-answer", escape(x.en), phraseAnswer && x.id === p.id ? "primary" : "secondary", `data-id="${x.id}" ${phraseAnswer ? "disabled" : ""}`)).join("")}</div>${phraseAnswer ? `<p>${phraseAnswer === p.id ? "Correct." : "Read it again: " + escape(p.en)} ${escape(p.reading_note_en)}</p>` : ""}`
        : phraseMode === "contrast"
          ? `<p class="eyebrow">WHICH VIETNAMESE PHRASE MEANS THIS?</p><div class="phrase-meaning">${escape(p.en)}</div><div class="actions" style="justify-content:center">${phraseChoices.map((x) => button("phrase-answer", escape(x.vi), phraseAnswer && x.id === p.id ? "primary" : "secondary", `data-id="${x.id}" ${phraseAnswer ? "disabled" : ""}`)).join("")}</div>${phraseAnswer ? `<p class="source-note">${phraseAnswer === p.id ? "Correct." : "The matching phrase is " + escape(p.vi) + "."} ${escape(p.reading_note_en)}</p>` : ""}`
          : phraseMode === "locate"
            ? `<p class="eyebrow">FIND IT IN AN AUTHENTIC QUESTION</p><div class="phrase-word" lang="vi">${escape(p.vi)}</div>${
                linked
                  ? `<p class="question-text" style="font-size:19px;font-weight:400" lang="vi">${locateSentence(sourceText, p, phraseRevealed)}</p><p class="source-note">From question ${linked.official_id}. This excerpt does not identify the correct answer.</p>`
                  : '<p class="muted">Use the linked question collection to practise this phrase.</p>'
              }${phraseRevealed ? `<div class="phrase-meaning">${escape(p.en)}</div><p class="muted">${escape(p.reading_note_en)}</p>` : `<p class="source-note">Tap the target chunk in the sentence before revealing its meaning.</p>`}`
            : `<p class="eyebrow">READ THE PHRASE, THEN RECALL ITS MEANING</p><div class="phrase-word" lang="vi">${escape(p.vi)}</div>${phraseRevealed ? `<div class="phrase-meaning">${escape(p.en)}</div><p class="muted">${escape(p.reading_note_en)}</p>` : button("phrase-reveal", "Reveal the meaning", "primary")}`;
  return `<div class="page-head"><div><p class="eyebrow">THE LANGUAGE OF THE TEST</p><h1>Small phrases. Big differences.</h1><p>${phrases.length} useful chunks · ${due} due for another look</p></div>${button("browse", "Back to question bank", "ghost")}</div><div class="chips">${[
    ["flash", "Read & recall"],
    ["meaning", "Vietnamese → English"],
    ["locate", "Find in a question"],
    ["sentence", "Interpret sentence"],
    ["contrast", "English → Vietnamese"],
  ]
    .map(
      ([id, name]) =>
        `<button class="chip ${phraseMode === id ? "active" : ""}" data-action="phrase-mode" data-value="${id}">${name}</button>`,
    )
    .join(
      "",
    )}</div><section class="phrase-card">${content}${p.ambiguous_without_context ? '<p class="source-note">This phrase needs context. Its meaning cannot safely be guessed from an isolated word.</p>' : ""}${speechVoice() ? `<div class="actions">${button("phrase-speak", "Listen · normal", "ghost small", 'data-rate="1"')}${button("phrase-speak", "Listen · slow", "ghost small", 'data-rate="0.75"')}</div>` : `<p class="source-note">No Vietnamese voice is installed in this browser. Use the written chunk and meaning for reading practice; audio is optional.</p>`}</section><div class="actions" style="justify-content:center">${["contrast", "meaning"].includes(phraseMode) ? (phraseAnswer ? button("phrase-next", "Next phrase →", "primary") : "") : phraseRevealed ? `${button("phrase-rate", "Needs another look", "secondary", 'data-value="false"')}${button("phrase-rate", "I recalled it", "primary", 'data-value="true"')}` : ""}</div><p class="source-note" style="text-align:center">Phrase ${Math.min(phraseIndex + 1, phraseQueue.length)} of ${phraseQueue.length} · Reading practice, not a spelling test.</p>${repairOrigin ? `<div class="actions">${button("return-question", "Return to question " + byId.get(repairOrigin).official_id, "primary")}${button("phrase-transfer", "Try another occurrence", "secondary", `data-id="${p.id}"`)}</div>` : ""}${linked ? `<div class="card" style="margin-top:25px"><div class="row between" style="flex-wrap:wrap"><div><h3>Put the phrase to work.</h3><p class="muted">Return to an authentic question with less English help.</p></div>${button("single", "Practise question " + linked.official_id, "secondary", `data-id="${linked.id}" data-level="2"`)}</div></div>` : ""}`;
}
function speechVoice() {
  return window.speechSynthesis
    ?.getVoices()
    .find((v) => v.lang.toLowerCase().startsWith("vi"));
}
async function recordPhrase(correct) {
  const p = byPhrase.get(phraseQueue[phraseIndex]);
  if (!p) return;
  const past = state.phraseAttempts.filter((a) => a.phraseId === p.id),
    at = now();
  const event = {
    id: uid(),
    phraseId: p.id,
    at,
    correct,
    activity: phraseMode,
  };
  event.intervalDays = phraseReviewState([...past, event]).intervalDays;
  await change((s) => s.phraseAttempts.push(event));
}

function testView() {
  const p = profile(),
    e = activeExam(),
    result = resultId ? state.exams.find((x) => x.id === resultId) : null;
  if (e) return examView(e);
  if (result) return resultsView(result);
  const current = state.exams.find((e) => e.status === "active");
  const exams = [...state.exams].sort((a, b) => b.startedAt - a.startedAt);
  return `<div class="page-head"><div><p class="eyebrow">PUT YOUR READING TO THE TEST</p><h1>A clear picture of your progress.</h1><p>Original Vietnamese. No hints during the paper. A full review when you finish.</p></div></div>${current ? `<div class="notice"><strong>A paper is in progress.</strong> Its clock continues in the background.<div class="actions" style="margin-top:12px">${button("resume-exam", "Resume saved paper", "primary", `data-id="${current.id}"`)}${button("abandon-exam", "Abandon this paper", "ghost", `data-id="${current.id}"`)}</div></div>` : ""}<div class="grid-two"><section class="card"><p class="eyebrow">AUTHENTIC FORMAT · LICENCE ${p.licence_category}</p><h2>A strict timed mock</h2><div class="row" style="gap:23px;margin:23px 0"><div><div class="stat-number">25</div><small class="muted">questions</small></div><div><div class="stat-number">19</div><small class="muted">minutes</small></div><div><div class="stat-number">${p.minimum_correct}</div><small class="muted">to pass</small></div></div><p class="muted">Exactly one critical question. A wrong or blank critical answer fails the paper. No English, hints or answer feedback before final submission.</p>${button("start-exam", "Start a timed mock →", "primary", !profileValid(p) || !storageReady || current ? "disabled" : "")}<p class="source-note">Current profile valid through 28 February 2027, Vietnam time. Reloading never resets the paper or clock.</p></section><section class="card"><p class="eyebrow">BUILD FAMILIARITY</p><h2>An untimed practice paper</h2><p class="muted">The same 25-question mix and Vietnamese-only experience, with time to think. The result is marked as untimed practice and does not count toward your strict-mock evidence.</p>${button("start-practice", "Start untimed practice", "secondary", !profileValid(p) || !storageReady || current ? "disabled" : "")}<div class="divider"></div><p class="source-note">All answer choices retain their official order. Both papers save after every selection.</p></section></div><section class="card"><div class="card-head"><h2>Your paper history</h2>${button("readiness", "Readiness evidence", "ghost small")}</div>${exams.length ? `<div class="bank-list">${exams.map((e) => `<button class="bank-item" data-action="${e.status === "active" ? "resume-exam" : "exam-result"}" data-id="${e.id}"><div><strong>${e.timed === false ? "Untimed practice" : "Strict timed mock"} · ${escape(e.profileId.includes("A1") ? "A1" : "A")}</strong><p class="source-note">${escape(prettyDate(e.startedAt))} · ${e.status === "abandoned" ? "Abandoned — not a pass" : e.status === "active" ? "In progress" : e.result.passed ? "Passed" : "Not passed"}</p></div><span class="stat-number" style="font-size:24px">${e.result ? e.result.correct + "/25" : "—"}</span></button>`).join("")}</div>` : '<p class="muted">Your completed and abandoned papers will appear here.</p>'}</section>`;
}
async function verifyFigures() {
  if (offline.ready) return questions;
  toast("Checking source diagrams before preparing the paper…");
  const images = questions.flatMap((q) => q.images.map((im) => ({ q, im }))),
    bad = new Set();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < images.length) {
        const { q, im } = images[cursor++];
        try {
          const response = await fetch(im.path);
          if (!response.ok) throw Error("Missing diagram");
          const hash = [
            ...new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                await response.arrayBuffer(),
              ),
            ),
          ]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (hash !== im.sha256) throw Error("Diagram checksum differs");
        } catch {
          bad.add(q.id);
        }
      }
    }),
  );
  if (bad.size)
    toast(
      `${bad.size} questions have unavailable diagrams and are excluded from this paper.`,
    );
  return questions.map((q) =>
    bad.has(q.id) ? { ...q, unavailable: true } : q,
  );
}
async function startExam(timed) {
  if (!storageReady)
    throw Error(
      "Browser storage must work before a timed or saved paper can start.",
    );
  if (!profileValid(profile()))
    throw Error(
      "This profile has expired. Archived learning remains available.",
    );
  if (state.exams.some((e) => e.status === "active"))
    throw Error("Resume or abandon your existing paper first.");
  const eligible = await verifyFigures(),
    paper = generatePaper(eligible, profile(), uid()),
    startedAt = now(),
    exam = {
      id: uid(),
      ids: paper.ids,
      seed: paper.seed,
      answers: {},
      flags: {},
      timings: {},
      startedAt,
      deadline: timed
        ? startedAt + profile().duration_seconds * 1000
        : Number.MAX_SAFE_INTEGER,
      profileId: profile().id,
      bankVersion: bank.bank_id,
      status: "active",
      timed,
      level: 4,
      mode: timed ? "exam" : "practice",
    };
  await change((s) => s.exams.push(exam));
  examId = exam.id;
  examIndex = 0;
  resultId = null;
  view = "test";
  study = null;
  render();
  window.scrollTo(0, 0);
}
function examView(e) {
  const q = byId.get(e.ids[examIndex]),
    answered = Object.values(e.answers).filter(Boolean).length;
  return `<div class="page-head"><div><p class="eyebrow">${e.timed === false ? "UNTIMED PRACTICE" : "STRICT TIMED MOCK"} · VIETNAMESE ONLY</p><h1>One question at a time.</h1><p>${answered} of 25 answered · Your selections are saved.</p></div>${button("abandon-exam", "Abandon paper", "ghost small", `data-id="${e.id}"`)}</div><div class="exam-layout"><div class="question-shell"><section class="question-card">${questionContent(q, { level: 4, committed: false, examFinished: false, answerId: e.answers[q.id], paperPosition: examIndex + 1, reveals: new Set() })}<div class="confidence" role="group" aria-label="Optional uncertainty flag">${["unsure", "guessed"].map((flag) => button("exam-flag", (e.flags?.[q.id] === flag ? "✓ " : "") + (flag === "unsure" ? "Unsure" : "Guessed"), "secondary small", `data-value="${flag}" aria-pressed="${e.flags?.[q.id] === flag}"`)).join("")}</div><div class="actions between">${button("exam-prev", "← Previous", "secondary", examIndex === 0 ? "disabled" : "")}${button(examIndex === 24 ? "submit-exam" : "exam-next", examIndex === 24 ? "Review & submit" : "Next →", "primary")}</div></section></div><aside class="exam-nav"><h3>${e.timed === false ? "No time limit" : "Time remaining"}</h3><div class="timer" data-timer>${timerText(e)}</div><p>${answered}/25 answered</p><div class="question-numbers">${e.ids.map((id, i) => `<button class="number ${i === examIndex ? "current" : ""} ${e.answers[id] ? "answered" : ""}" data-action="exam-go" data-index="${i}" aria-label="Question ${i + 1}${e.answers[id] ? ", answered" : ""}" aria-current="${i === examIndex ? "step" : "false"}">${i + 1}${e.flags?.[id] ? " •" : ""}</button>`).join("")}</div>${button("submit-exam", "Submit whole paper", "primary")}<p class="source-note">Background time counts. Answers can be changed until submission.</p></aside></div>`;
}
function timerText(e) {
  if (e.timed === false) return "Untimed";
  const seconds = Math.max(0, Math.ceil((e.deadline - now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateTimer() {
  const e = activeExam();
  if (e)
    for (const el of document.querySelectorAll("[data-timer]")) {
      el.textContent = timerText(e);
      el.classList.toggle(
        "urgent",
        e.timed !== false && e.deadline - now() < 120000,
      );
    }
}
async function finishExam(id, expired = false) {
  flushActivity();
  const old = state.exams.find((e) => e.id === id);
  if (!old || old.status !== "active") return;
  const p = profiles.find((p) => p.id === old.profileId),
    finishedAt = old.timed === false ? now() : Math.min(now(), old.deadline);
  const result = scorePaper(questions, p, old.ids, old.answers);
  await change((s) => {
    const e = s.exams.find((x) => x.id === id);
    if (e.status !== "active") return;
    Object.assign(e, { status: "completed", finishedAt, result, expired });
    for (const questionId of e.ids) {
      const q = byId.get(questionId),
        answerId = e.answers[questionId] ?? null,
        attemptId = `${e.id}-${questionId}`;
      if (s.attempts.some((a) => a.id === attemptId)) continue;
      const timing = e.timings?.[questionId];
      s.attempts.push({
        id: attemptId,
        kind: answerId ? "answer-submitted" : "exam-blank",
        questionId,
        answerId,
        correct: answerId === q.correct_option_id,
        at: finishedAt,
        startedAt: Math.min(timing?.firstViewedAt ?? e.startedAt, finishedAt),
        activeMs: timing?.activeMs ?? null,
        visits: timing?.visits ?? 0,
        level: 4,
        support: [],
        confidence: e.flags?.[questionId] ?? "unrated",
        confidenceSource: e.flags?.[questionId] ? "explicit" : "unprovided",
        recentExposure: recentExposure(
          s.exposures,
          questionId,
          timing?.lastAnsweredAt ?? finishedAt,
        ),
        mistakes: [],
        taxonomy_version: 1,
        sessionId: e.id,
        mode: e.timed === false ? "practice" : "exam",
      });
      if (!answerId)
        s.questionEvents.push({
          id: uid(),
          questionId,
          at: finishedAt,
          kind: "exam-blank",
          sessionId: e.id,
        });
    }
  });
  examId = null;
  resultId = id;
  study = null;
  view = "test";
  if (modal.open) modal.close();
  render();
  window.scrollTo(0, 0);
  if (expired) toast("Time is up. Your saved answers have been submitted.");
}

function resultsView(e) {
  if (e.status === "abandoned")
    return `<div class="page-head"><div><p class="eyebrow">PAPER HISTORY</p><h1>This paper was abandoned.</h1><p>Its saved selections remain in history. It does not count as a pass or a completed mock.</p></div></div>${button("back-test", "Back to Test", "primary")}`;
  const p = profiles.find((p) => p.id === e.profileId),
    seconds = Math.max(0, Math.round((e.finishedAt - e.startedAt) / 1000));
  return `<div class="page-head"><div><p class="eyebrow">${e.timed === false ? "UNTIMED PRACTICE RESULT" : "STRICT MOCK RESULT"} · LICENCE ${p.licence_category}</p><h1>${e.result.passed ? "A solid step forward." : "You know what to revisit."}</h1><p>This result is saved permanently. Reviewing below does not change it.</p></div>${button("back-test", "Back to Test", "ghost")}</div><section class="card"><div class="row between" style="flex-wrap:wrap"><div><div class="result-score">${e.result.correct}<small>/25</small></div><span class="tag ${e.result.passed ? "" : "critical"}">${e.result.passed ? "PASSED" : "NOT PASSED"}</span></div><div><p>${e.result.unanswered} unanswered · ${Math.floor(seconds / 60)}m ${seconds % 60}s used${e.expired ? " · Time expired" : ""}</p><p class="muted">${e.result.criticalWrong ? "A critical question was wrong or unanswered. This fails the paper regardless of the total." : `Critical question answered correctly. Licence ${p.licence_category} requires at least ${p.minimum_correct}/25.`}</p></div></div></section>${criticalResultRepair(e)}<section class="card"><h2>Repair this paper</h2><p>Work through wrong, unanswered and flagged questions. Your original ${e.result.correct}/25 score stays unchanged. Immediate repairs are followed by delayed Vietnamese checks.</p>${button("repair-paper", "Repair this paper →", "primary", `data-id="${e.id}"`)}</section><div class="section-head"><h2>Understand every answer</h2></div>${e.ids
    .map((id, i) => {
      const q = byId.get(id);
      return `<details data-review-question="${q.id}"><summary>${i + 1}. Question ${q.official_id} · ${e.answers[id] === q.correct_option_id ? "Correct" : e.answers[id] ? "Incorrect" : "Unanswered"}${q.critical_for_motorcycle ? " · Critical" : ""}</summary><div>${questionContent(q, { level: 4, committed: true, examFinished: true, answerId: e.answers[id], reveals: new Set(["review"]), confidence: e.flags?.[id] ?? "unrated" })}</div></details>`;
    })
    .join("")}`;
}
function settings() {
  openModal(
    `<p class="eyebrow">MAKE THIS SPACE YOURS</p><h2>Settings & backups</h2><div class="actions">${button("setup", "Exam date & daily minutes", "secondary small")}${button("personal-phrases", "My saved phrases", "ghost small")}</div><div class="settings-grid"><div class="field"><label><input id="setting-adaptive" type="checkbox" ${state.preferences.adaptiveSupport ? "checked" : ""}> Recommend support per question</label><label for="setting-level">Starting English support</label><select id="setting-level">${levels.map((name, n) => `<option value="${n}" ${state.preferences.level === n ? "selected" : ""}>${n} · ${name}</option>`).join("")}</select></div><div class="field"><label for="setting-profile">Licence category</label><select id="setting-profile">${profiles.map((p) => `<option value="${p.id}" ${p.id === state.preferences.profileId ? "selected" : ""}>${p.licence_category} · ${p.minimum_correct}/25 required</option>`).join("")}</select></div><div class="field"><label for="setting-limit">Daily new-question target</label><input id="setting-limit" type="number" min="1" max="250" value="${state.preferences.dailyLimit}"></div><div class="field"><label for="setting-theme">Appearance</label><select id="setting-theme">${[["system", "System"], ["light", "Light"], ["dark", "Dark"], ["amoled", "AMOLED · Pure black"]].map(([value, label]) => `<option value="${value}" ${state.preferences.theme === value ? "selected" : ""}>${label}</option>`).join("")}</select></div></div><div class="actions">${button("save-settings", "Save preferences", "primary")}${closeButton()}</div><div class="divider"></div><h3>Your progress, your copy</h3><p class="source-note">Last export: ${state.lastBackupAt ? escape(prettyDate(state.lastBackupAt)) : "not exported yet"}</p><p class="muted">Progress belongs to this browser and device. Clearing browser storage removes it. Export regularly and import the file to continue elsewhere.</p><div class="actions">${button("export", "Export JSON backup", "secondary")}${button("choose-import", "Import a backup", "secondary")}${button("rollback", "Restore before last import", "ghost small")}</div><input id="backup-file" type="file" accept="application/json,.json" data-change="import-file" hidden><div class="divider"></div><h3>Offline practice</h3><p id="offline-settings-status">${escape(offlineLabel())}${offline.error ? "<br>" + escape(offline.error) : ""}</p><p class="source-note">Offline readiness is shown only after the app, complete bank and all diagrams pass checksum verification. Keep this page open until preparation finishes.</p><div class="actions">${button("retry-offline", offline.ready ? "Check for app updates" : "Retry offline preparation", "secondary small")}${installPrompt ? button("install", "Install on this device", "primary small") : ""}</div>${registration?.waiting ? '<div class="notice">New content is ready. Refresh when convenient; your saved paper and timer will resume.</div>' : ""}<div class="divider"></div><p class="source-note">App version: ${escape(appVersion)}<br>Bank: ${escape(bank.bank_id)} · Local schema 1<br>Profile verified through ${escape(profile().valid_through)} · Asia/Ho_Chi_Minh</p><div class="actions">${button("about", "Content & source notes", "ghost small")}${button("reset", "Reset local progress", "danger small")}</div>`,
  );
}
function about() {
  if (state.exams.some((e) => e.status === "active")) {
    toast("Source notes are available after the whole paper ends.");
    return;
  }
  openModal(
    `<p class="eyebrow">FAITHFUL TO THE SOURCE</p><h2>The content behind your practice</h2><p>All <strong>250</strong> Vietnamese questions, <strong>790</strong> answer choices, <strong>20</strong> motorcycle-critical flags and <strong>128</strong> original source diagrams are bundled locally. Official question numbers retain their gaps from the 600-question book.</p><p>Vietnamese text, option order and keyed answers come from the supplied official-source audit. English questions, choices and teaching notes are AI-authored learning support and were reviewed for fidelity; they are <strong>not an official English translation</strong> or a guarantee of passing.</p><p>${escape(typeof bank.translation_notice === "string" ? bank.translation_notice : "The original Vietnamese and official answer keys remain authoritative. Translations do not replace examination wording.")}</p><h3>Current-format boundary</h3><p>The supplied A/A1 profile has 25 questions, 19 minutes and exactly one critical question. A requires 23 correct, A1 requires 21; a wrong or unanswered critical answer fails. Valid through <strong>28 February 2027</strong>, using Vietnam-local dates. From 1 March 2027 this app keeps archived study available and disables current-format mocks until verified new content is installed.</p><h3>Source wording notes</h3>${[
      44, 64, 124, 260, 377, 432,
    ]
      .map((id) => byId.get("q" + String(id).padStart(3, "0")))
      .filter(Boolean)
      .map(
        (q) =>
          `<p class="source-note"><strong>Question ${q.official_id}:</strong> ${escape(q.source_caution ?? "The official wording and answer are retained. Read qualifiers and enumeration carefully; the English support does not silently alter the source.")}</p>`,
      )
      .join(
        "",
      )}<h3>Sources for auditing</h3><ul>${bank.source_registry.map((s) => `<li><a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.title)}</a>${s.publisher ? " · " + escape(s.publisher) : ""}</li>`).join("")}</ul><p class="source-note">Official PDFs include underlined answer keys. They are available in post-answer review and this deliberate audit screen, never embedded into an active question.</p><div class="actions">${button("settings", "Settings & backups", "secondary")}${closeButton()}</div>`,
  );
}
function readinessModal() {
  const r = readiness(
    questions,
    state.attempts,
    state.exams,
    now(),
    profiles,
    state.delayedChecks,
  );
  openModal(
    `<p class="eyebrow">PREPARATION, WITH EVIDENCE</p><h2>${r.ready && profileValid(profile()) ? "Your current study evidence is strong." : "Build a reliable pattern."}</h2><p>These transparent recommendations go beyond the legal pass mark: ${profile().minimum_correct}/25 for ${profile().licence_category}, with no critical error. They do not predict an individual’s chance of passing.</p><p>Historical strict mocks: ${r.completedMocks}. Last strict mock: ${r.lastMockAt ? prettyDate(r.lastMockAt) : "none"}. Last answer evidence: ${r.lastEvidenceAt ? prettyDate(r.lastEvidenceAt) : "none"}.</p>${!profileValid(profile()) ? '<div class="notice">Archived profile: historical scores cannot establish current-format readiness.</div>' : ""}<ul class="ready-list">${[
      [
        r.coverage === 250,
        `Answer all questions: ${r.coverage}/250 (blanks excluded)`,
      ],
      [r.revisited === 250, `Revisit on another day: ${r.revisited}/250`],
      [r.due === 0, `No overdue question reviews: ${r.due} due`],
      [
        r.criticalMastered === 20,
        `Established critical mastery: ${r.criticalMastered}/20`,
      ],
      [
        r.criticalFresh === 20,
        `Unaided critical checks within 7 days and not overdue: ${r.criticalFresh}/20`,
      ],
      [
        r.lastTenStrong,
        `10 strict mocks within 14 days at 24–25/25: ${r.strongMocks}/10 strong`,
      ],
      [
        r.mockDays >= 3,
        `Mocks across at least 3 Vietnam-local days: ${r.mockDays}`,
      ],
      [
        r.timeBuffer,
        "At least 8 of those 10 mocks completed within 16 minutes",
      ],
    ]
      .map(
        ([done, label]) =>
          `<li class="${done ? "done" : ""}">${escape(label)}</li>`,
      )
      .join(
        "",
      )}</ul><p class="source-note">Past mastery remains visible through assisted revision. A later error or explicit uncertainty needs a recheck. A 24-hour delay after answer/translation exposure prevents immediate memory from counting as cold recall. Unrated exam answers contribute to the paper score, not explicit confident mastery.</p>${closeButton()}`,
  );
}

async function exportBackup() {
  await saveStudySnapshot();
  await change((s) => {
    s.lastBackupAt = now();
    s.backupAttemptCount = s.attempts.length;
  });
  const data = {
      ...structuredClone(state),
      exported_at: new Date().toISOString(),
    },
    blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `duong-backup-${vnDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Backup exported. Keep the file somewhere safe.");
}
async function previewImport(file) {
  if (!file) return;
  if (state.exams.some((e) => e.status === "active"))
    throw Error(
      "Finish or abandon your active paper before importing a backup. Your saved paper and timer are preserved.",
    );
  if (file.size > 25 * 1024 * 1024)
    throw Error("The backup is too large (maximum 25 MB).");
  const candidate = validateBackup(
      JSON.parse(await file.text()),
      bank.bank_id,
      new Set(byId.keys()),
      questions,
      profiles,
    ),
    activeExisting = state.exams.find((e) => e.status === "active"),
    activeIncoming = candidate.exams.find((e) => e.status === "active");
  if (
    activeExisting &&
    activeIncoming &&
    activeExisting.id !== activeIncoming.id
  )
    throw Error(
      "Both this browser and the backup have different active papers. Finish or abandon the local paper before importing.",
    );
  importCandidate = candidate;
  openModal(
    `<p class="eyebrow">BACKUP PREVIEW</p><h2>Review before importing</h2><p>This compatible backup contains ${candidate.attempts.length} answer attempts, ${candidate.exams.length} papers, ${candidate.phraseAttempts.length} phrase attempts and ${candidate.bookmarks.length} bookmarks.</p><p>Records merge by stable event IDs; existing attempt and result events are preserved. Preferences from the backup will apply. A rollback copy of your current data is saved before the merge.</p><div class="actions">${button("apply-import", "Merge this backup", "primary")}${button("settings", "Cancel", "secondary")}</div>`,
  );
}
async function applyImport() {
  if (!importCandidate) return;
  if (!storageReady)
    throw Error("Working browser storage is required before importing.");
  const merged = mergeBackups(state, importCandidate);
  validateBackup(
    merged,
    bank.bank_id,
    new Set(byId.keys()),
    questions,
    profiles,
  );
  await saveRollback(state);
  await persist(merged);
  importCandidate = null;
  study = null;
  examId = null;
  resultId = null;
  modal.close();
  pausedStudy = null;
  repairReturn = null;
  repairOrigin = null;
  const running = state.exams.find((e) => e.status === "active");
  if (running) {
    examId = running.id;
    view = "test";
    if (running.timed !== false && running.deadline <= now())
      await finishExam(running.id, true);
  } else restoreStudySession();
  render();
  toast(
    "Backup merged. Your previous state is available under Restore before last import.",
  );
}
async function registerOffline() {
  if (!("serviceWorker" in navigator)) {
    offline.error = "This browser does not support offline installation.";
    updateOfflineUI();
    return;
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || typeof m.type !== "string") return;
    if (
      m.type === "OFFLINE_READY" &&
      (event.source === navigator.serviceWorker.controller ||
        event.source === registration?.active ||
        event.source?.state === "activated")
    )
      offline = {
        ready: true,
        done: m.done ?? m.total ?? 0,
        total: m.total ?? 0,
        error: "",
      };
    if (m.type === "OFFLINE_STATUS") {
      offline.ready = !!m.ready;
      if (m.total) {
        offline.done = m.done;
        offline.total = m.total;
      }
    }
    if (m.type === "OFFLINE_PROGRESS" && !offline.ready) {
      offline.done = m.done;
      offline.total = m.total;
    }
    if (m.type === "OFFLINE_ERROR" && !offline.ready)
      offline.error = m.message || "Preparation is incomplete.";
    updateOfflineUI();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () =>
    checkOffline(),
  );
  try {
    registration = await navigator.serviceWorker.register(`./sw.js?build=${appVersion}`, {
      scope: "./",
      updateViaCache: "none",
    });
    await checkOffline();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "activated") checkOffline();
        if (worker.state === "installed" && registration.waiting)
          toast(
            "An update is ready. Refresh when convenient; your saved progress and paper timer will resume.",
          );
      });
    });
  } catch (error) {
    offline.error = error.message;
    updateOfflineUI();
  }
}
async function checkOffline() {
  const worker = navigator.serviceWorker.controller || registration?.active;
  if (!worker) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = ({ data }) => {
    if (data.type === "OFFLINE_STATUS") {
      offline.ready = !!data.ready;
      offline.done = data.done ?? 0;
      offline.total = data.total ?? 0;
      updateOfflineUI();
    }
  };
  worker.postMessage({ type: "CHECK_STATUS" }, [channel.port2]);
}
function updateOfflineUI() {
  const label = document.querySelector("#offline-label");
  if (label) label.textContent = offlineLabel();
  const settings = document.querySelector("#offline-settings-status");
  if (settings)
    settings.textContent =
      offlineLabel() + (offline.error ? " · " + offline.error : "");
}
async function retryOffline() {
  offline.error = "";
  if (!registration) await registerOffline();
  if (!registration) {
    toast(
      "Offline installation is unavailable. Check this browser’s site permissions.",
    );
    return;
  }
  try {
    await registration.update();
    const worker =
      registration.installing || registration.waiting || registration.active;
    worker?.postMessage({ type: "RETRY_OFFLINE" });
    await checkOffline();
    toast("Offline preparation resumed. Keep the app open.");
  } catch (error) {
    offline.error = error.message;
    updateOfflineUI();
  }
}
async function handleAction(action, node) {
  switch (action) {
    case "nav":
      setView(node.dataset.view);
      break;
    case "browse":
      collection = "all";
      chapter = "all";
      search = "";
      setView("learn");
      break;
    case "chapter":
      chapter = node.dataset.chapter;
      collection = "all";
      setView("learn");
      break;
    case "critical":
      collection = "critical";
      chapter = "all";
      search = "";
      if (modal.open) modal.close();
      setView("learn");
      break;
    case "critical-priority": {
      const c = criticalProgress(
        questions,
        state.attempts,
        now(),
        state.delayedChecks,
      );
      collection = "critical";
      chapter = "all";
      search = "";
      view = "learn";
      if (modal.open) modal.close();
      startStudy(c.priorityIds, null, "critical-review");
      break;
    }
    case "critical-drill": {
      collection = "critical";
      chapter = "all";
      search = "";
      view = "learn";
      if (modal.open) modal.close();
      const ids = questions
        .filter((q) => q.critical_for_motorcycle)
        .map((q) => q.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const value = crypto.getRandomValues(new Uint32Array(1))[0],
          j = value % (i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      startStudy(ids, 3, "critical-drill");
      break;
    }
    case "repair-critical": {
      collection = "critical";
      chapter = "all";
      search = "";
      view = "learn";
      resultId = null;
      startStudy([node.dataset.id], state.preferences.level, "critical-review");
      break;
    }
    case "collection":
      collection = node.dataset.value;
      if (collection === "critical") {
        chapter = "all";
        search = "";
      }
      render();
      break;
    case "review-filter":
      reviewFilter = node.dataset.value;
      render();
      break;
    case "daily-learn":
      if (modal.open) modal.close();
      dailyLearn();
      break;
    case "learn-more":
      if (modal.open) modal.close();
      dailyLearn(true);
      break;
    case "resume-study":
      restoreStudySession(true);
      render();
      window.scrollTo(0, 0);
      break;
    case "setup":
      setupPlan();
      break;
    case "skip-setup":
      await change((s) => (s.preferences.setupComplete = true));
      render();
      break;
    case "save-plan":
      await savePlan();
      break;
    case "warmup":
      setupPhraseQueue();
      phraseQueue = phraseQueue.slice(0, 3);
      view = "phrases";
      study = null;
      render();
      break;
    case "final-check": {
      const plan = dailyPlan(
        questions,
        state.attempts,
        state.preferences,
        now(),
        false,
        state.delayedChecks,
      );
      const id =
        plan.reviewIds.at(-1) ??
        questions.find((q) => history(q.id).some(hasAnswer))?.id;
      if (id) {
        view = "learn";
        startStudy([id], 3, "delayed-check");
      } else
        toast(
          "Learn a few questions first. A delayed Vietnamese check will follow.",
        );
      break;
    }

    case "due-review":
      view = "review";
      reviewFilter = "due";
      collection = "all";
      chapter = "all";
      startStudy(
        filteredQuestions(true).map((q) => q.id),
        null,
        "review",
      );
      if (!study) render();
      break;
    case "study-list":
      startStudy(filteredQuestions().map((q) => q.id));
      break;
    case "review-list":
      startStudy(
        filteredQuestions(true).map((q) => q.id),
        null,
        "review",
      );
      break;
    case "single":
      if (activeExam())
        throw Error(
          "Finish or abandon your active paper before starting study.",
        );
      view = "learn";
      startStudy(
        [node.dataset.id],
        node.dataset.level === undefined ? null : Number(node.dataset.level),
      );
      if (modal.open) modal.close();
      break;
    case "selected-ids":
      openModal(
        `<h2>Choose official question numbers</h2><p class="muted">Use original IDs from the 600-question book, separated by commas or spaces. Example: 19, 36, 362.</p><div class="field"><label for="selected-question-ids">Official numbers</label><input id="selected-question-ids" inputmode="numeric" placeholder="19, 36, 362"></div><div class="actions">${button("start-selected", "Study selected questions", "primary")}${closeButton()}</div>`,
      );
      break;
    case "start-selected": {
      const values = document
          .querySelector("#selected-question-ids")
          .value.split(/[\s,;]+/)
          .filter(Boolean),
        ids = [
          ...new Set(
            values.map((x) => "q" + String(Number(x)).padStart(3, "0")),
          ),
        ];
      if (!ids.length || ids.some((id) => !byId.has(id)))
        throw Error(
          "Some numbers are not in the official 250-question motorcycle subset. Check the original question numbers.",
        );
      modal.close();
      view = "learn";
      startStudy(ids);
      break;
    }
    case "answer": {
      const id = node.dataset.id;
      if (study && !study.committed) {
        study.answerId = id;
        render();
      } else {
        const e = activeExam();
        if (e) {
          if (e.timed !== false && e.deadline <= now()) {
            await finishExam(e.id, true);
            break;
          }
          const qId = e.ids[examIndex];
          if (byId.get(qId).content_error)
            throw Error(
              "The source diagram is unavailable. Reload or restore offline content before answering.",
            );
          if (!byId.get(qId).options.some((o) => o.id === id)) return;
          await change((s) => {
            const x = s.exams.find((x) => x.id === e.id);
            x.answers[qId] = id;
            if (x.timings?.[qId]) x.timings[qId].lastAnsweredAt = now();
          });
          render();
        }
      }
      break;
    }
    case "confidence":
      if (
        study &&
        !study.committed &&
        ["sure", "unsure", "guessed"].includes(node.dataset.value)
      ) {
        study.confidence =
          study.confidence === node.dataset.value
            ? "unrated"
            : node.dataset.value;
        render();
      }
      break;
    case "commit":
      await commitStudy();
      break;
    case "next-study": {
      if (!study?.committed) break;
      inlineGloss = null;
      if (study.index + 1 >= study.ids.length) {
        const count = study.ids.length,
          sessionId = study.sessionId,
          criticalDrill = study.mode === "critical-drill";
        study = null;
        pausedStudy = null;
        attentionDeadline = null;
        if (repairReturn) {
          study = repairReturn;
          repairReturn = null;
          repairOrigin = null;
          render();
        } else if (returnToPaperId) {
          resultId = returnToPaperId;
          returnToPaperId = null;
          view = "test";
          render();
        } else {
          render();
          if (criticalDrill) showCriticalDrillSummary(sessionId);
          else
            toast(
              `${count} questions practised. Come back tomorrow for cold retrieval.`,
            );
        }
      } else {
        study.index++;
        prepareStudyQuestion();
        render();
        window.scrollTo(0, 0);
      }
      break;
    }

    case "end-study":
      pausedStudy = study;
      study = null;
      inlineGloss = null;
      view = "today";
      render();
      break;

    case "bookmark":
      await change((s) => {
        const i = s.bookmarks.indexOf(node.dataset.id);
        if (i < 0) s.bookmarks.push(node.dataset.id);
        else s.bookmarks.splice(i, 1);
      });
      render();
      break;
    case "reveal":
      if (study && !study.committed && study.level === 1) {
        markExposure(study.ids[study.index], "translation");
        study.reveals.add(node.dataset.field);
        study.support.push({
          type: "english",
          field: node.dataset.field,
          at: now(),
        });
        render();
      }
      break;
    case "review-english":
      if (study?.committed) {
        markExposure(study.ids[study.index], "translation-review");
        study.reveals.add("review");
        render();
      }
      break;
    case "phrase-help":
      if (study && !study.committed && study.level === 2) {
        const p = byPhrase.get(node.dataset.id);
        if (
          !p ||
          p.ambiguous_without_context ||
          p.automatic_gloss_allowed === false
        )
          break;
        markExposure(study.ids[study.index], "phrase");
        study.support.push({ type: "phrase", phraseId: p.id, at: now() });
        inlineGloss = p.id;
        render();
      }
      break;

    case "change-support":
      if (study?.mode === "critical-drill")
        throw Error(
          "Finish this Vietnamese-only drill before changing its support.",
        );
      openModal(
        `<h2>Choose the next step</h2><p>Choose support for this question. Previously used help and recent answer exposure stay recorded; changing the setting cannot make an immediate retry cold recall.</p><div class="field"><label for="next-support">English support</label><select id="next-support">${levels.map((name, i) => `<option value="${i}" ${study.level === i ? "selected" : ""}>${i} · ${name}</option>`).join("")}</select></div><div class="actions">${button("apply-support", "Apply to this question", "primary")}${closeButton()}</div>`,
      );
      break;
    case "apply-support": {
      if (!study || study.mode === "critical-drill") break;
      const level = Number(document.querySelector("#next-support").value),
        wasCommitted = study.committed;
      const previousSupport = [...study.support];
      if (wasCommitted)
        Object.assign(study, {
          answerId: null,
          committed: false,
          confidence: "unrated",
          attemptId: null,
          startedAt: now(),
          activeMs: 0,
        });
      study.level = level;
      study.reveals = new Set();
      study.support = previousSupport;
      study.recentExposure =
        study.recentExposure ||
        recentExposure(state.exposures, study.ids[study.index]);
      if (level === 0) {
        study.support.push({ type: "english", at: now(), field: "all" });
        markExposure(study.ids[study.index], "translation");
      }
      study.supportReason =
        "You chose this support for the current question. Earlier help stays recorded.";
      modal.close();
      render();
      break;
    }

    case "zoom": {
      const q = byId.get(node.dataset.id),
        im = q.images[Number(node.dataset.index)];
      openModal(
        `<h2 lang="vi">${escape(im.alt_vi)}</h2><div class="figures"><figure class="figure"><img src="${escape(im.path)}" alt="${escape(im.alt_vi)}" width="${im.width}" height="${im.height}">${im.figure_label ? `<figcaption lang="vi">Hình ${escape(im.figure_label)}</figcaption>` : ""}</figure></div><p class="source-note">Original source pixels and proportions. Use your device’s pinch zoom if needed.</p>${closeButton()}`,
      );
      break;
    }
    case "phrases":
      if (state.exams.some((e) => e.status === "active"))
        throw Error(
          "Finish or abandon the active paper before opening phrase help.",
        );
      setupPhraseQueue();
      view = "phrases";
      study = null;
      render();
      break;
    case "repair-phrases":
      beginPhraseRepair(node.dataset.id);
      break;
    case "return-question":
      if (modal.open) modal.close();
      if (repairReturn) {
        study = repairReturn;
        repairReturn = null;
        view = "learn";
        markExposure(study.ids[study.index], "contextual-repair");
        study.recentExposure = true;
      }
      repairOrigin = null;
      attentionDeadline = null;
      inlineGloss = null;
      repairAnswer = null;
      render();
      window.scrollTo(0, 0);
      break;
    case "phrase-transfer": {
      const p = byPhrase.get(node.dataset.id),
        occurrence = p?.occurrences?.find(
          (o) => o.question_id !== repairOrigin,
        );
      if (!occurrence) {
        toast(
          "No other reviewed occurrence is available. Return to your original question.",
        );
        break;
      }
      if (study && !repairReturn) {
        repairReturn = study;
        repairOrigin = study.ids[study.index];
      }
      view = "learn";
      startStudy([occurrence.question_id], 2, "transfer");
      break;
    }
    case "locate-found":
      if (repairOrigin) markExposure(repairOrigin, "phrase-context");
      phraseRevealed = true;
      render();
      break;
    case "decode":
      if (study && !study.committed) {
        markExposure(study.ids[study.index], "question-breakdown");
        study.support.push({ type: "breakdown", at: now() });
        study.breakdownOpen = !study.breakdownOpen;
        render();
      }
      break;
    case "close-gloss":
      inlineGloss = null;
      render();
      break;
    case "save-known-phrase": {
      const p = byPhrase.get(node.dataset.id);
      if (p && study)
        await savePersonalEntry(
          study.ids[study.index],
          p.vi,
          p.en,
          "phrase-course",
        );
      toast("Phrase saved.");
      break;
    }
    case "save-chunk":
      await saveChunk(node.dataset.id, Number(node.dataset.index));
      break;
    case "personal-phrase":
      personalPhraseForm(node.dataset.id);
      break;
    case "save-personal-phrase":
      await savePersonalPhrase(node.dataset.id);
      break;
    case "personal-phrases":
      personalPhrases();
      break;
    case "schedule-check": {
      const id = node.dataset.id ?? repairOrigin ?? study?.ids[study.index];
      if (id) {
        await change(
          (s) => (s.delayedChecks[id] = now() + LEARNING_RULES.recallDelayMs),
        );
        toast(
          "Saved: Vietnamese retrieval from " +
            prettyDate(state.delayedChecks[id]) +
            ". It will appear in due reviews.",
        );
      }
      break;
    }
    case "start-repair":
      startRepair(node.dataset.id, node.dataset.tag);
      break;
    case "repair-answer":
      repairAnswer = node.dataset.value;
      renderRepair();
      break;
    case "repair-step":
      repairAnswer = node.dataset.value;
      if (Number(repairAnswer) === repairStage) repairStage++;
      renderRepair();
      break;
    case "repair-timed": {
      const q = byId.get(repairOrigin);
      modal.close();
      repairReturn = study;
      attentionDeadline = now() + 3 * 60000;
      view = "learn";
      startStudy(
        questions
          .filter((x) => x.chapter === q.chapter)
          .slice(0, 3)
          .map((x) => x.id),
        3,
        "attention",
      );
      break;
    }
    case "repair-paper": {
      const e = state.exams.find((e) => e.id === node.dataset.id);
      const ids = e.ids
        .filter(
          (id) =>
            e.answers[id] !== byId.get(id).correct_option_id || e.flags?.[id],
        )
        .sort(
          (a, b) =>
            Number(byId.get(b).critical_for_motorcycle) -
            Number(byId.get(a).critical_for_motorcycle),
        );
      if (!ids.length) {
        toast("No wrong, unanswered or flagged questions in this paper.");
        break;
      }
      returnToPaperId = e.id;
      view = "learn";
      resultId = null;
      startStudy(ids, null, "paper-repair");
      break;
    }
    case "exam-flag": {
      const e = activeExam();
      if (!e) break;
      if (e.timed !== false && e.deadline <= now()) {
        await finishExam(e.id, true);
        break;
      }
      const id = e.ids[examIndex],
        flag = node.dataset.value;
      await change((s) => {
        const x = s.exams.find((x) => x.id === e.id);
        x.flags ??= {};
        if (x.flags[id] === flag) delete x.flags[id];
        else x.flags[id] = flag;
      });
      render();
      break;
    }
    case "interface-lesson":
      interfaceLesson();
      break;

    case "phrase-mode":
      phraseMode = node.dataset.value;
      resetPhrase();
      render();
      break;
    case "phrase-reveal":
      if (repairOrigin) markExposure(repairOrigin, "phrase-meaning");
      phraseRevealed = true;
      render();
      break;
    case "phrase-rate":
      await recordPhrase(node.dataset.value === "true");
      phraseIndex++;
      resetPhrase();
      render();
      break;
    case "phrase-answer":
      if (phraseAnswer) break;
      phraseAnswer = node.dataset.id;
      await recordPhrase(phraseAnswer === phraseQueue[phraseIndex]);
      render();
      break;
    case "phrase-next":
      phraseIndex++;
      resetPhrase();
      render();
      break;
    case "phrase-speak": {
      const voice = speechVoice();
      if (!voice) break;
      const utterance = new SpeechSynthesisUtterance(
        byPhrase.get(phraseQueue[phraseIndex]).vi,
      );
      utterance.voice = voice;
      utterance.rate = Number(node.dataset.rate ?? 1);
      utterance.lang = "vi-VN";
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
      break;
    }
    case "start-exam":
      await startExam(true);
      break;
    case "start-practice":
      await startExam(false);
      break;
    case "resume-exam":
      examId = node.dataset.id;
      view = "test";
      study = null;
      resultId = null;
      examIndex = 0;
      render();
      break;
    case "exam-review-go":
      if (modal.open) modal.close();
    case "exam-go":
      examIndex = Number(node.dataset.index);
      render();
      window.scrollTo(0, 0);
      break;
    case "exam-prev":
      examIndex = Math.max(0, examIndex - 1);
      render();
      window.scrollTo(0, 0);
      break;
    case "exam-next":
      examIndex = Math.min(24, examIndex + 1);
      render();
      window.scrollTo(0, 0);
      break;
    case "submit-exam": {
      const e = activeExam();
      if (!e) break;
      const blanks = e.ids.filter((id) => !e.answers[id]).length;
      const reviewIds = e.ids.filter((id) => !e.answers[id] || e.flags?.[id]);
      openModal(
        `<h2>Submit the whole paper?</h2><p>${blanks ? `${blanks} questions are unanswered. Blank answers are marked incorrect.` : "All 25 questions have a selected answer."} You can review translations and explanations after submission. This result cannot be changed.</p>${reviewIds.length ? `<p>Review blanks and flags before submitting:</p><div class="chips">${reviewIds.map((id) => button("exam-review-go", `Question ${e.ids.indexOf(id) + 1} · ${!e.answers[id] ? "blank" : e.flags[id]}`, "secondary small", `data-index="${e.ids.indexOf(id)}"`)).join("")}</div>` : ""}<div class="actions">${button("confirm-submit", "Submit now", "primary", `data-id="${e.id}"`)}${button("close-modal", "Keep answering", "secondary")}</div>`,
      );
      break;
    }
    case "confirm-submit":
      await finishExam(node.dataset.id);
      break;
    case "abandon-exam":
      openModal(
        `<h2>Abandon this paper?</h2><p>The paper and its selections remain in history as abandoned. It will not count as a pass.</p><div class="actions">${button("confirm-abandon", "Abandon paper", "danger", `data-id="${node.dataset.id}"`)}${button("close-modal", "Keep the paper", "secondary")}</div>`,
      );
      break;
    case "confirm-abandon":
      await change((s) => {
        const e = s.exams.find((x) => x.id === node.dataset.id);
        if (e?.status === "active") {
          e.status = "abandoned";
          e.finishedAt = now();
        }
      });
      examId = null;
      resultId = null;
      modal.close();
      render();
      break;
    case "exam-result":
      resultId = node.dataset.id;
      examId = null;
      study = null;
      render();
      window.scrollTo(0, 0);
      break;
    case "back-test":
      resultId = null;
      examId = null;
      view = "test";
      render();
      break;
    case "settings":
      settings();
      break;
    case "about":
      about();
      break;
    case "readiness":
      readinessModal();
      break;
    case "close-modal":
      modal.close();
      break;
    case "save-settings": {
      const level = Number(document.querySelector("#setting-level").value),
        profileId = document.querySelector("#setting-profile").value,
        dailyLimit = Number(document.querySelector("#setting-limit").value),
        theme = document.querySelector("#setting-theme").value;
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 250)
        throw Error("Choose a daily target from 1 to 250.");
      const active = state.exams.find((e) => e.status === "active");
      if (
        active &&
        (level !== state.preferences.level ||
          profileId !== state.preferences.profileId) &&
        !confirm(
          "Changing support or licence category abandons the active mock. Continue?",
        )
      )
        return;
      await change((s) => {
        if (
          active &&
          (level !== s.preferences.level ||
            profileId !== s.preferences.profileId)
        ) {
          const e = s.exams.find((x) => x.id === active.id);
          e.status = "abandoned";
          e.finishedAt = now();
        }
        s.preferences = {
          ...s.preferences,
          level,
          profileId,
          dailyLimit,
          theme,
          adaptiveSupport: document.querySelector("#setting-adaptive").checked,
        };
      });
      if (study && study.level !== level)
        toast("New support preference applies from your next question.");
      if (
        active &&
        !state.exams.find((e) => e.id === active.id && e.status === "active")
      )
        examId = null;
      modal.close();
      render();
      toast("Preferences saved.");
      break;
    }
    case "export":
      await exportBackup();
      break;
    case "choose-import":
      document.querySelector("#backup-file").click();
      break;
    case "apply-import":
      await applyImport();
      break;
    case "rollback": {
      if (state.exams.some((e) => e.status === "active"))
        throw Error(
          "Finish or abandon your active paper before restoring a backup. Your saved paper and timer are preserved.",
        );
      const old = await readRollback();
      if (!old) throw Error("There is no pre-import snapshot to restore yet.");
      const restored = validateBackup(
        old,
        bank.bank_id,
        new Set(byId.keys()),
        questions,
        profiles,
      );
      if (
        !confirm(
          "Restore the exact progress saved before your last import? Current progress will be replaced. Export first if you want to keep it.",
        )
      )
        return;
      await persist(restored);
      study = null;
      examId = null;
      resultId = null;
      modal.close();
      pausedStudy = null;
      repairReturn = null;
      repairOrigin = null;
      restoreStudySession();
      render();
      toast("Pre-import progress restored.");
      break;
    }
    case "reset":
      openModal(
        `<h2>Reset all local progress?</h2><p>Export a backup first. Reset removes your attempts, papers, phrase history and saved questions from this browser.</p><div class="actions">${button("export", "Export backup first", "secondary")}${button("confirm-reset", "Reset all progress", "danger")}${button("settings", "Cancel", "ghost")}</div>`,
      );
      break;
    case "confirm-reset":
      if (!confirm("Permanently reset all progress on this browser?")) return;
      await persist(fresh());
      study = null;
      repairReturn = null;
      repairOrigin = null;
      pausedStudy = null;
      examId = null;
      resultId = null;
      view = "today";
      modal.close();
      render();
      toast("Local progress reset.");
      break;
    case "retry-offline":
      await retryOffline();
      break;
    case "install":
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
        settings();
      }
      break;
  }
}
async function run(action, node) {
  if (busy) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  try {
    flushActivity();
    await handleAction(action, node);
    await saveStudySnapshot();
  } catch (error) {
    toast(error.message || String(error));
    console.error(error);
    if (storageError) render();
  } finally {
    busy = false;
    app.setAttribute("aria-busy", "false");
  }
}
document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-action]");
  if (!node) return;
  event.preventDefault();
  run(node.dataset.action, node);
});
document.addEventListener(
  "toggle",
  (event) => {
    const id = event.target.dataset?.reviewQuestion;
    if (id && event.target.open && state && !activeExam()) {
      markExposure(id, "paper-explanation");
      saveStudySnapshot().catch((error) => toast(error.message));
    }
  },
  true,
);
document.addEventListener("input", (event) => {
  if (event.target.dataset.input === "search") {
    search = event.target.value;
    const position = event.target.selectionStart;
    render();
    const input = document.querySelector("#search");
    input?.focus();
    if (input && position !== null) input.setSelectionRange(position, position);
  }
});
document.addEventListener("change", async (event) => {
  const node = event.target;
  if (!node.dataset.change) return;
  if (busy) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  try {
    switch (node.dataset.change) {
      case "chapter":
        chapter = node.value;
        render();
        break;
      case "mistake":
        mistakeFilter = node.value;
        render();
        break;
      case "support":
        await change((s) => (s.preferences.level = Number(node.value)));
        render();
        break;
      case "reason": {
        const attemptId = node.dataset.attempt;
        await change((s) =>
          s.mistakeEdits.push({
            id: uid(),
            attemptId,
            questionId: s.attempts.find((a) => a.id === attemptId).questionId,
            at: now(),
            mistakes: [node.value],
            taxonomy_version: 1,
          }),
        );
        render();
        await saveStudySnapshot();
        break;
      }
      case "import-file":
        await previewImport(node.files[0]);
        break;
    }
  } catch (error) {
    toast(error.message);
    if (storageError) render();
  } finally {
    busy = false;
    app.setAttribute("aria-busy", "false");
  }
});
document.addEventListener("keydown", (event) => {
  if (
    modal.open ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.closest("input,textarea,select,[contenteditable=true]")
  )
    return;
  if (
    (event.key === " " || event.key === "Enter") &&
    event.target.matches("[role=button][data-action],[role=radio][data-action]")
  ) {
    event.preventDefault();
    event.target.click();
    return;
  }
  const q =
    study && !study.committed
      ? byId.get(study.ids[study.index])
      : activeExam()
        ? byId.get(activeExam().ids[examIndex])
        : null;
  if (q && /^[1-4]$/.test(event.key)) {
    const o = q.options[Number(event.key) - 1];
    if (o) {
      event.preventDefault();
      run("answer", { dataset: { id: o.id } });
    }
    return;
  }
  if (event.key === "Enter" && study && !event.target.closest("button,a")) {
    event.preventDefault();
    run(study.committed ? "next-study" : "commit", { dataset: {} });
  }
  if (activeExam() && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    run(event.key === "ArrowLeft" ? "exam-prev" : "exam-next", { dataset: {} });
  }
});
document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.dataset.questionImage) {
      image.replaceWith(
        Object.assign(document.createElement("p"), {
          className: "error",
          textContent:
            "Source diagram unavailable. Do not answer this question without its original image. Retry offline preparation or reload when connected.",
        }),
      );
      const q = byId.get(image.dataset.questionImage);
      if (q) q.content_error = true;
    }
  },
  true,
);
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      modal.close();
  }
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener("online", () => {
  checkOffline();
  updateOfflineUI();
});
document.addEventListener("visibilitychange", () => {
  flushActivity();
  if (document.visibilityState === "visible") {
    syncActivity();
    tick();
  } else saveStudySnapshot().catch(() => {});
});
async function tick() {
  if (!state) return;
  flushActivity();
  updateTimer();
  const clock = document.querySelector("[data-attention-clock]");
  if (clock)
    clock.textContent =
      attentionDeadline > now()
        ? `Controlled practice · ${Math.ceil((attentionDeadline - now()) / 1000)} seconds left`
        : "Practice clock finished. Complete your current question calmly, then review the meaning.";
  const e = state.exams.find(
    (e) => e.status === "active" && e.timed !== false && e.deadline <= now(),
  );
  if (e && !busy) {
    busy = true;
    try {
      await finishExam(e.id, true);
    } catch (error) {
      storageError = error.message;
      toast(error.message);
      render();
    } finally {
      busy = false;
    }
  }
}
async function boot() {
  try {
    const loaded = await Promise.all(
      [
        "data/questions.json",
        "data/phrases.json",
        "data/exam_profiles.json",
      ].map(async (path) => {
        const r = await fetch(path);
        if (!r.ok) throw Error("Could not load " + path);
        return r.json();
      }),
    );
    [bank, phraseData] = loaded;
    questions = bank.questions;
    phrases = phraseData.phrases;
    profiles = loaded[2].profiles;
    if (
      questions?.length !== 250 ||
      new Set(questions.map((q) => q.id)).size !== 250 ||
      phrases?.length !== 93 ||
      !profiles?.length
    )
      throw Error("The bundled content is incomplete. Retry when connected.");
    byId = new Map(questions.map((q) => [q.id, q]));
    byPhrase = new Map(phrases.map((p) => [p.id, p]));
    state = fresh();
    try {
      await openStore();
      const saved = await readState();
      if (saved)
        state = validateBackup(
          saved,
          bank.bank_id,
          new Set(byId.keys()),
          questions,
          profiles,
        );
      storageReady = true;
      await saveState(state);
    } catch (error) {
      storageReady = false;
      storageError = error.message || "IndexedDB could not be opened.";
    }
    const e = state.exams.find((e) => e.status === "active");
    if (e) {
      view = "test";
      examId = e.id;
      if (e.timed !== false && e.deadline <= now() && storageReady)
        await finishExam(e.id, true);
    }
    if (!e) restoreStudySession();
    render();
    registerOffline();
    setInterval(tick, 1000);
    await tick();
  } catch (error) {
    app.innerHTML = `<div class="boot error"><h1>Practice content could not load.</h1><p>${escape(error.message)}</p><p>Connect to the internet and reload. Your saved progress has not been reset.</p><button class="button primary" data-action="reload">Reload</button></div>`;
    document
      .querySelector("[data-action=reload]")
      ?.addEventListener("click", () => location.reload());
  }
}
function locateSentence(text, p, revealed) {
  const start = text
    .toLocaleLowerCase("vi")
    .indexOf(p.vi.toLocaleLowerCase("vi"));
  if (start < 0)
    return (
      escape(text) +
      button("locate-found", "Show contextual meaning", "secondary small")
    );
  return (
    escape(text.slice(0, start)) +
    `<button class="locate-chunk ${revealed ? "found" : ""}" data-action="locate-found">${escape(text.slice(start, start + p.vi.length))}</button>` +
    escape(text.slice(start + p.vi.length))
  );
}
function markExposure(questionId, type) {
  state.exposures ??= {};
  state.exposures[questionId] = { at: now(), type };
}
function prepareStudyQuestion() {
  const q = byId.get(study.ids[study.index]);
  const recommendation = recommendedSupport(
    history(q.id),
    state.preferences.level,
  );
  const level =
    study.mode === "critical-drill"
      ? 3
      : (study.fixedLevel ??
        (state.preferences.adaptiveSupport
          ? recommendation.level
          : state.preferences.level));
  const exposed = recentExposure(state.exposures, q.id);
  Object.assign(study, {
    level,
    supportReason:
      study.fixedLevel !== null && study.fixedLevel !== undefined
        ? "You chose this support for this session."
        : recommendation.reason,
    answerId: null,
    committed: false,
    confidence: "unrated",
    reveals: new Set(),
    support: [],
    startedAt: now(),
    attemptId: null,
    activeMs: 0,
    recentExposure: exposed,
    breakdownOpen: false,
  });
  if (study.finalCheckId === q.id) {
    study.level = 3;
    study.supportReason =
      "Final delayed retrieval: start in Vietnamese, then ask for help if needed.";
  }
  if (study.level === 0) {
    study.support.push({ type: "english", field: "all", at: now() });
    markExposure(q.id, "translation");
  }
  state.questionEvents.push({
    id: uid(),
    questionId: q.id,
    at: now(),
    kind: "presented",
    sessionId: study.sessionId,
  });
  inlineGloss = null;
}
function snapshotStudy(ctx) {
  return {
    ...structuredClone(ctx),
    reveals: [...ctx.reveals],
    retried: [...ctx.retried],
  };
}
function reviveStudy(saved) {
  return {
    ...structuredClone(saved),
    reveals: new Set(saved.reveals),
    retried: new Set(saved.retried),
  };
}
async function saveStudySnapshot() {
  if (!state) return;
  flushActivity();
  const current = study ?? repairReturn ?? pausedStudy;
  const snapshot = current
    ? {
        study: snapshotStudy(current),
        paused: !study && !repairReturn,
        view: repairReturn && !study ? "phrases" : "learn",
        repairOrigin,
        phraseQueue: [...phraseQueue],
        phraseIndex,
        phraseMode,
        phraseRevealed,
        phraseAnswer,
        returnToPaperId,
        attentionDeadline,
        transferStudy:
          repairReturn && study ? snapshotStudy(repairReturn) : null,
      }
    : null;
  await change((s) => (s.studySession = snapshot));
}
function restoreStudySession(force = false) {
  const saved = state.studySession;
  if (!saved) return;
  if (saved.paused && !force) {
    pausedStudy = reviveStudy(saved.study);
    return;
  }
  pausedStudy = null;
  study = reviveStudy(saved.study);
  view = saved.view ?? "learn";
  returnToPaperId = saved.returnToPaperId ?? null;
  attentionDeadline = saved.attentionDeadline ?? null;
  repairOrigin = saved.repairOrigin ?? null;
  if (view === "phrases") {
    repairReturn = study;
    study = null;
    phraseQueue = saved.phraseQueue ?? [];
    phraseIndex = saved.phraseIndex ?? 0;
    phraseMode = saved.phraseMode ?? "flash";
    resetPhrase();
    phraseRevealed = saved.phraseRevealed ?? false;
    phraseAnswer = saved.phraseAnswer ?? null;
  } else if (saved.transferStudy)
    repairReturn = reviveStudy(saved.transferStudy);
  if (study && !study.committed) {
    study.recentExposure =
      study.recentExposure ||
      recentExposure(state.exposures, study.ids[study.index]);
    if (study.level === 0) markExposure(study.ids[study.index], "translation");
  }
}
function flushActivity() {
  const at = now();
  if (activityClock.at && activityClock.ref)
    activityClock.ref.activeMs =
      (activityClock.ref.activeMs ?? 0) + Math.max(0, at - activityClock.at);
  activityClock.at = document.hidden ? 0 : at;
}
function syncActivity() {
  if (!state || document.hidden) {
    activityClock = { key: null, at: 0 };
    return;
  }
  let key = null,
    ref = null;
  if (study && !study.committed) {
    key = `study:${study.sessionId}:${study.index}`;
    ref = study;
  } else {
    const e = activeExam();
    if (e) {
      const id = e.ids[examIndex];
      key = `exam:${e.id}:${examIndex}`;
      e.timings ??= {};
      if (!e.timings[id])
        e.timings[id] = { activeMs: 0, visits: 0, firstViewedAt: now() };
      ref = e.timings[id];
      if (activityClock.key !== key) {
        ref.visits++;
        state.questionEvents.push({
          id: uid(),
          questionId: id,
          at: now(),
          kind: "presented",
          sessionId: e.id,
        });
      }
    }
  }
  activityClock = { key, ref, at: key ? now() : 0 };
}
function setupPlan() {
  openModal(
    `<p class="eyebrow">MAKE A REALISTIC PLAN</p><h2>Your category, date and time</h2><p>The repository uses the older A2 name. This bank covers current A/A1 motorcycle theory. Confirm your category and exam arrangements with your driving school.</p><div class="settings-grid"><div class="field"><label for="plan-category">Licence category</label><select id="plan-category">${profiles.map((p) => `<option value="${p.id}" ${p.id === profile().id ? "selected" : ""}>${p.licence_category} · ${p.minimum_correct}/25</option>`).join("")}</select></div><div class="field"><label for="plan-date">Exam date (optional)</label><input id="plan-date" type="date" value="${escape(state.preferences.examDate)}"><p class="source-note">This bank is verified through 28 February 2027. A later date needs a verified replacement format.</p></div><div class="field"><label for="plan-minutes">Realistic daily minutes</label><input id="plan-minutes" type="number" min="5" max="240" value="${state.preferences.dailyMinutes}"></div><div class="field"><label for="plan-new">Preferred new questions per day</label><input id="plan-new" type="number" min="1" max="250" value="${state.preferences.dailyLimit}"></div></div><p class="source-note">A nearby supported deadline raises the recommended workload and reserves seven days for retrieval. Your measured study time will show whether it fits; this cannot guarantee that the schedule is achievable.</p><div class="actions">${button("save-plan", "Save my plan", "primary")}${closeButton()}</div>`,
  );
}
async function savePlan() {
  if (state.exams.some((e) => e.status === "active"))
    throw Error("Finish your active paper before changing the study plan.");
  const examDate = document.querySelector("#plan-date").value,
    dailyMinutes = Number(document.querySelector("#plan-minutes").value),
    dailyLimit = Number(document.querySelector("#plan-new").value),
    profileId = document.querySelector("#plan-category").value;
  if (
    !Number.isInteger(dailyMinutes) ||
    dailyMinutes < 5 ||
    dailyMinutes > 240 ||
    !Number.isInteger(dailyLimit) ||
    dailyLimit < 1 ||
    dailyLimit > 250
  )
    throw Error("Choose 5–240 minutes and 1–250 new questions.");
  if (examDate && examDate < vnDate())
    throw Error("Choose a future exam date or leave the date blank.");
  await change((s) =>
    Object.assign(s.preferences, {
      examDate,
      dailyMinutes,
      dailyLimit,
      profileId,
      setupComplete: true,
    }),
  );
  modal.close();
  render();
}
function chunksFor(q) {
  return (
    breakdowns[q.id] ??
    (q.language_chunks ?? []).map((c) => ({ ...c, role: "Key chunk" }))
  );
}
function decodeControls(q, ctx) {
  if (ctx.committed) return "";
  const chunks = chunksFor(q);
  return `<div class="decode-tools"><div class="actions">${button("decode", ctx.breakdownOpen ? "Hide reading guide" : "Decode this question", "ghost small")}${button("personal-phrase", "Save a difficult span", "ghost small", `data-id="${q.id}"`)}</div>${ctx.breakdownOpen ? `<section class="reading-guide"><p><strong>Read the whole task.</strong> What is being asked? Which vehicle or situation? What action, negative, exception or number changes the meaning?</p><p lang="vi">${escape(q.question.vi)}</p>${chunks.map((c, i) => `<div class="chunk-row"><span class="tag">${escape(c.role)}</span><span><span lang="vi">${escape(c.vi)}</span><br>${escape(c.en)}</span>${button("save-chunk", "Save phrase", "ghost small", `data-id="${q.id}" data-index="${i}"`)}</div>`).join("")}<p class="source-note">English teaching support, checked against the supplied sentence; not an official translation or independent human review. Reading guidance is recorded as help.</p></section>` : ""}${inlineGloss ? inlineGlossView() : ""}</div>`;
}
function inlineGlossView() {
  const p = byPhrase.get(inlineGloss);
  if (!p) return "";
  return `<aside class="inline-gloss" aria-label="Phrase meaning"><strong lang="vi">${escape(p.vi)}</strong> · ${escape(p.en)}<p>${escape(p.reading_note_en)}</p><div class="actions">${button("save-known-phrase", "Save this phrase", "secondary small", `data-id="${p.id}"`)}${button("close-gloss", "Close gloss", "ghost small")}</div></aside>`;
}
function personalPhraseForm(id) {
  const q = byId.get(id);
  openModal(
    `<h2>Save a difficult span</h2><p lang="vi">${escape(q.question.vi)}</p><p>Copy a short span from this question or its options. Add your own meaning or use the question’s teaching translation. Personal notes are not reviewed source content.</p><div class="field"><label for="personal-vi">Vietnamese span</label><input id="personal-vi" maxlength="500"></div><div class="field"><label for="personal-en">Meaning / reminder</label><input id="personal-en" maxlength="1000"></div><div class="actions">${button("save-personal-phrase", "Save phrase", "primary", `data-id="${id}"`)}${closeButton()}</div>`,
  );
}
async function savePersonalPhrase(id) {
  const vi = document.querySelector("#personal-vi").value.trim(),
    en = document.querySelector("#personal-en").value.trim(),
    q = byId.get(id);
  if (!vi || !en) throw Error("Add the Vietnamese span and a short meaning.");
  if (
    ![q.question.vi, ...q.options.map((o) => o.text.vi)].some((t) =>
      t.toLocaleLowerCase("vi").includes(vi.toLocaleLowerCase("vi")),
    )
  )
    throw Error("Copy a span that occurs in this question or its options.");
  await savePersonalEntry(id, vi, en, "personal");
  modal.close();
  toast("Phrase saved. Practise it from My saved phrases.");
}
async function savePersonalEntry(questionId, vi, en, source) {
  if (
    state.savedPhrases.some((p) => p.questionId === questionId && p.vi === vi)
  ) {
    toast("This phrase is already saved.");
    return;
  }
  await change((s) =>
    s.savedPhrases.push({ id: uid(), questionId, vi, en, source, at: now() }),
  );
}
async function saveChunk(id, index) {
  const c = chunksFor(byId.get(id))[index];
  if (c) {
    await savePersonalEntry(id, c.vi, c.en, "teaching-chunk");
    toast("Phrase saved.");
  }
}
function personalPhrases() {
  if (state.exams.some((e) => e.status === "active"))
    throw Error("Finish the paper before opening saved phrase help.");
  openModal(
    `<h2>My saved phrases</h2><p>Read the Vietnamese before opening its meaning. Use another occurrence to practise transfer.</p>${
      state.savedPhrases.length
        ? state.savedPhrases
            .map((p) => {
              const transfer = questions.find(
                (q) =>
                  q.id !== p.questionId &&
                  [q.question.vi, ...q.options.map((o) => o.text.vi)].some(
                    (t) =>
                      t
                        .toLocaleLowerCase("vi")
                        .includes(p.vi.toLocaleLowerCase("vi")),
                  ),
              );
              return `<section class="card"><strong lang="vi">${escape(p.vi)}</strong><details data-review-question="${p.questionId}"><summary>Recall, then reveal meaning</summary><p>${escape(p.en)}</p><p class="source-note">${p.source === "personal" ? "Your personal note" : "AI teaching support"}</p></details><div class="actions">${button("single", "Original question " + byId.get(p.questionId).official_id, "secondary small", `data-id="${p.questionId}" data-level="2"`)}${transfer ? button("single", "Another occurrence: " + transfer.official_id, "ghost small", `data-id="${transfer.id}" data-level="2"`) : '<span class="source-note">No other exact occurrence in this bank.</span>'}</div></section>`;
            })
            .join("")
        : "<p>No saved spans yet. Open a question and choose Save a difficult span.</p>"
    }${closeButton()}`,
  );
}
function beginPhraseRepair(id) {
  const q = byId.get(id),
    ids = q.phrase_ids.filter((id) => byPhrase.has(id));
  if (!ids.length) {
    openModal(
      `<h2>No reviewed linked phrase for question ${q.official_id}</h2><p lang="vi">${escape(q.question.vi)}</p><p>This item has no linked phrase exercise. Use its question breakdown, save a difficult span, or read the post-answer explanation before returning.</p><div class="actions">${button("personal-phrase", "Save a difficult span", "primary", `data-id="${id}"`)}${closeButton()}</div>`,
    );
    return;
  }
  repairReturn = study;
  repairOrigin = id;
  setupPhraseQueue(ids);
  phraseMode = "flash";
  study = null;
  view = "phrases";
  if (modal.open) modal.close();
  markExposure(id, "contextual-phrase-repair");
  render();
  window.scrollTo(0, 0);
}
function startRepair(id, tag) {
  repairOrigin = id;
  repairTag = tag ?? "unknown";
  repairAnswer = null;
  repairStage = 0;
  if (repairTag === "vocabulary") {
    beginPhraseRepair(id);
    return;
  }
  renderRepair();
}
function renderRepair() {
  const q = byId.get(repairOrigin);
  if (!q) return;
  let activity = "";
  if (repairTag === "negation")
    activity = `<p>Which prompt asks you to identify something prohibited?</p><div class="actions">${button("repair-answer", "được phép", "secondary", 'data-value="allowed"')}${button("repair-answer", "không được phép", "secondary", 'data-value="prohibited"')}</div>${repairAnswer ? `<p>${repairAnswer === "prohibited" ? "Correct." : "Look for không."} <span lang="vi">được phép</span> means permitted; <span lang="vi">không được phép</span> means not permitted. One negative reverses the task. Other qualifiers such as except or not exceeding have their own scope.</p><p lang="vi">Now find the qualifier in: ${escape(q.question.vi)}</p>` : ""}`;
  else if (
    repairTag === "signs" ||
    (repairTag === "numbers" && q.id === "q362")
  ) {
    if (q.id !== "q362") {
      activity = `${figures(q)}<p>Compare the actual figures in question ${q.official_id}: shape, border, symbol and any extra plate. Describe the distinguishing feature before opening the explanation.</p>${button("repair-answer", "I have compared the figures", "secondary", 'data-value="compared"')}${repairAnswer ? `<p>${escape(q.explanation.en)}</p>` : ""}`;
    } else {
      const example = byId.get("q362");
      activity = `<p>Separate teaching example · official question 362 figures.</p>${figures(example)}<p>Which figure gives a maximum speed, rather than a minimum?</p><div class="actions">${button("repair-answer", "Figure 1", "secondary", 'data-value="1"')}${button("repair-answer", "Figure 2", "secondary", 'data-value="2"')}</div>${repairAnswer ? `<p>${repairAnswer === "2" ? "Correct." : "Compare the borders and colours."} Figure 2 is a red-bordered white disc: maximum 50 km/h. Figure 1 is a blue disc: minimum 60 km/h. A number alone does not tell you the rule.</p>` : ""}`;
    }
  } else if (repairTag === "diagram" && q.id === "q487") {
    activity = `${figures(q)}<p>Step ${Math.min(4, repairStage + 1)} of 4: which vehicle proceeds ${repairStage ? "next" : "first"}?</p><div class="actions">${junction487.map(([vi, en], i) => button("repair-step", `${escape(vi)} / ${en}`, i < repairStage ? "primary" : "secondary", `data-value="${i}" ${i < repairStage ? "disabled" : ""}`)).join("")}</div>${junction487
      .slice(0, repairStage)
      .map(
        ([, en, why], i) => `<p><strong>${i + 1}. ${en}:</strong> ${why}</p>`,
      )
      .join(
        "",
      )}${repairAnswer !== null && Number(repairAnswer) >= repairStage ? "<p>Start with the priority/yield signs, then compare the conflicting arrows.</p>" : ""}`;
  } else if (repairTag === "attention")
    activity = `<p>A short three-question practice set follows only after you have read the underlying meaning. Background time counts on its gentle clock; this is not a scored mock.</p>${button("repair-timed", "Try three questions in three minutes", "primary")}`;
  else if (repairTag === "numbers") {
    const numbers = [
      ...new Set(
        [q.question.vi, ...q.options.map((o) => o.text.vi)]
          .join(" ")
          .match(/\d+(?:[.,]\d+)?(?:\s*(?:km\/h|cm|m|km|kW|tuổi))?/g) ?? [],
      ),
    ];
    activity = `<p lang="vi">${escape(q.question.vi)}</p><p>Numbers in this item: ${numbers.map(escape).join(" · ") || "Read the full options for written limits."}</p><p>Before revealing the explanation, identify the vehicle, road and any conditions. Which details must stay attached to a numerical limit?</p><div class="actions">${button("repair-answer", "Vehicle, road and conditions", "secondary", 'data-value="context"')}${button("repair-answer", "The number alone", "secondary", 'data-value="number"')}</div>${repairAnswer ? `<p>${repairAnswer === "context" ? "Correct." : "The number alone is not enough."} ${escape(q.explanation.en)}</p>` : ""}`;
  } else
    activity = `${q.images.length ? figures(q) : ""}<p lang="vi">${escape(q.question.vi)}</p><p>${repairTag === "diagram" ? "Identify any signal or priority/yield sign. Trace each arrow and turning conflict in the original diagram." : "Identify the subject, the action and every exception before comparing options."}</p>${button("repair-answer", "I have identified the situation", "secondary", 'data-value="checked"')}${repairAnswer ? `<p>${escape(q.explanation.en)}</p>` : ""}`;
  openModal(
    `<p class="eyebrow">TEACHING ACTIVITY · NOT AN OFFICIAL EXAM ITEM</p><h2>${escape(taxonomy[repairTag])}</h2><p>${escape(repairPrompts[repairTag])}</p>${activity}<p class="source-note">AI-authored teaching support. Original figures and answer keys are unchanged. Immediate repair does not add durable mastery evidence.</p><div class="actions">${button("close-modal", "Return to question " + q.official_id, "primary")}${button("schedule-check", "Retrieve tomorrow", "ghost")}</div>`,
  );
  markExposure(q.id, "focused-repair");
}
function interfaceLesson() {
  openModal(
    `<p class="eyebrow">STUDY-ONLY VOCABULARY</p><h2>Recognise common test controls</h2><p>These are common Vietnamese labels, not a verified replica of your centre’s software. Confirm the actual interface with your driving school.</p><dl><dt lang="vi">Câu hỏi</dt><dd>Question</dd><dt lang="vi">Đáp án</dt><dd>Answer</dd><dt lang="vi">Tiếp theo / Câu tiếp</dt><dd>Next question</dd><dt lang="vi">Quay lại / Câu trước</dt><dd>Previous question</dd><dt lang="vi">Thời gian còn lại</dt><dd>Time remaining</dd><dt lang="vi">Nộp bài / Kết thúc</dt><dd>Submit / Finish</dd></dl><p>Keyboard: 1–4 select an option; Enter checks a study answer; left/right arrows move through a paper.</p>${closeButton()}`,
  );
}

boot();
