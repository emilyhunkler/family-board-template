// Brain quests on a kid's page: a card that shows how many are left this week, and the quiz itself.
import { useState, useMemo, useEffect } from 'https://cdn.jsdelivr.net/npm/preact@11.2.0/hooks/+esm';
import { html, api, toast, chime, confetti } from './app.js';
import { speak, prewarm } from './voice.js';
import { SUBJECTS, buildQuiz, quizGrade, subjectLabel } from './quiz.js';

const say = (t) => speak(t); // speak() drops emoji and says math signs as words
const maxStars = (z) => z.questions * z.starsEach + z.perfectBonus;

export function BrainCard({ b, k, refresh }) {
  const z = k.quiz; const [open, setOpen] = useState(false);
  if (!z || !z.on) return '';
  const best = z.week.length ? Math.max(...z.week.map((r) => r.score)) : null;
  return html`<div class="card group brain"><div class="hd"><b>🧠 Brain quest</b><span>${z.left ? `${z.left} of ${z.perWeek} left this week · up to ★ ${maxStars(z)}` : 'all done this week!'}</span></div>
    <div class="brainrow"><div class="braintxt">${z.left ? 'Answer 5 questions in math, science or social studies and earn bonus stars. Only if you want to!' : `You did all ${z.perWeek} this week${best != null ? `. Best score: ${best}/${z.questions}` : ''}. New ones next week! 🌟`}
      ${z.week.length ? html`<div class="brainhist">${z.week.map((r) => html`<span>${SUBJECTS.find((s) => s.id === r.subject)?.emoji || '🧠'} ${r.score}/${r.total} · ★${r.stars}</span>`)}</div>` : ''}</div>
      ${z.left ? html`<button class="pill sun" onClick=${() => setOpen(true)}>Start 🚀</button>` : ''}</div>
    ${open ? html`<${Quiz} b=${b} k=${k} onClose=${() => setOpen(false)} refresh=${refresh} />` : ''}</div>`;
}

function Quiz({ b, k, onClose, refresh }) {
  const z = k.quiz; const [subject, setSubject] = useState(null); const [i, setI] = useState(0); const [picked, setPicked] = useState(null); const [results, setResults] = useState([]); const [done, setDone] = useState(null); const [busy, setBusy] = useState(false);
  const grade = useMemo(() => quizGrade(z.grade, z.recent), [z.grade]);
  const qs = useMemo(() => (subject ? buildQuiz({ subject, grade, region: z.region, asked: z.asked, n: z.questions }) : []), [subject]);
  const q = qs[i]; useEffect(() => { if (!qs[0]) return; say(qs[0].q); prewarm(qs.flatMap((x, j) => [x.why, j ? x.q : ''])); }, [qs]);
  const choose = (c) => { if (picked != null) return; setPicked(c); const ok = c === q.right; chime(ok ? 'ok' : 'bad'); setResults((r) => [...r, { id: q.id, ok, topic: q.topic }]); say(q.why); }; // the chime and colors already say right or wrong; one clip per answer keeps the voice within its daily limit
  const next = async () => {
    if (i + 1 < qs.length) { setI(i + 1); setPicked(null); say(qs[i + 1].q); return; }
    setBusy(true); try { const r = await api('/api/quiz/finish', { kid: k.id, subject, grade, results }); setDone(r); if (r.score === r.total) { confetti(); chime('win'); } else chime('ok'); say(r.score === r.total ? `Perfect! ${r.stars} stars!` : `You got ${r.score} out of ${r.total}. ${r.stars} stars!`); refresh(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const close = (e) => { e?.stopPropagation(); if (subject && !done && results.length && !confirm('Stop this brain quest? It won\'t count.')) return; onClose(); };
  return html`<div class="ov" onClick=${close}><div class="sheet quiz" style=${{ '--kc': k.color }} onClick=${(e) => e.stopPropagation()}><button class="close" onClick=${close}>×</button>
    ${!subject ? html`<h3>🧠 ${k.name}'s brain quest</h3><p class="qsub">Pick a subject. ${z.questions} questions, ★ ${z.starsEach} for each right answer${z.perfectBonus ? `, +${z.perfectBonus} for a perfect score` : ''}.</p>
      <div class="qsubj">${SUBJECTS.map((s) => html`<button onClick=${() => setSubject(s.id)}><span>${s.emoji}</span>${s.label}</button>`)}</div>`
    : done ? html`<div class="qdone"><div class="big">${done.score === done.total ? '🏆' : done.score >= done.total - 1 ? '🌟' : '💪'}</div><h3>${done.score === done.total ? 'Perfect score!' : done.score >= done.total / 2 ? 'Great thinking!' : 'Good try!'}</h3>
      <p>${done.score} out of ${done.total} right · <b>★ ${done.stars} bonus stars</b></p>${results.some((r) => !r.ok) ? html`<p class="qsub">Practice idea: ${[...new Set(results.filter((r) => !r.ok).map((r) => r.topic))].join(', ').toLowerCase()}.</p>` : ''}
      <button class="pill" onClick=${onClose}>Done</button></div>`
    : q ? html`<div class="qtop"><span>${subjectLabel(q.subject)} · ${q.topic}</span><span class="qdots">${qs.map((_, j) => html`<i class=${j < results.length ? (results[j].ok ? 'ok' : 'no') : j === i ? 'on' : ''}></i>`)}</span></div>
      <div class="qq">${q.q}<button class="qsay" title="Read it to me" onClick=${() => say(q.q + ' ' + q.choices.join(', or '))}>🔊</button></div>
      <div class="qch">${q.choices.map((c, j) => html`<button class=${picked == null ? '' : j === q.right ? 'right' : j === picked ? 'wrong' : 'dim'} onClick=${() => choose(j)}>${c}</button>`)}</div>
      ${picked != null ? html`<div class=${'qwhy ' + (picked === q.right ? 'ok' : 'no')}><b>${picked === q.right ? 'Yes! ✅' : 'Not quite.'}</b> ${q.why}</div><button class="pill qnext" disabled=${busy} onClick=${next}>${i + 1 < qs.length ? 'Next →' : busy ? 'Adding up…' : 'See my stars ⭐'}</button>` : ''}`
    : html`<p>Hmm, no questions found for that one. Try another subject.</p><button class="pill" onClick=${() => setSubject(null)}>Back</button>`}
  </div></div>`;
}
