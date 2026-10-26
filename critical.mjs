import { independent, reviewState, timestamp } from './engine.mjs';

// The motorcycle flag is authoritative; car-only critical flags never enter this collection.
export function criticalProgress(questions, attempts, now = Date.now()) {
  const items = questions.filter(q => q.critical_for_motorcycle).map(question => {
    const history = attempts.filter(a => a.questionId === question.id).sort((a,b) => timestamp(a.at)-timestamp(b.at));
    const state = reviewState(history), latest = history.at(-1);
    const due = !!latest && state.due <= now;
    const status = !latest ? 'unseen' : state.mastered ? 'secure' : !independent(latest) || state.unresolved ? 'needsUnaided' : 'developing';
    const priority = state.unresolved || latest && (!latest.correct || ['unsure','guessed'].includes(latest.confidence)) ? 0 : !latest ? 1 : due ? 2 : status === 'needsUnaided' ? 3 : 4;
    return { question, history, latest, state, due, status, priority };
  });
  const count = status => items.filter(item => item.status === status).length;
  const priorityIds = items.filter(item => item.status !== 'secure' || item.due)
    .sort((a,b) => a.priority-b.priority || a.state.due-b.state.due || a.question.official_id-b.question.official_id)
    .map(item => item.question.id);
  return { items, total:items.length, unseen:count('unseen'), needsUnaided:count('needsUnaided'), developing:count('developing'), secure:count('secure'), due:items.filter(item=>item.due).length, priorityIds };
}

export function criticalDrillSummary(questions, attempts, sessionId) {
  const ids = new Set(questions.filter(q=>q.critical_for_motorcycle).map(q=>q.id));
  const latest = new Map();
  for (const attempt of attempts.filter(a=>a.sessionId===sessionId && ids.has(a.questionId)).sort((a,b)=>timestamp(a.at)-timestamp(b.at))) latest.set(attempt.questionId,attempt);
  const events = [...latest.values()];
  return { total:ids.size, answered:events.length, correct:events.filter(a=>a.correct).length, independentCorrect:events.filter(independent).length, needsReviewIds:events.filter(a=>!independent(a)).map(a=>a.questionId), complete:events.length===ids.size };
}
