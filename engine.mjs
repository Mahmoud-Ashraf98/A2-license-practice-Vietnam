/** Pure, deterministic training rules. Source option IDs and order are never modified. */
const DAY = 86400000;
const MAX_RECORDS = 200000;
const MISTAKE_IDS = ['vocabulary', 'negation', 'rule', 'signs', 'diagram', 'numbers', 'attention', 'unknown'];
// Known archived/current profile IDs remain verifiable even when readiness is
// called without a separate profile list. Application callers may pass profiles.
const CURRENT_POOLS = [{chapter:1,critical_for_motorcycle:false,count:8},{chapter:1,critical_for_motorcycle:true,count:1},{chapter:2,count:1},{chapter:3,count:1},{chapter:5,count:8},{chapter:6,count:6}];
const CURRENT_PROFILES = ['A','A1'].map(category => ({id:`vn-${category}-2025-06`,bank_id:'vn-motorcycle-250-2025-06-v1',valid_from:'2025-06-01',valid_through:'2027-02-28',question_count:25,duration_seconds:1140,minimum_correct:category==='A'?23:21,critical_question_count:1,critical_wrong_or_blank_fails:true,paper_pools:CURRENT_POOLS}));
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
export const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
export function vnDate(ms = Date.now()) {
  const n = timestamp(ms);
  if (!Number.isFinite(n)) throw new Error('Invalid date');
  const parts = Object.fromEntries(dateFormatter.formatToParts(n).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function profileValid(profile, ms = Date.now()) {
  const day = vnDate(ms);
  return !!profile && day >= profile.valid_from && day <= profile.valid_through;
}
function seeded(seed) {
  let n = 2166136261;
  for (const c of String(seed)) { n ^= c.codePointAt(0); n = Math.imul(n, 16777619); }
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
export function generatePaper(questions, profile, seed = `${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random()}`) {
  if (!Array.isArray(questions) || !Array.isArray(profile?.paper_pools)) throw new Error('Invalid paper configuration');
  const random = seeded(seed), selected = [], used = new Set();
  for (const pool of profile.paper_pools) {
    const eligible = questions.filter(q => q.chapter === pool.chapter && !used.has(q.id) && !q.content_error && !q.unavailable && (!q.requires_image || q.images?.length) && (pool.critical_for_motorcycle === undefined || q.critical_for_motorcycle === pool.critical_for_motorcycle));
    if (eligible.length < pool.count) throw new Error(`Not enough verified questions in chapter ${pool.chapter}`);
    for (const q of shuffle(eligible, random).slice(0, pool.count)) { selected.push(q); used.add(q.id); }
  }
  if (selected.length !== profile.question_count || selected.filter(q => q.critical_for_motorcycle).length !== profile.critical_question_count) throw new Error('Paper composition does not match profile');
  return { ids: shuffle(selected, random).map(q => q.id), seed: String(seed) };
}
export function validatePaper(questions, profile, ids) {
  if (!Array.isArray(ids) || ids.length !== profile.question_count || new Set(ids).size !== ids.length) throw new Error('Invalid paper IDs');
  const byId = new Map(questions.map(q => [q.id, q]));
  const selected = ids.map(id => { const q = byId.get(id); if (!q) throw new Error(`Unknown question ${id}`); return q; });
  if (!Array.isArray(profile.paper_pools) || profile.paper_pools.reduce((n,p) => n+p.count,0) !== ids.length || selected.filter(q => q.critical_for_motorcycle).length !== profile.critical_question_count) throw new Error('Paper composition does not match profile');
  for (const pool of profile.paper_pools) {
    if (selected.filter(q => q.chapter === pool.chapter && (pool.critical_for_motorcycle === undefined || q.critical_for_motorcycle === pool.critical_for_motorcycle)).length !== pool.count) throw new Error('Paper pool composition does not match profile');
  }
  if (selected.some(q => !profile.paper_pools.some(pool => q.chapter === pool.chapter && (pool.critical_for_motorcycle === undefined || q.critical_for_motorcycle === pool.critical_for_motorcycle)))) throw new Error('Question is outside configured paper pools');
  return true;
}
export function scorePaper(questions, profile, ids, answers = {}) {
  validatePaper(questions, profile, ids);
  if (!plain(answers) || Object.keys(answers).some(id => !ids.includes(id))) throw new Error('Invalid paper answers');
  const byId = new Map(questions.map(q => [q.id, q]));
  let correct = 0, unanswered = 0, criticalWrong = false;
  for (const id of ids) {
    const q = byId.get(id); if (!q) throw new Error(`Unknown question ${id}`);
    const answer = answers?.[id], blank = answer === undefined || answer === null || answer === '';
    if (!blank && !q.options.some(o => o.id === answer)) throw new Error(`Invalid answer for ${id}`);
    if (blank) unanswered++;
    if (answer === q.correct_option_id) correct++;
    else if (q.critical_for_motorcycle) criticalWrong = true;
  }
  return { correct, total: ids.length, unanswered, criticalWrong, passed: correct >= profile.minimum_correct && !(profile.critical_wrong_or_blank_fails && criticalWrong) };
}
function verifyExamEvidence(exam, questions, profiles, requireExplicitTimed = false) {
  const profile = profiles.find(p => p.id === exam.profileId);
  if (!profile || exam.bankVersion !== profile.bank_id) throw new Error('Exam profile and bank do not match');
  validatePaper(questions, profile, exam.ids);
  if ((requireExplicitTimed && typeof exam.timed !== 'boolean') || (exam.timed !== undefined && typeof exam.timed !== 'boolean') || (exam.level !== undefined && exam.level !== 4)) throw new Error('Invalid exam mode');
  const startedAt = timestamp(exam.startedAt), deadline = timestamp(exam.deadline);
  if (!finiteTime(exam.startedAt) || (exam.timed !== false && (!finiteTime(exam.deadline) || deadline - startedAt !== profile.duration_seconds * 1000 || !profileValid(profile, startedAt)))) throw new Error('Exam timer does not match the verified profile');
  if (exam.status === 'completed') {
    const finishedAt = timestamp(exam.finishedAt);
    if (!finiteTime(exam.finishedAt) || finishedAt < startedAt || (exam.timed !== false && finishedAt > deadline)) throw new Error('Invalid exam completion time');
    const actual = scorePaper(questions, profile, exam.ids, exam.answers);
    if (!plain(exam.result) || Object.keys(actual).some(key => actual[key] !== exam.result[key])) throw new Error('Stored exam result differs from its answers');
    return actual;
  }
  if (exam.result !== undefined && exam.result !== null) throw new Error('An unfinished exam cannot contain a completed result');
  // Check every selected option even before a mock is completed.
  scorePaper(questions, profile, exam.ids, exam.answers);
  if (exam.finishedAt !== undefined && (!finiteTime(exam.finishedAt) || timestamp(exam.finishedAt) < startedAt)) throw new Error('Invalid exam end time');
  return null;
}
export function languagePolicy(level, committed = false, examFinished = false) {
  level = Number(level);
  if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Unknown support level');
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
    assistedByDefault: level === 0
  });
}
export function phraseSegments(text, phrases) {
  if (typeof text !== 'string') return [];
  const lower = text.toLocaleLowerCase('vi'), candidates = [];
  // Include ambiguous/negative chunks as blockers before choosing automatic glosses.
  // An ambiguous larger chunk must never expose an unambiguous substring instead.
  const word = c => !!c && /[\p{L}\p{N}]/u.test(c);
  for (const phrase of phrases ?? []) {
    if (typeof phrase.vi !== 'string' || !phrase.vi) continue;
    const needle = phrase.vi.toLocaleLowerCase('vi');
    let start = lower.indexOf(needle);
    while (start !== -1) {
      const end = start + needle.length;
      if (!word(text[start - 1]) && !word(text[end])) candidates.push({ start, end, phrase });
      start = lower.indexOf(needle, start + 1);
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen = [];
  for (const c of candidates) if (!chosen.some(x => c.start < x.end && c.end > x.start)) chosen.push(c);
  chosen.sort((a, b) => a.start - b.start);
  const segments = []; let offset = 0;
  for (const c of chosen) {
    if (c.start > offset) segments.push({ text: text.slice(offset, c.start) });
    const safe = c.phrase.automatic_gloss_allowed !== false && !c.phrase.ambiguous_without_context;
    segments.push(safe ? { text: text.slice(c.start, c.end), phrase: c.phrase } : { text: text.slice(c.start, c.end) });
    offset = c.end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset) });
  return segments.length ? segments : [{ text }];
}
export function usedStudyHelp(attempt) {
  // English visible by default is assistance even without a reveal click.
  return attempt?.level === 0 || (Array.isArray(attempt?.support) && attempt.support.length > 0);
}
export function learningOutcome(attempt) {
  if (!attempt?.correct) return 'incorrect';
  if (usedStudyHelp(attempt)) return 'assisted';
  if (attempt.level < 3) return 'guided';
  if (independent(attempt)) return 'independent';
  return attempt.confidence === 'unrated' ? 'unrated' : 'uncertain';
}
export function independent(attempt) {
  return !!attempt?.correct && (attempt.level === 3 || attempt.level === 4) && (!attempt.support || (Array.isArray(attempt.support) && attempt.support.length === 0)) && attempt.confidence === 'sure';
}
export function reviewState(attemptsForQuestion = []) {
  const attempts = [...attemptsForQuestion].filter(a => Number.isFinite(timestamp(a.at))).sort((a, b) => timestamp(a.at) - timestamp(b.at) || String(a.id).localeCompare(String(b.id)));
  let intervalDays = 0, due = 0, lapses = 0, unresolved = false, successes = new Set(), last = null;
  for (const a of attempts) {
    const at = timestamp(a.at), day = vnDate(at);
    if (!a.correct) { lapses++; successes = new Set(); unresolved = true; intervalDays = 1; }
    else if (independent(a)) {
      successes.add(day); unresolved = false;
      intervalDays = [1, 3, 7, 14, 30][Math.min(successes.size - 1, 4)];
    } else {
      intervalDays = 1;
      // Skipping an optional rating is not an admission of uncertainty or an error.
      if (a.confidence === 'unsure' || a.confidence === 'guessed') unresolved = true;
    }
    due = at + intervalDays * DAY; last = a;
  }
  const independentDates = [...successes].sort();
  const spaced = independentDates.some((d, i) => i > 0 && Date.parse(`${d}T00:00:00Z`) - Date.parse(`${independentDates[i - 1]}T00:00:00Z`) >= 3 * DAY);
  const mastered = independentDates.length >= 3 && spaced && !unresolved && !!last && independent(last);
  return { due, intervalDays, lapses, mastered, independentDates, unresolved };
}
export function readiness(questions, attempts = [], exams = [], now = Date.now(), profiles = CURRENT_PROFILES) {
  const histories = new Map();
  const byId = new Map(questions.map(q => [q.id,q]));
  for (const a of attempts) {
    const q = byId.get(a.questionId);
    if (!q || !finiteTime(a.at) || (a.answerId && !q.options.some(o => o.id === a.answerId)) || a.correct !== (a.answerId === q.correct_option_id)) continue;
    if (!histories.has(a.questionId)) histories.set(a.questionId, []); histories.get(a.questionId).push(a);
  }
  const states = questions.map(q => ({ q, history: histories.get(q.id) ?? [], state: reviewState(histories.get(q.id) ?? []) }));
  const completed = exams.filter(e => {
    if (e.status !== 'completed' || e.timed === false || e.mode === 'practice') return false;
    try { verifyExamEvidence(e, questions, profiles); return true; } catch (_) { return false; }
  }).sort((a, b) => timestamp(a.finishedAt) - timestamp(b.finishedAt));
  const recent = completed.slice(-10);
  const strong = e => e.result.correct >= 24 && !e.result.criticalWrong && e.result.total === 25;
  const coverage = states.filter(x => x.history.length).length;
  const revisited = states.filter(x => new Set(x.history.map(a => vnDate(a.at))).size >= 2).length;
  const mastered = states.filter(x => x.state.mastered).length;
  const criticalMastered = states.filter(x => x.q.critical_for_motorcycle && x.state.mastered).length;
  const criticalTotal = questions.filter(q => q.critical_for_motorcycle).length;
  const due = states.filter(x => x.history.length && x.state.due <= timestamp(now)).length;
  const lastTenStrong = recent.length === 10 && recent.every(strong);
  const timeBuffer = recent.length === 10 && recent.filter(e => timestamp(e.finishedAt) - timestamp(e.startedAt) <= 16 * 60000).length >= 8;
  const missing = [];
  if (coverage < questions.length) missing.push(`Attempt all ${questions.length} questions (${coverage} attempted).`);
  if (revisited < questions.length) missing.push(`Revisit every question on another day (${revisited} revisited).`);
  if (criticalMastered < criticalTotal) missing.push(`Secure all ${criticalTotal} critical questions on separate days (${criticalMastered} secure).`);
  if (!lastTenStrong) missing.push('Complete 10 recent strict mixed mocks at 24–25/25 with no critical error.');
  if (!timeBuffer) missing.push('Finish at least 8 of the last 10 strict mocks within 16 minutes.');
  return { coverage, revisited, mastered, criticalMastered, criticalTotal, due, completedMocks: completed.length, strongMocks: recent.filter(strong).length, lastTenStrong, timeBuffer, ready: !missing.length, missing };
}
function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function rejectUnsafe(value, depth = 0) {
  if (depth > 30) throw new Error('Backup is nested too deeply');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Backup contains an invalid number');
  if (value && typeof value === 'object') {
    if (!Array.isArray(value) && !plain(value)) throw new Error('Backup contains an unsupported object');
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe backup key');
      rejectUnsafe(entry, depth + 1);
    }
  }
}
function finiteTime(value) { return (typeof value === 'string' || typeof value === 'number') && Number.isFinite(timestamp(value)) && timestamp(value) >= 0 && timestamp(value) < 8640000000000000; }
function stringId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 200; }
export function validateBackup(data, bankId, knownIds, questions, profiles = CURRENT_PROFILES) {
  rejectUnsafe(data);
  if (!plain(data) || data.schema_version !== 1 || data.bank_version !== bankId) throw new Error('Backup schema or question-bank version is incompatible');
  if (!plain(data.preferences)) throw new Error('Backup preferences are invalid');
  const preferences = data.preferences;
  if (preferences.level !== undefined && (!Number.isInteger(preferences.level) || preferences.level < 0 || preferences.level > 3)) throw new Error('Invalid saved support level');
  if (preferences.dailyLimit !== undefined && (!Number.isInteger(preferences.dailyLimit) || preferences.dailyLimit < 1 || preferences.dailyLimit > 250)) throw new Error('Invalid saved daily target');
  if (preferences.theme !== undefined && !['system', 'light', 'dark'].includes(preferences.theme)) throw new Error('Invalid saved theme');
  if (preferences.profileId !== undefined && !['vn-A-2025-06', 'vn-A1-2025-06'].includes(preferences.profileId)) throw new Error('Invalid saved exam profile');
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  const byId = Array.isArray(questions) ? new Map(questions.map(q => [q.id,q])) : null;
  const collections = ['attempts', 'exams', 'phraseAttempts', 'bookmarks', 'mistakeEdits'];
  for (const name of collections) if (!Array.isArray(data[name]) || data[name].length > MAX_RECORDS) throw new Error(`Invalid ${name} collection`);
  const checkUnique = (records, kind) => {
    const ids = new Set();
    for (const item of records) {
      if (!plain(item) || !stringId(item.id) || ids.has(item.id)) throw new Error(`Invalid or duplicate ${kind} event ID`);
      ids.add(item.id);
    }
  };
  const questionId = id => { if (!known.has(id)) throw new Error(`Unknown question ID: ${String(id)}`); };
  const answerId = (id, answer) => { if (answer !== null && answer !== '' && answer !== undefined && (typeof answer !== 'string' || (byId ? !byId.get(id)?.options.some(o => o.id === answer) : !new RegExp(`^${id}_opt_[1-4]$`).test(answer)))) throw new Error('Invalid answer ID'); };
  checkUnique(data.attempts, 'attempt'); checkUnique(data.exams, 'exam'); checkUnique(data.phraseAttempts, 'phrase'); checkUnique(data.mistakeEdits, 'mistake');
  for (const a of data.attempts) {
    questionId(a.questionId); answerId(a.questionId, a.answerId);
    if (typeof a.correct !== 'boolean' || !finiteTime(a.at) || (a.startedAt !== undefined && !finiteTime(a.startedAt)) || !Number.isInteger(a.level) || a.level < 0 || a.level > 4 || !['sure', 'unsure', 'guessed', 'unrated'].includes(a.confidence) || !Array.isArray(a.support) || a.support.length > 10000 || !Array.isArray(a.mistakes) || a.mistakes.some(m => !MISTAKE_IDS.includes(m))) throw new Error('Invalid attempt data');
    if (a.startedAt !== undefined && timestamp(a.startedAt) > timestamp(a.at)) throw new Error('Attempt was submitted before it started');
    if (byId && a.correct !== (a.answerId === byId.get(a.questionId).correct_option_id)) throw new Error('Attempt correctness differs from its answer');
  }
  for (const e of data.exams) {
    const validDeadline = finiteTime(e.deadline) || (e.timed === false && e.deadline === Number.MAX_SAFE_INTEGER);
    if (!Array.isArray(e.ids) || e.ids.length !== 25 || new Set(e.ids).size !== e.ids.length || !plain(e.answers) || !['active', 'completed', 'abandoned'].includes(e.status) || !['vn-A-2025-06', 'vn-A1-2025-06'].includes(e.profileId) || e.bankVersion !== bankId || !finiteTime(e.startedAt) || !validDeadline || timestamp(e.deadline) < timestamp(e.startedAt)) throw new Error('Invalid exam data');
    for (const id of e.ids) questionId(id);
    for (const [id, answer] of Object.entries(e.answers)) { if (!e.ids.includes(id)) throw new Error('Exam answer is outside its paper'); answerId(id, answer); }
    if (e.status === 'completed') {
      const r = e.result;
      if (!finiteTime(e.finishedAt) || !plain(r) || !Number.isInteger(r.correct) || r.correct < 0 || r.correct > 25 || r.total !== 25 || !Number.isInteger(r.unanswered) || r.unanswered < 0 || r.unanswered > 25 || r.correct + r.unanswered > 25 || typeof r.criticalWrong !== 'boolean' || typeof r.passed !== 'boolean') throw new Error('Invalid completed exam result');
    }
    if (byId) verifyExamEvidence(e, questions, profiles, true);
  }
  if (byId) {
    const examsById = new Map(data.exams.map(e => [e.id,e]));
    for (const a of data.attempts.filter(a => a.level === 4)) {
      const exam = examsById.get(a.sessionId);
      const expectedMode = exam?.timed === false ? 'practice' : 'exam';
      if (!exam || exam.status !== 'completed' || !exam.ids.includes(a.questionId) || a.mode !== expectedMode || (exam.answers[a.questionId] ?? null) !== (a.answerId ?? null) || timestamp(a.at) !== timestamp(exam.finishedAt) || a.support.length || a.confidence !== 'sure') throw new Error('Exam attempt does not match its completed paper');
    }
  }
  for (const p of data.phraseAttempts) if (!stringId(p.phraseId) || !finiteTime(p.at) || typeof p.correct !== 'boolean') throw new Error('Invalid phrase attempt');
  for (const id of data.bookmarks) questionId(id);
  if (new Set(data.bookmarks).size !== data.bookmarks.length) throw new Error('Duplicate bookmarks');
  const attemptIds = new Set(data.attempts.map(a => a.id));
  for (const m of data.mistakeEdits) {
    if (!attemptIds.has(m.attemptId)) throw new Error('Mistake classification refers to an unknown attempt');
    if (m.questionId !== undefined) questionId(m.questionId);
    const tags = m.mistakes ?? m.tags;
    if (!finiteTime(m.at) || !Array.isArray(tags) || tags.some(tag => !MISTAKE_IDS.includes(tag))) throw new Error('Invalid mistake classification');
  }
  return structuredClone(data);
}
export function mergeBackups(existing, incoming) {
  if (existing.schema_version !== incoming.schema_version || existing.bank_version !== incoming.bank_version) throw new Error('Cannot merge incompatible backups');
  const merged = structuredClone(existing);
  // Existing events/results are immutable: imported duplicates never overwrite them.
  for (const key of ['attempts', 'exams', 'phraseAttempts', 'mistakeEdits']) {
    const known = new Set(merged[key].map(e => e.id));
    for (const event of incoming[key]) if (!known.has(event.id)) { merged[key].push(structuredClone(event)); known.add(event.id); }
  }
  merged.bookmarks = [...new Set([...existing.bookmarks, ...incoming.bookmarks])];
  merged.preferences = { ...existing.preferences, ...structuredClone(incoming.preferences) };
  return merged;
}
