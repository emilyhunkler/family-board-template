// Plain-sentence command rules. interpret(text, ctx) -> { intent, params, say, needPin, action }
// ctx: { cfg, kids:[{id,name,stats}], events:[...next days], weather, groceries, today }
const norm = (s) => s.toLowerCase().replace(/[^\w\s':,-]/g, ' ').replace(/\s+/g, ' ').trim();
const strip = (s, wake) => { let t = norm(s); const w = norm(wake || ''); if (w && t.startsWith(w)) t = t.slice(w.length); return t.replace(/^[,.\s]+/, '').replace(/^(please|hey|ok|okay)\s+/, '').trim(); };
const kidByName = (t, kids) => kids.find((k) => new RegExp(`\\b${k.name.toLowerCase()}('s)?\\b`).test(t));
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dateFromWords(t, today) {
  const [y, m, d] = today.split('-').map(Number); const base = Date.UTC(y, m - 1, d); const out = (n) => new Date(base + n * 86400000).toISOString().slice(0, 10);
  if (/\btomorrow\b/.test(t)) return out(1); if (/\btoday\b|\btonight\b/.test(t)) return out(0);
  for (let i = 0; i < 7; i++) if (new RegExp(`\\b(on |for |next )?${DAYS[i]}\\b`).test(t)) { const wd = new Date(base).getUTCDay(); let n = (i - wd + 7) % 7; if (n === 0) n = 7; return out(n); }
  return out(0);
}
function scoreMatch(a, b) { const A = new Set(norm(a).split(' ').filter((w) => w.length > 2)); const B = norm(b).split(' ').filter((w) => w.length > 2); let s = 0; for (const w of B) if (A.has(w)) s++; return s / Math.max(1, B.length); }
export function bestTask(phrase, tasks) {
  let best = null, bs = 0; for (const t of tasks) { const s = Math.max(scoreMatch(t.title, phrase), scoreMatch(phrase, t.title)); if (s > bs) { bs = s; best = t; } }
  return bs >= 0.34 ? best : null;
}
export function interpret(raw, ctx) {
  const { cfg, kids, today } = ctx; const t = strip(raw, cfg.voice?.wake); const say = (s) => s;
  let m;
  if ((m = /^(?:add|put|we need|get|buy)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?(?:grocery|groceries|shopping)\s+list$/.exec(t)) || (m = /^(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:the\s+)?list$/.exec(t)) || (m = /^(?:we need|we're out of|we are out of|out of)\s+(.+)$/.exec(t)))
    return { intent: 'grocery.add', params: { items: m[1] }, say: say(`Added ${m[1]} to the grocery list.`) };
  if ((m = /^(?:remove|take)\s+(.+?)\s+(?:off|from)\s+(?:the\s+)?(?:grocery |shopping )?list$/.exec(t))) return { intent: 'grocery.remove', params: { item: m[1] }, say: say(`Took ${m[1]} off the list.`) };
  if (/^(?:what'?s|what is|read)\s+(?:on\s+)?(?:the\s+)?(?:grocery|shopping)\s+list/.test(t)) { const g = (ctx.groceries || []).filter((x) => !x.done).map((x) => x.text); return { intent: 'grocery.read', params: {}, say: g.length ? `On the list: ${g.join(', ')}.` : 'The grocery list is empty.' }; }
  if ((m = /^(?:dinner|supper)\s+(?:tonight|today|on \w+day|tomorrow)?\s*(?:is|will be|:)\s+(.+)$/.exec(t)) || (m = /^(?:set|make|plan)\s+dinner\s+(?:for\s+)?(?:tonight|today|tomorrow|\w+day)?\s*(?:to|as|:)?\s*(.+)$/.exec(t)))
    return { intent: 'meal.set', params: { date: dateFromWords(t, today), text: m[1].replace(/^(?:to|as)\s+/, '') }, say: say(`Dinner is ${m[1]}.`) };
  if ((m = /^(?:what'?s|what is)\s+(?:for\s+)?dinner/.test(t) ? [t] : null)) { const d = dateFromWords(t, today); const meal = (ctx.meals || []).find((x) => x.date === d); return { intent: 'meal.read', params: { date: d }, say: meal ? `Dinner is ${meal.text}.` : 'No dinner planned yet.' }; }
  if ((m = /^(?:note|remind everyone|tell everyone|announce|post)\s*[:,]?\s+(.+)$/.exec(t))) return { intent: 'note.add', params: { text: m[1] }, say: say('Posted the note.') };
  if ((m = /^(?:set|start)\s+(?:a\s+)?timer\s+(?:for\s+)?(\d+)\s*(minute|minutes|min|seconds|second|sec)s?(?:\s+(?:for|called|named)\s+(.+))?$/.exec(t)))
    return { intent: 'timer', params: { seconds: /sec/.test(m[2]) ? +m[1] : +m[1] * 60, label: m[3] || '' }, say: say(`Timer set for ${m[1]} ${/sec/.test(m[2]) ? 'seconds' : 'minutes'}.`), action: { type: 'timer', seconds: /sec/.test(m[2]) ? +m[1] : +m[1] * 60, label: m[3] || 'Timer' } };
  if ((m = /^(?:show|open|go to)\s+(?:the\s+|me\s+)?(home|week|month|day|calendar|groceries|grocery list|wardrobe|parents|weather)\b/.exec(t))) return { intent: 'navigate', params: { page: m[1] }, say: '', action: { type: 'navigate', page: m[1].replace('grocery list', 'groceries').replace('calendar', 'week') } };
  if ((m = /^(?:show|open|go to)\s+(?:me\s+)?(\w+?)(?:'s)?(?:\s+(?:page|list|chores))?$/.exec(t)) && kidByName(m[1], kids)) { const k = kidByName(m[1], kids); return { intent: 'navigate', params: { page: k.id }, say: '', action: { type: 'navigate', page: k.id } }; }
  if (/weather|forecast|cold|hot|rain|snow|temperature|outside/.test(t)) {
    const w = ctx.weather; if (!w) return { intent: 'weather', params: {}, say: 'I do not have the weather right now.' };
    const tomorrow = /tomorrow/.test(t); const d = w.days?.[tomorrow ? 1 : 0];
    return { intent: 'weather', params: { tomorrow }, say: tomorrow ? `Tomorrow: ${d.label.toLowerCase()}, high ${d.high}, low ${d.low}, ${d.rainPct}% chance of rain.` : `Right now it is ${w.current.temp} and ${w.current.label.toLowerCase()}, feels like ${w.current.feels}. High ${d.high}, low ${d.low}. ${ctx.tip || ''}` };
  }
  if (/^(?:what'?s|what is|whats)\s+(?:up\s+)?next|^next\s+up|^what do we have (?:next|today)|^what'?s (?:going on|happening) today/.test(t)) {
    const now = Date.now(); const ev = (ctx.events || []).find((e) => new Date(e.start).getTime() > now && !e.allDay) || (ctx.events || [])[0];
    return { intent: 'next', params: {}, say: ev ? `Next up: ${ev.title} at ${ev.timeLabel}${ev.leaveBy ? `, leave by ${ev.leaveBy}` : ''}.` : 'Nothing else on the calendar today.' };
  }
  if ((m = /^when(?:'s| is|s)\s+(.+?)(?:\?|$)/.exec(t))) {
    const q = m[1].replace(/^(the|our|my)\s+/, ''); const ev = (ctx.events || []).find((e) => scoreMatch(e.title, q) >= 0.5 || e.title.toLowerCase().includes(q));
    return { intent: 'when', params: { q }, say: ev ? `${ev.title} is ${ev.dayLabel} at ${ev.timeLabel}.` : `I could not find ${q} in the next few weeks.` };
  }
  if ((m = /^how many stars (?:does|do|has)\s+(\w+)/.exec(t)) || (m = /^(\w+)'?s? stars/.exec(t))) {
    const k = kidByName(m[1], kids); return k ? { intent: 'stars', params: { kid: k.id }, say: `${k.name} has ${k.stats.weekStars} stars this week and ${k.stats.lifetime} all time. Level ${k.stats.level}.` } : { intent: 'stars', params: {}, say: 'Which kid?' };
  }
  if ((m = /^(?:who'?s|whose) turn/.exec(t))) return { intent: 'turn', params: {}, say: ctx.turnText || 'No shared jobs today.' };
  if ((m = /^approve\s+(\w+)'?s?\s+quest/.exec(t))) { const k = kidByName(m[1], kids); return { intent: 'quest.approve', params: { kid: k?.id }, needPin: true, say: k ? `Approving ${k.name}'s quest.` : 'Which kid?' }; }
  if ((m = /^add\s+(?:a\s+)?(?:bonus\s+)?quest\s*[:,]?\s+(.+?)(?:,|\s+for|\s+worth)\s+(\d+)\s+stars?$/.exec(t))) return { intent: 'quest.add', params: { title: m[1], stars: +m[2] }, needPin: true, say: `Added the quest ${m[1]} for ${m[2]} stars.` };
  if ((m = /^add\s+(.+?)\s+to\s+(\w+)'?s?\s+(?:list|tasks|to ?dos?)(?:\s+(?:for|on)\s+(.+))?$/.exec(t))) { const k = kidByName(m[2], kids); const date = dateFromWords(m[3] || '', today); return { intent: 'todo.add', params: { kid: k?.id || null, title: m[1], date }, say: `Added ${m[1]} ${k ? 'to ' + k.name + "'s list" : 'for both'} ${m[3] ? 'for ' + m[3] : 'today'}.` }; }
  if ((m = /^add\s+(?:a\s+)?(?:to ?do|task)\s*[:,]?\s+(.+?)(?:\s+(?:for|on)\s+(tomorrow|today|\w+day))?$/.exec(t))) return { intent: 'todo.add', params: { kid: null, title: m[1], date: dateFromWords(m[2] || '', today) }, say: `Added ${m[1]}.` };
  if ((m = /^(\w+)\s+(?:just\s+)?(?:fed|walked|brushed|finished|did|done|completed|made|packed|practiced|unpacked|emptied|set|cleaned|tidied|brushed)\s+(.+)$/.exec(t)) || (m = /^(\w+)\s+(?:is|has)\s+(?:done|finished)(?:\s+with)?\s+(.+)$/.exec(t))) {
    const k = kidByName(m[1], kids); if (k) { const verb = /^(\w+)\s+(\w+)/.exec(t)[2]; const phrase = (verb + ' ' + m[2]); const task = bestTask(phrase, k.todayTasks || []); return task ? { intent: 'task.check', params: { kid: k.id, id: task.id }, say: task.done ? `${task.title} was already checked.` : `Nice, ${k.name}! ${task.title}, done.` } : { intent: 'task.check', params: { kid: k.id }, say: `I could not find that on ${k.name}'s list today.` }; }
  }
  if ((m = /^(\w+)\s+(?:wants to|would like to|claims?|is claiming)\s+(.+)$/.exec(t)) || (m = /^claim\s+(.+?)\s+for\s+(\w+)$/.exec(t))) {
    const k = kidByName(m[1], kids) || kidByName(m[2], kids); const phrase = kidByName(m[1], kids) ? m[2] : m[1]; if (k) { const q = bestTask(phrase, cfg.quests || []); return q ? { intent: 'quest.claim', params: { kid: k.id, questId: q.id }, say: `${k.name} claimed ${q.title}. ${(cfg.family?.parents || []).map((p) => p.name).join(' or ') || 'A grown-up'} will approve it.` } : { intent: 'quest.claim', params: {}, say: 'Which quest?' }; }
  }
  if (/^(?:feedback|i have feedback|send feedback|suggestion|i have an idea)/.test(t)) return { intent: 'navigate', params: { page: 'feedback' }, say: 'Okay, tell me.', action: { type: 'feedback' } };
  if (/^(?:thank you|thanks)/.test(t)) return { intent: 'chat', params: {}, say: 'You are welcome!' };
  if (/^(?:hello|hi|good morning)/.test(t)) return { intent: 'chat', params: {}, say: ctx.greeting || 'Hello!' };
  return { intent: 'unknown', params: { text: t }, say: '' };
}
