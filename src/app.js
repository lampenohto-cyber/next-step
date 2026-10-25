(() => {
"use strict";
const COLORS = [
  ["Sage","#8fb59a"],["Sky","#8ab4d6"],["Lavender","#b3a2d6"],["Rose","#e3a0ad"],["Peach","#efb48a"],
  ["Butter","#e2c96f"],["Mint","#86c9b8"],["Clay","#c99a84"],["Lilac","#d1a6cf"],["Slate","#9aa6b2"]];
const LS = "nextstep.v1";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- dates ----------
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate()+n); return iso(d); };
function daysUntil(s){
  if(!s) return null;
  const [y,m,d] = s.split("-").map(Number);
  const a = new Date(y, m-1, d); const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((a - t) / 86400000);
}
function fmtDate(s){
  if(!s) return "";
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
}
function fmtTime(hm){
  if(!hm) return "";
  const [h,m] = hm.split(":").map(Number);
  return `${h%12===0?12:h%12}:${pad(m)} ${h>=12?"PM":"AM"}`;
}
function dueLabel(a){
  const n = daysUntil(a.due);
  if(n === null) return {txt:"no date", cls:"later"};
  const t = a.time ? " · " + fmtTime(a.time) : "";
  if(n < 0) return {txt:`${-n}d overdue`, cls:"over"};
  if(n === 0) return {txt:"today" + t, cls:"today"};
  if(n === 1) return {txt:"tomorrow" + t, cls:"soon"};
  if(n <= 7) return {txt:`in ${n} days`, cls:"soon"};
  return {txt:fmtDate(a.due), cls:"later"};
}

// ---------- state ----------
function examples(){
  const mk = (title, cls, d, time, dread, good, steps) => ({
    id:uid(), title, cls, due:addDays(d), time, dread, goodEnough:good, notes:"", done:false, example:true, created:Date.now(),
    steps: steps.map(([t,m]) => ({id:uid(), text:t, min:m, done:false, doneAt:null}))
  });
  return [
    mk("Chapter 7 reading + quiz", "Psych 414", 1, "23:59", 2, "Read the summary boxes and bolded terms. Skimming the rest is fine.",
      [["Open the chapter and read only the headings",2],["Read sections 7.1–7.2, note bolded terms",20],["Read sections 7.3–7.4",20],["Take the quiz with notes open",15]]),
    mk("IRP literature review draft", "Psych 225", 4, "", 3, "A messy first draft with 5 sources. Polishing happens later.",
      [["Open a blank doc and paste the assignment prompt",2],["List 5 sources you already have",10],["Write one ugly sentence per source",20],["Group sources into 2–3 themes",15],["Turn each theme into a paragraph",30]]),
    mk("Canto essay outline", "LitTrans 253", 9, "", 1, "Thesis + 3 bullet points per paragraph.",
      [["Pick the canto and write it at the top of a doc",2],["Write a one-line thesis, even a bad one",10],["List 3 scenes that support it",15]])
  ];
}
function fresh(){
  return {
    classes:[{name:"Psych 414",color:"#b3a2d6"},{name:"Psych 225",color:"#8ab4d6"},{name:"LitTrans 253",color:"#efb48a"},{name:"RE 306",color:"#8fb59a"},{name:"NutriSci 132",color:"#e2c96f"}],
    assignments:examples(), dump:[], checkin:{date:"",energy:0}, examplesCleared:false, updated:Date.now()
  };
}
let state = null;
let openId = null;
let sample = null, assets = null;

function loadLocal(){
  try { const raw = localStorage.getItem(LS); if(raw) return JSON.parse(raw); } catch(e){}
  return null;
}
function saveLocal(){ try { localStorage.setItem(LS, JSON.stringify(state)); } catch(e){} }

function save(){
  state.updated = Date.now();
  saveLocal();
}
function setSync(t){ $("sync").textContent = t; }

// ---------- helpers ----------
const cls = name => state.classes.find(c => c.name === name) || {name, color:"#9aa6b2"};
function tagHTML(name){
  if(!name) return "";
  const c = cls(name);
  return `<span class="tag" style="background:color-mix(in srgb, ${c.color} 24%, var(--bg))"><span class="dot" style="background:${c.color}"></span>${esc(name)}</span>`;
}
const openAsg = () => state.assignments.filter(a => !a.done);
const feelWord = d => ["","fine","meh","ugh"][d] || "meh";
let toastT, claudeErr = "";
const fileUrl = f => (f.id && assets && assets.url(f.id)) || f.url || "";
function noteClaudeError(e){
  const c = e && e.code;
  claudeErr = c === "bad_key" ? "Claude rejected the API key. Check it in Settings." :
    c === "refusal" ? "Claude couldn't help with this one. Fill in the details yourself." :
    e && e.name === "TypeError" ? "Couldn't reach Claude. Check your connection." :
    "Claude had a problem" + (e && e.message ? ": " + String(e.message).slice(0, 120) : "") + ".";
}
function toast(msg){
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200);
}

// ---------- today plan ----------
const BUDGET = {1:45, 2:90, 3:150};
const maxSteps = size => ({small:3, medium:5}[size] || 12);
const canSkip = a => (daysUntil(a.due) ?? 99) > 0;
const isSkipped = a => a.skippedOn === todayISO() && canSkip(a);
// ---------- scheduling: when does an assignment start showing up? ----------
function sizeOf(a){
  if(["small","medium","large"].includes(a.size)) return a.size;
  const total = a.estimateMin || a.steps.reduce((n,s) => n + s.min, 0);
  return total < 60 ? "small" : total <= 180 ? "medium" : "large";
}
function startDay(a){
  // days before the due date it should appear in Today's plan
  const left = a.steps.filter(s => !s.done).length;
  const sz = sizeOf(a);
  if(sz === "small") return 1;
  if(sz === "medium") return 3;
  return Math.ceil(left / 2) + 1;            // ~2 steps a day + 1 spare day
}
function startsIn(a){                      // days from today until it appears; <=0 means it's on
  const n = daysUntil(a.due);
  if(n === null) return 0;
  return n - startDay(a);
}
const pulledToday = a => a.pulledOn === todayISO();
const isActive = a => !a.steps.length || startsIn(a) <= 0 || pulledToday(a);
function stepsPerDay(a){
  const left = a.steps.filter(s => !s.done).length;
  const n = daysUntil(a.due);
  if(n === null || sizeOf(a) !== "large") return 3;
  const days = Math.max(1, n - 1);          // keep the last day spare
  return Math.min(4, Math.max(1, Math.ceil(left / days)));
}

function buildPlan(){
  const today = todayISO();
  const energy = state.checkin.date === today ? state.checkin.energy : 0;
  const budget = BUDGET[energy || 2];
  const items = [];
  let used = 0;
  // steps finished today stay visible
  state.assignments.forEach(a => a.steps.forEach(s => {
    if(s.done && s.doneAt === today){ items.push({a, s}); used += s.min; }
  }));
  const queue = openAsg().filter(a => !isSkipped(a) && isActive(a) && !pulledToday(a)).sort((x,y) => {
    const dx = daysUntil(x.due) ?? 99, dy = daysUntil(y.due) ?? 99;
    return dx - dy || y.dread - x.dread;
  });
  for(const a of queue){
    if(used >= budget) break;
    const next = a.steps.filter(s => !s.done);
    if(!a.steps.length){ items.push({a, s:null}); continue; }
    const urgent = (daysUntil(a.due) ?? 99) <= 1;
    const cap = stepsPerDay(a);
    let took = a.steps.filter(s => s.doneAt === today).length;
    for(const s of next){
      if(took >= cap) break;
      if(used + s.min > budget && !(urgent && took === 0)) break;
      items.push({a, s}); used += s.min; took++;
    }
  }
  // "get ahead" picks are a bonus on top of the budget
  openAsg().filter(a => pulledToday(a) && !isSkipped(a)).forEach(a => {
    a.steps.filter(s => !s.done).slice(0, 2).forEach(s => items.push({a, s, bonus:true}));
  });
  return {items, used, budget, energy};
}

function renderComing(){
  const today = todayISO();
  const later = openAsg().filter(a => !isActive(a) && !isSkipped(a))
    .sort((x,y) => startsIn(x) - startsIn(y)).slice(0, 5);
  const el = $("coming"); el.hidden = !later.length;
  if(!later.length) return;
  const {items} = buildPlan();
  const free = !items.some(i => i.s && !i.s.done && !i.bonus);
  const dayName = n => { const d = new Date(); d.setDate(d.getDate()+n); return d.toLocaleDateString(undefined,{weekday:"short"}); };
  el.innerHTML = `<div class="coming-head">Coming up${free ? `<span>Plan done. Pull something forward if you feel like it.</span>` : ""}</div>` +
    later.map(a => {
      const n = daysUntil(a.due), st = startsIn(a);
      return `<div class="coming-row">${tagHTML(a.cls)}<span class="ct">${esc(a.title)}</span>
        <span class="cm">due ${n <= 6 ? dayName(n) : fmtDate(a.due)} · starts ${st === 1 ? "tomorrow" : dayName(st)}</span>
        ${free ? `<button class="go" data-act="pull" data-a="${a.id}">Get ahead</button>` : ""}</div>`;
    }).join("");
}

function renderSkipped(){
  const sk = openAsg().filter(isSkipped);
  const el = $("skipped"); el.hidden = !sk.length;
  el.innerHTML = sk.length ? `Not today: ${sk.map(a => `<span class="sk">${esc(a.title)} <button class="go" data-act="unskip" data-a="${a.id}">Bring back</button></span>`).join("")}` : "";
}
function renderPlan(){
  renderSkipped(); renderComing();
  const {items, used, budget, energy} = buildPlan();
  const doneMin = items.filter(i => i.s && i.s.done).reduce((n,i) => n + i.s.min, 0);
  $("planMeta").textContent = items.length ? `~${used} of ${budget} min` : "";
  $("budgetBar").style.width = Math.min(100, used ? doneMin / Math.max(used,1) * 100 : 0) + "%";
  const el = $("plan");
  if(!items.length){
    el.innerHTML = `<li class="empty" style="display:block">Nothing open. Add an assignment below and it will show up here as small steps.</li>`;
    $("enough").textContent = ""; return;
  }
  let firstOpen = true;
  el.innerHTML = items.map(({a, s, bonus}) => {
    if(!s) return `<li><span></span><div class="step-text"><span class="t">Break down “${esc(a.title)}”</span>
      <span class="sub">${tagHTML(a.cls)}<span>${esc(dueLabel(a).txt)}</span></span></div>
      <div class="right"><button class="go" data-act="breakdown" data-a="${a.id}">Break it down</button>${canSkip(a) ? `<button class="skip" data-act="skip" data-a="${a.id}" title="Not today">Not today</button>` : ""}</div></li>`;
    const starter = !s.done && !bonus && firstOpen; if(!s.done && !bonus) firstOpen = false;
    return `<li class="${s.done ? "done" : ""}">
      <button class="check" role="checkbox" aria-checked="${s.done}" aria-label="Mark step done" data-act="toggle" data-a="${a.id}" data-s="${s.id}"></button>
      <div class="step-text"><span class="t">${esc(s.text)}</span>
        <span class="sub">${tagHTML(a.cls)}<span>${esc(a.title)}</span>${starter ? `<span class="starter">START HERE</span>` : ""}${bonus ? `<span class="starter" style="color:var(--accent)">BONUS</span>` : ""}</span></div>
      <div class="right"><span class="mins">${s.min} min</span>${s.done ? "" : `<button class="go" data-act="focus" data-a="${a.id}" data-s="${s.id}">Focus</button>`}${!s.done && canSkip(a) ? `<button class="skip" data-act="skip" data-a="${a.id}" title="Skip this assignment today">Not today</button>` : ""}</div></li>`;
  }).join("");
  const left = items.filter(i => i.s && !i.s.done && !i.bonus).length;
  const inPlan = new Set(items.filter(i => i.s).map(i => i.s.id));
  const extra = openAsg().filter(a => isActive(a) && !isSkipped(a)).reduce((n,a) => n + a.steps.filter(s => !s.done && !inPlan.has(s.id)).length, 0);
  $("enough").textContent = left === 0
    ? "That's today's plan done. Anything else is a bonus. Rest counts too."
    : `This is enough for a ${["","low","steady","good"][energy||2]}-energy day.` + (extra > 0 ? ` The other ${extra} step${extra>1?"s":""} can wait for another day.` : "");
}

// ---------- nudge ----------
function renderNudge(){
  const today = todayISO();
  const open = openAsg();
  const over = open.filter(a => (daysUntil(a.due) ?? 1) < 0);
  const ugh = open.find(a => a.dread === 3 && (daysUntil(a.due) ?? 99) <= 5);
  const doneToday = state.assignments.reduce((n,a) => n + a.steps.filter(s => s.doneAt === today).length, 0);
  let html = "";
  if(state.checkin.date !== today){
    html = `<div class="callout"><span class="glyph">○</span><div><p>How much energy do you have today? Pick one above and the plan will fit itself to it.</p>
      <p class="small">On low days the plan gets shorter on purpose.</p></div></div>`;
  } else if(over.length){
    html = `<div class="callout warn"><span class="glyph">↺</span><div><p>${over.length === 1 ? `“${esc(over[0].title)}” is` : `${over.length} assignments are`} past due. That happens. Forgive yourself for it and pick one small step. Beating yourself up makes the next delay more likely, not less.</p>
      <p class="small">If late work is accepted, a short email to the instructor often helps more than waiting.</p></div></div>`;
  } else if(open.some(a => (a.skipCount || 0) >= 3 && !isSkipped(a))){
    const a = open.find(a => (a.skipCount || 0) >= 3 && !isSkipped(a));
    html = `<div class="callout"><span class="glyph">~</span><div><p>You've put off “${esc(a.title)}” a few times. That usually means the first step is too big or unclear, not that you're lazy. Try making it tinier, like just opening the file.</p>
      <p class="small"><button class="go" data-act="expand" data-a="${a.id}" style="padding-left:0">Edit its steps</button></p></div></div>`;
  } else if(ugh){
    html = `<div class="callout"><span class="glyph">~</span><div><p>“${esc(ugh.title)}” feels like an ugh task. You don't have to feel ready. Just do its first step for five minutes, then decide if you keep going.</p></div></div>`;
  } else if(doneToday){
    html = `<div class="callout"><span class="glyph">✓</span><div><p>${doneToday} step${doneToday>1?"s":""} done today. Momentum is real: starting is the hard part and you already did it.</p></div></div>`;
  }
  $("nudge").innerHTML = html;
}

// ---------- assignments ----------
function renderList(){
  const open = openAsg();
  const done = state.assignments.filter(a => a.done);
  $("asgMeta").textContent = `${open.length} open`;
  $("clearEx").hidden = !state.assignments.some(a => a.example);
  const groups = [["Overdue", a => (daysUntil(a.due) ?? 99) < 0, "overdue"],
    ["Due this week", a => { const n = daysUntil(a.due); return n !== null && n >= 0 && n <= 7; }, ""],
    ["Later", a => { const n = daysUntil(a.due); return n === null || n > 7; }, ""]];
  const sorted = open.slice().sort((x,y) => (daysUntil(x.due) ?? 999) - (daysUntil(y.due) ?? 999));
  let html = "";
  for(const [label, fn, c] of groups){
    const g = sorted.filter(fn); if(!g.length) continue;
    html += `<div class="group-label ${c}">${label} <span class="count">${g.length}</span></div>` + g.map(rowHTML).join("");
  }
  if(!open.length) html += `<p class="empty">No open assignments. Add one and it gets broken into small steps.</p>`;
  if(done.length){
    html += `<details style="margin-top:14px"><summary class="group-label" style="cursor:pointer;display:list-item">Done <span class="count">${done.length}</span></summary>${done.map(rowHTML).join("")}</details>`;
  }
  $("list").innerHTML = html;
}

function rowHTML(a){
  const d = dueLabel(a);
  const total = a.steps.length, fin = a.steps.filter(s => s.done).length;
  const isOpen = openId === a.id;
  return `<div class="asg">
    <div class="asg-row">
      <button class="check" role="checkbox" aria-checked="${a.done}" aria-label="Mark assignment done" data-act="asgDone" data-a="${a.id}"></button>
      <div style="min-width:0">
        <button class="asg-title" data-act="expand" data-a="${a.id}" aria-expanded="${isOpen}">${esc(a.title)}</button>
        <div class="step-text"><span class="sub">${tagHTML(a.cls)}${total ? `<span class="prog">${fin}/${total} steps</span>` : `<span class="prog">not broken down</span>`}${a.estimateMin ? `<span class="prog">~${fmtMin(a.estimateMin)}</span>` : ""}<span class="feel">feels ${feelWord(a.dread)}</span>${!a.done && !isActive(a) ? `<span class="prog">starts ${startsIn(a) === 1 ? "tomorrow" : (() => { const d = new Date(); d.setDate(d.getDate()+startsIn(a)); return d.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"}); })()}</span>` : ""}${a.example ? `<span class="ex">example</span>` : ""}</span></div>
      </div>
      <span class="due ${a.done ? "later" : d.cls}">${a.done ? "done" : esc(d.txt)}</span>
    </div>
    ${isOpen ? detailHTML(a) : ""}
  </div>`;
}

function detailHTML(a){
  const steps = a.steps.map(s => `<li class="${s.done ? "done" : ""}">
      <button class="check" role="checkbox" aria-checked="${s.done}" aria-label="Mark step done" data-act="toggle" data-a="${a.id}" data-s="${s.id}"></button>
      <input type="text" class="step-edit t" id="st-${s.id}" value="${esc(s.text)}" data-act="editStep" data-a="${a.id}" data-s="${s.id}" aria-label="Step">
      <span class="mins">${s.min}m</span>
      <button class="x" aria-label="Delete step" data-act="delStep" data-a="${a.id}" data-s="${s.id}">×</button></li>`).join("");
  const busy = a._busy;
  return `<div class="detail">
    ${busy ? `<p class="thinking">Breaking it into small steps…</p>` : ""}
    ${!busy && (a.size || a.estimateMin) ? `<p class="size">${sizeLine(a.size, a.estimateMin, a.sizeWhy)}</p>` : ""}
    <ul class="steps">${steps}</ul>
    <form class="field-row" data-act="addStep" data-a="${a.id}" style="margin-top:0">
      <input class="inp" id="ns-${a.id}" type="text" placeholder="Add a step (start with a verb)" style="flex:1;min-width:160px">
      <input class="inp" id="nm-${a.id}" type="number" min="1" max="120" value="15" aria-label="Minutes" style="width:72px">
      <button class="btn">Add</button>
    </form>
    <div class="grid2" style="margin-top:14px">
      <div><label class="lbl" for="ge-${a.id}">Good enough looks like</label>
        <textarea class="inp" id="ge-${a.id}" data-act="field" data-f="goodEnough" data-a="${a.id}" placeholder="When can you stop polishing?">${esc(a.goodEnough)}</textarea></div>
      <div><label class="lbl" for="no-${a.id}">Notes</label>
        <textarea class="inp" id="no-${a.id}" data-act="field" data-f="notes" data-a="${a.id}" placeholder="Rubric, length, links…">${esc(a.notes)}</textarea></div>
    </div>
    <div class="grid3" style="margin-top:10px">
      <div><label class="lbl" for="dd-${a.id}">Due</label><input class="inp" type="date" id="dd-${a.id}" value="${esc(a.due)}" data-act="field" data-f="due" data-a="${a.id}"></div>
      <div><label class="lbl" for="tt-${a.id}">Time</label><input class="inp" type="time" id="tt-${a.id}" value="${esc(a.time)}" data-act="field" data-f="time" data-a="${a.id}"></div>
      <div><label class="lbl" for="fe-${a.id}">Feels</label><select class="inp" id="fe-${a.id}" data-act="field" data-f="dread" data-a="${a.id}">
        ${[1,2,3].map(n => `<option value="${n}" ${a.dread==n?"selected":""}>${["","Fine","Meh","Ugh"][n]}</option>`).join("")}</select></div>
    </div>
    ${(a.source || (a.files && a.files.length)) ? `<details class="source"><summary>Original instructions${a.files && a.files.length ? ` · ${a.files.length} photo${a.files.length>1?"s":""}` : ""}</summary>
      ${a.source ? `<div class="txt">${esc(a.source)}</div>` : ""}
      ${a.files && a.files.length ? `<div class="photos" style="margin-top:8px">${a.files.map(f => `<a class="thumb" href="${esc(fileUrl(f))}" target="_blank" rel="noopener"><img src="${esc(fileUrl(f))}" alt="Assignment photo"></a>`).join("")}</div>` : ""}
    </details>` : ""}
    <div class="toolbar" style="margin-top:12px">
      <button class="btn" data-act="breakdown" data-a="${a.id}" ${busy?"disabled":""}>${a.steps.length ? "Redo breakdown" : "Break it down"}</button>
      <button class="btn ghost" data-act="delAsg" data-a="${a.id}">Delete assignment</button>
    </div>
  </div>`;
}

function renderEnergy(){
  const today = todayISO();
  const e = state.checkin.date === today ? state.checkin.energy : 0;
  $("energy").innerHTML = [[1,"Low"],[2,"Okay"],[3,"Good"]].map(([n,l]) =>
    `<button class="chip" aria-pressed="${e===n}" data-act="energy" data-n="${n}">${l}</button>`).join("");
}
function renderDump(){
  $("dump").innerHTML = state.dump.map(d => `<li><span>${esc(d.text)}</span><button class="x" aria-label="Remove" data-act="delDump" data-id="${d.id}">×</button></li>`).join("");
}
function render(){
  renderIcon();
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  renderEnergy(); renderNudge(); renderPlan(); renderList(); renderDump();
}

// ---------- breakdown ----------
function fallbackSteps(a){
  const t = (a.title + " " + (a.notes||"") + " " + (a.source||"")).toLowerCase();
  let s;
  if(/exam|quiz|test|midterm|final/.test(t)) s = [["Open your notes and list the topics covered",3],["Mark each topic: know it / shaky / no idea",10],["Make flashcards for the shaky topics",20],["Do practice questions on the hardest topic",25],["Quiz yourself on everything once",20]];
  else if(/essay|paper|write|draft|report|proposal|review/.test(t)) s = [["Open a blank doc and paste in the prompt",2],["Brain-dump everything you know, no editing",15],["Write a rough thesis or main point",10],["Outline 3–4 sections in bullets",15],["Draft the easiest section first",25],["Draft the rest, ugly is fine",30]];
  else if(/read|chapter|canto|article/.test(t)) s = [["Open the reading and look at the headings only",2],["Read the first section and jot 3 notes",20],["Read the next section and jot 3 notes",20],["Write a 3-sentence summary",10]];
  else s = [["Open everything you need for it",2],["Write down what 'done' means for this",5],["Do the first concrete piece",20],["Do the next piece",20],["Check it against the instructions",10]];
  return s;
}

async function breakdown(id){
  const a = state.assignments.find(x => x.id === id); if(!a) return;
  openId = id; a._busy = true; claudeErr = ""; render();
  let steps = null, good = null;
  if(sample){
    try {
      const n = daysUntil(a.due);
      const prompt = `You help a university psychology student who wants support with procrastination, ADHD-style focus and perfectionism. Break this assignment into small, concrete steps.

Assignment: ${a.title}
Class: ${a.cls || "unknown"}
Due: ${a.due ? a.due + (n !== null ? ` (${n} days from today)` : "") : "no date"}
How it feels to start: ${feelWord(a.dread)}
Student notes: ${a.notes || "none"}
Original instructions: ${(a.source || "none").slice(0, 6000)}

${SIZE_RULES}

Rules for the steps:
- In order. Each starts with a verb and names one physical action (open, write, list, read pages, email).
- Step 1 is a 2-minute starter that is almost too easy to refuse.
- If the task feels "ugh", keep steps under 20 minutes.
- Treat drafts as rough first passes; editing comes later.
- Only "large" work ends with a step that checks it against the rubric or instructions; small and medium work has no separate checking or proofreading step, because submitting is the finish line.
- Also write "goodEnough": one short sentence describing a "done is better than perfect" finish line. For small work make it blunt, like "Submitted counts as done." or "Any honest answer gets the points."
Return only JSON: {"size":"small|medium|large","estimateMin":90,"sizeWhy":"...","steps":[{"text":"...","min":10}],"goodEnough":"..."}`;
      const r = await sample.json(prompt, {modelTier:"quick"});
      if(r && Array.isArray(r.steps) && r.steps.length){
        if(r.size) a.size = String(r.size); if(Number(r.estimateMin)) a.estimateMin = Math.round(Number(r.estimateMin)); if(r.sizeWhy) a.sizeWhy = String(r.sizeWhy).slice(0,160);
        steps = r.steps.slice(0, maxSteps(r.size)).map(x => [String(x.text||"").slice(0,140), Math.max(2, Math.min(60, Number(x.min)||15))]).filter(x => x[0]);
        good = typeof r.goodEnough === "string" ? r.goodEnough.slice(0,200) : null;
      }
    } catch(e){
      noteClaudeError(e);
    }
  }
  if(!steps || !steps.length){ steps = fallbackSteps(a); toast(sample ? (claudeErr || "Used a standard breakdown. Edit the steps to fit.") : "Used a standard breakdown. Add a Claude API key in Settings for tailored steps."); }
  const keep = a.steps.filter(s => s.done);
  a.steps = keep.concat(steps.map(([t,m]) => ({id:uid(), text:t, min:m, done:false, doneAt:null})));
  if(good && !a.goodEnough) a.goodEnough = good;
  delete a._busy; save(); render();
}

// ---------- focus timer ----------
let focus = null, tick = null;
function startFocus(aId, sId){
  const a = state.assignments.find(x => x.id === aId); const s = a && a.steps.find(x => x.id === sId);
  if(!s) return;
  const mins = Math.min(s.min, s.min > 25 ? 25 : s.min) || 15;
  const five = a.dread === 3;
  focus = {aId, sId, end: Date.now() + (five ? 5 : Math.max(mins, 5)) * 60000, paused:null, five};
  $("focusKind").textContent = five ? "Just 5 minutes on" : "Focusing on";
  $("focusText").textContent = s.text;
  $("focus").hidden = false; $("fPause").textContent = "Pause";
  clearInterval(tick); tick = setInterval(updateClock, 500); updateClock();
}
function updateClock(){
  if(!focus) return;
  const left = Math.max(0, (focus.paused ?? focus.end) - (focus.paused ? 0 : Date.now()));
  const ms = focus.paused ? focus.paused : left;
  const sec = Math.ceil(ms/1000);
  $("clock").textContent = `${pad(Math.floor(sec/60))}:${pad(sec%60)}`;
  if(!focus.paused && left <= 0){
    clearInterval(tick);
    $("clock").textContent = "00:00";
    $("focusKind").textContent = focus.five ? "Five minutes done. Keep going or stop, both are fine." : "Time's up. Take a 5-minute break.";
  }
}
function stopFocus(){ focus = null; clearInterval(tick); $("focus").hidden = true; }

// ---------- events ----------
function toggleStep(aId, sId){
  const a = state.assignments.find(x => x.id === aId); const s = a && a.steps.find(x => x.id === sId); if(!s) return;
  s.done = !s.done; s.doneAt = s.done ? todayISO() : null;
  if(s.done) a.skipCount = 0;
  if(s.done){
    const left = a.steps.filter(x => !x.done).length;
    toast(left ? `Nice. ${left} step${left>1?"s":""} left on this one.` : "Every step is done. Mark the assignment done when it's handed in.");
  }
  save(); render();
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if(!b || b.tagName === "FORM" || b.tagName === "INPUT" || b.tagName === "TEXTAREA" || b.tagName === "SELECT") return;
  const {act, a: aId, s: sId} = b.dataset;
  const a = aId && state.assignments.find(x => x.id === aId);
  switch(act){
    case "toggle": toggleStep(aId, sId); break;
    case "focus": startFocus(aId, sId); break;
    case "skip": if(a){
      a.skippedOn = todayISO(); a.skipCount = (a.skipCount || 0) + 1;
      const n = daysUntil(a.due);
      toast(n === 1 ? "Skipped for today. It's due tomorrow, so it'll be first in tomorrow's plan." : "Skipped for today. It'll be back tomorrow. Resting on purpose is part of the plan.");
      save(); render(); } break;
    case "pull": if(a){ a.pulledOn = todayISO(); toast("Pulled forward as a bonus. Stop whenever you want."); save(); render(); } break;
    case "unskip": if(a){ a.skippedOn = ""; a.skipCount = Math.max(0, (a.skipCount || 1) - 1); save(); render(); } break;
    case "breakdown": breakdown(aId); break;
    case "expand": openId = openId === aId ? null : aId; renderList(); break;
    case "asgDone": if(a){ a.done = !a.done; if(a.done) toast("Handed in. That's a real win."); save(); render(); } break;
    case "delStep": if(a){ a.steps = a.steps.filter(s => s.id !== sId); save(); render(); } break;
    case "delAsg": if(a){
      if(b.dataset.confirm !== "1"){ b.dataset.confirm = "1"; b.textContent = "Click again to delete"; return; }
      if(assets && a.files) a.files.forEach(f => assets.delete(f.id).catch(() => {}));
      state.assignments = state.assignments.filter(x => x.id !== aId); openId = null; save(); render(); } break;
    case "energy": state.checkin = {date: todayISO(), energy: Number(b.dataset.n)}; save(); render(); break;
    case "delDump": state.dump = state.dump.filter(d => d.id !== b.dataset.id); save(); renderDump(); break;
  }
});
document.addEventListener("change", e => {
  const el = e.target; const {act, a: aId, s: sId, f} = el.dataset || {};
  const a = aId && state.assignments.find(x => x.id === aId); if(!a) return;
  if(act === "editStep"){ const s = a.steps.find(x => x.id === sId); if(s){ s.text = el.value.trim() || s.text; save(); renderPlan(); } }
  if(act === "field"){ a[f] = f === "dread" ? Number(el.value) : el.value; save(); renderNudge(); renderPlan(); if(f === "due" || f === "dread" || f === "time") renderList(); }
});
document.addEventListener("submit", e => {
  const f = e.target;
  if(f.dataset.act === "addStep"){
    e.preventDefault();
    const a = state.assignments.find(x => x.id === f.dataset.a); if(!a) return;
    const t = $("ns-"+a.id).value.trim(); if(!t) return;
    const m = Math.max(1, Math.min(120, Number($("nm-"+a.id).value) || 15));
    a.steps.push({id:uid(), text:t, min:m, done:false, doneAt:null}); save(); render();
    const n = $("ns-"+a.id); if(n) n.focus();
  }
});

// add form
let pickCls = "", pickColor = COLORS[0][1];
function renderClsPick(){
  $("clsPick").innerHTML = state.classes.map(c => `<button type="button" aria-pressed="${pickCls===c.name}" data-c="${esc(c.name)}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join("")
    + `<button type="button" aria-pressed="${pickCls==="__new"}" data-c="__new">+ new class</button>`;
  $("newCls").hidden = pickCls !== "__new";
  $("swatches").innerHTML = COLORS.map(([n,c]) => `<button type="button" title="${n}" aria-label="${n}" aria-pressed="${pickColor===c}" data-col="${c}" style="background:${c}"></button>`).join("");
}
$("clsPick").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; pickCls = b.dataset.c; renderClsPick(); });
$("swatches").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; pickColor = b.dataset.col; renderClsPick(); });
// ----- step 1: describe + photos -----
let pending = {photos:[]};   // photos: [{id, blob, url}]
let reviewSteps = [], reviewSize = {};
function fmtMin(m){ if(!m) return ""; if(m < 60) return `${m} min`; const h = m/60; return `${Math.round(h*2)/2} h`.replace(".5 h","½ h"); }
function sizeLine(size, est, why){
  if(!size && !est) return "";
  const label = {small:"Small",medium:"Medium",large:"Big"}[size] || "";
  return `${label}${label && est ? " · " : ""}${est ? "about " + fmtMin(est) + " of work" : ""}${why ? ". " + esc(why) : ""}`;
}
function renderSize(){
  const el = $("rSize"); const t = sizeLine(reviewSize.size, reviewSize.estimateMin, reviewSize.sizeWhy);
  el.innerHTML = t; el.hidden = !t;
}
function resetAdd(){
  pending.photos.forEach(p => URL.revokeObjectURL(p.url));
  pending = {photos:[]};
  $("fDesc").value = ""; $("photos").innerHTML = ""; $("readStatus").hidden = true; note("");
  $("readBtn").disabled = false;
}
function renderPhotos(){
  $("photos").innerHTML = pending.photos.map(p => `<div class="thumb"><img src="${p.url}" alt="Assignment photo"><button type="button" aria-label="Remove photo" data-rm="${p.id}">×</button></div>`).join("");
}
function shrink(file){
  // downsize big phone photos so they upload fast and stay readable
  return new Promise(res => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob(b => res(b || file), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(u); res(file); };
    img.src = u;
  });
}
function canvasBlob(c){ return new Promise(r => c.toBlob(b => r(b), "image/jpeg", 0.85)); }
async function readPdf(file){
  // returns {text, pages:[Blob]} — text when the PDF has it, page images when it's a scan
  const lib = window.pdfjsLib; if(!lib) return {text:"", pages:[]};
  try { lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch(e){}
  const pdf = await lib.getDocument({data: await file.arrayBuffer()}).promise;
  let text = "";
  for(let i = 1; i <= Math.min(pdf.numPages, 15); i++){
    const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
    text += tc.items.map(t => t.str).join(" ") + "\n";
  }
  text = text.replace(/[ \t]+/g, " ").trim();
  const pages = [];
  if(text.length < 40){
    for(let i = 1; i <= Math.min(pdf.numPages, 3); i++){
      const pg = await pdf.getPage(i); const vp = pg.getViewport({scale:1.6});
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await pg.render({canvasContext:c.getContext("2d"), viewport:vp}).promise;
      const b = await canvasBlob(c); if(b) pages.push(b);
    }
  }
  return {text, pages};
}
function note(msg){ const n = $("fileNote"); n.textContent = msg; n.hidden = !msg; }
async function addFiles(list){
  const files = [...list]; if(!files.length) return;
  const added = [], skipped = [];
  for(const f of files){
    const name = f.name || "file";
    try {
      if(f.type.startsWith("image/")){
        if(pending.photos.length >= 6){ skipped.push(name); continue; }
        const blob = await shrink(f); pending.photos.push({id:uid(), blob, url:URL.createObjectURL(blob)}); added.push(name);
      } else if(f.type === "application/pdf" || /\.pdf$/i.test(name)){
        note(`Reading ${name}…`);
        const {text, pages} = await readPdf(f);
        if(text){ appendText(name, text.slice(0, 12000)); added.push(name); }
        else if(pages.length){ pages.slice(0, 6 - pending.photos.length).forEach(b => pending.photos.push({id:uid(), blob:b, url:URL.createObjectURL(b)})); added.push(name + " (as images)"); }
        else skipped.push(name);
      } else if(f.type.startsWith("text/") || /\.(txt|md)$/i.test(name)){
        appendText(name, (await f.text()).slice(0, 12000)); added.push(name);
      } else skipped.push(name);
    } catch(e){ skipped.push(name); }
  }
  renderPhotos();
  let msg = added.length ? `Added ${added.join(", ")}.` : "";
  if(skipped.length) msg += ` Couldn't use ${skipped.join(", ")}. Images, PDFs and text files work; for Word files, paste the text instead.`;
  note(msg.trim());
}
function appendText(name, text){
  const box = $("fDesc");
  box.value = (box.value.trim() ? box.value.trim() + "\n\n" : "") + `[From ${name}]\n` + text;
}
$("drop").addEventListener("click", () => $("fPhotos").click());
$("drop").addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); $("fPhotos").click(); } });
$("fPhotos").addEventListener("change", async e => { await addFiles(e.target.files); e.target.value = ""; });

// drag and drop: onto the box, or anywhere on the page (opens the add form)
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
document.addEventListener("dragenter", e => {
  if(!hasFiles(e)) return; e.preventDefault(); dragDepth++;
  if($("form").hidden) $("pageDrop").hidden = false; else $("drop").classList.add("over");
});
document.addEventListener("dragover", e => { if(hasFiles(e)) e.preventDefault(); });
document.addEventListener("dragleave", e => {
  if(!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1);
  if(!dragDepth){ $("pageDrop").hidden = true; $("drop").classList.remove("over"); }
});
document.addEventListener("drop", async e => {
  if(!hasFiles(e)) return; e.preventDefault(); dragDepth = 0;
  $("pageDrop").hidden = true; $("drop").classList.remove("over");
  if($("form").hidden){ resetAdd(); $("review").hidden = true; $("form").hidden = false; }
  await addFiles(e.dataTransfer.files);
  $("form").scrollIntoView({behavior:"smooth", block:"center"});
});
$("photos").addEventListener("click", e => {
  const id = e.target.dataset && e.target.dataset.rm; if(!id) return;
  const p = pending.photos.find(x => x.id === id); if(p) URL.revokeObjectURL(p.url);
  pending.photos = pending.photos.filter(x => x.id !== id); renderPhotos();
});
// pasting a screenshot straight into the box also works
$("fDesc").addEventListener("paste", async e => {
  const items = [...(e.clipboardData?.files || [])];
  if(!items.length) return;
  e.preventDefault();
  await addFiles(items);
});
$("addBtn").addEventListener("click", () => { resetAdd(); $("review").hidden = true; $("form").hidden = false; $("fDesc").focus(); });
$("cancelBtn").addEventListener("click", () => { resetAdd(); $("form").hidden = true; });

const SIZE_RULES = `First judge how big the work really is, from the actual requirements (length, number of sources, how much of the grade it is, how much reading or studying it needs). Be realistic for a college junior, not optimistic.
- "small" (under about 1 hour total, e.g. a reading quiz, a discussion post, a short worksheet): 2 to 3 steps, never more than 3. The 2-minute starter counts as one of them.
- "medium" (about 1 to 3 hours, e.g. a short response paper, a problem set, a lab write-up): 4 to 5 steps, never more than 5.
- "large" (over about 3 hours or a big share of the grade, e.g. a research paper, a project, studying for a midterm or final): 6 to 12 steps, and spread them so no single step is over 45 minutes.`;
async function readAssignment(text, photos){
  const now = new Date();
  const classList = state.classes.map(c => c.name).join(", ");
  let canSeeImages = false;
  if(sample && photos.length){ try { canSeeImages = !!(await sample.limits()).images; } catch(e){} }
  if(sample){
    const prompt = `You help a university psychology student who struggles with procrastination, ADHD-style focus and perfectionism. Read the assignment below${photos.length && canSeeImages ? " and in the attached image(s)" : ""} and set it up in their planner.

Today is ${now.toLocaleDateString("en-US",{weekday:"long"})} ${todayISO()}.
Their classes: ${classList || "none yet"}.

What they wrote:
"""
${text || "(nothing, see the images)"}
"""

Return only JSON with these keys:
- "title": short assignment name, max 60 characters.
- "cls": one of her classes if it clearly matches, else the course name you see (e.g. "Psych 202"), else "".
- "due": "YYYY-MM-DD" or "" if no date is given. Resolve words like "next Friday" from today's date.
- "time": "HH:MM" 24-hour or "".
- "dueConfidence": "sure", "guessed" or "none".
- "goodEnough": one sentence describing a done-is-better-than-perfect finish line, based on the actual requirements. For small work make it blunt, like "Submitted counts as done." or "Any honest answer gets the points."
- "size": "small", "medium" or "large" (rules below).
- "estimateMin": your realistic estimate of the total minutes of work.
- "sizeWhy": one short sentence on why, naming the requirement that drives the time (e.g. "8 pages with 6 peer-reviewed sources").
- "steps": the steps in order, each {"text": "...", "min": number}. The minutes should add up to roughly estimateMin. Each step starts with a verb and names one concrete action. Step 1 is a 2-minute starter that is almost too easy to refuse. Use the real requirements (length, sources, rubric items). Drafts are rough first passes. Only "large" work ends with a step that checks it against the rubric or instructions; small and medium work has no separate checking or proofreading step, because submitting is the finish line.

${SIZE_RULES}`;
    try {
      const opts = {modelTier:"default"};
      if(canSeeImages) opts.images = photos.map(p => p.blob);
      const r = await sample.json(prompt, opts);
      if(r && typeof r === "object") return {r: withHints(r), imagesSeen: canSeeImages};
    } catch(e){
      noteClaudeError(e);
    }
  }
  // fallback without Claude
  const first = (text.split("\n").find(l => l.trim()) || "New assignment").trim().slice(0, 60);
  const fake = {title:first, notes:text};
  return {r:withHints({title:first, cls:"", due:"", time:"", dueConfidence:"none", goodEnough:"", steps:fallbackSteps(fake).map(([t,m]) => ({text:t, min:m}))}), fallback:true};
}
// details the extension read straight off the page (MyCourses) fill whatever Claude didn't
function withHints(r){
  const h = pending.hints; if(!h) return r;
  if(h.title && (!r.title || !sample)) r.title = h.title;
  if(h.cls && !r.cls) r.cls = h.cls;
  if(h.due && !/^\d{4}-\d{2}-\d{2}$/.test(r.due || "")){ r.due = h.due; r.dueConfidence = "sure"; if(h.time) r.time = h.time; }
  return r;
}

$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("fDesc").value.trim();
  if(!text && !pending.photos.length){ $("fDesc").focus(); return; }
  $("readBtn").disabled = true;
  $("readStatus").hidden = false;
  $("readStatus").textContent = pending.photos.length ? "Reading the text and photos… this can take up to a minute." : "Reading it…";
  claudeErr = "";
  const {r, fallback, imagesSeen} = await readAssignment(text, pending.photos);
  $("readBtn").disabled = false; $("readStatus").hidden = true;
  if(fallback && pending.hints) toast(claudeErr || "Filled in from the course page. Add a Claude API key in Settings for steps that fit this assignment.");
  else if(fallback) toast(claudeErr || (pending.photos.length ? "Add a Claude API key in Settings to have photos read. Fill in the details below for now." : "Add a Claude API key in Settings to have this read automatically. Fill in the details below for now."));
  else if(pending.photos.length && !imagesSeen) toast("Photos couldn't be read in this view, so only the text was used.");
  fillReview(r);
});

// ----- step 2: review -----
function fillReview(r){
  $("rTitle").value = String(r.title || "").slice(0, 80);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(r.due || "") ? r.due : "";
  const time = /^\d{2}:\d{2}$/.test(r.time || "") ? r.time : "";
  $("rDue").value = due; $("rTime").value = time; $("rFeel").value = "2";
  $("rGood").value = String(r.goodEnough || "");
  const flag = $("dueFlag");
  if(!due){ flag.hidden = false; flag.textContent = "No due date found. Add one so it shows up in your plan at the right time."; }
  else if(r.dueConfidence === "guessed"){ flag.hidden = false; flag.textContent = `I worked this out as ${fmtDate(due)}. Double-check it.`; }
  else flag.hidden = true;
  const c = String(r.cls || "").trim();
  const match = state.classes.find(x => x.name.toLowerCase() === c.toLowerCase());
  if(match) pickCls = match.name;
  else if(c){ pickCls = "__new"; $("fNewCls").value = c; pickColor = COLORS[state.classes.length % COLORS.length][1]; }
  else pickCls = "";
  renderClsPick();
  reviewSize = {size: ["small","medium","large"].includes(r.size) ? r.size : "", estimateMin: Math.round(Number(r.estimateMin) || 0), sizeWhy: String(r.sizeWhy || "").slice(0,160)};
  renderSize();
  reviewSteps = (Array.isArray(r.steps) ? r.steps : []).slice(0, maxSteps(reviewSize.size))
    .map(s => ({id:uid(), text:String(s.text || "").slice(0, 140), min:Math.max(2, Math.min(60, Number(s.min) || 15))}))
    .filter(s => s.text);
  renderReviewSteps();
  $("form").hidden = true; $("review").hidden = false; $("rTitle").focus();
}
function renderReviewSteps(){
  $("rSteps").innerHTML = reviewSteps.map(s => `<li>
    <input class="inp" type="text" id="rs-${s.id}" value="${esc(s.text)}" data-rs="${s.id}" data-k="text" aria-label="Step">
    <input class="inp" type="number" id="rm-${s.id}" min="1" max="120" value="${s.min}" data-rs="${s.id}" data-k="min" aria-label="Minutes">
    <button class="x" type="button" aria-label="Remove step" data-rsx="${s.id}">×</button></li>`).join("");
}
$("rSteps").addEventListener("input", e => {
  const s = reviewSteps.find(x => x.id === e.target.dataset.rs); if(!s) return;
  if(e.target.dataset.k === "min") s.min = Math.max(1, Math.min(120, Number(e.target.value) || 15)); else s.text = e.target.value;
});
$("rSteps").addEventListener("click", e => {
  const id = e.target.dataset && e.target.dataset.rsx; if(!id) return;
  reviewSteps = reviewSteps.filter(x => x.id !== id); renderReviewSteps();
});
$("rAddStep").addEventListener("click", () => {
  const s = {id:uid(), text:"", min:15}; reviewSteps.push(s); renderReviewSteps(); $("rs-"+s.id).focus();
});
$("backBtn").addEventListener("click", () => { $("review").hidden = true; $("form").hidden = false; });

$("review").addEventListener("submit", async e => {
  e.preventDefault();
  const title = $("rTitle").value.trim(); if(!title){ $("rTitle").focus(); return; }
  let c = pickCls === "__new" ? $("fNewCls").value.trim() : pickCls;
  if(pickCls === "__new" && c && !state.classes.some(x => x.name === c)) state.classes.push({name:c, color:pickColor});
  $("saveBtn").disabled = true;
  // keep the photos with the assignment when uploads are available here
  const files = [];
  if(pending.photos.length){
    if(assets){
      $("saveBtn").textContent = "Saving photos…";
      for(const p of pending.photos){
        try { const up = await assets.upload(p.blob); files.push({id:up.id, url:up.url}); } catch(err){}
      }
      if(files.length < pending.photos.length) toast("Some photos couldn't be saved. The assignment is saved without them.");
    }
  }
  const a = {id:uid(), title, cls:c, due:$("rDue").value, time:$("rTime").value, dread:Number($("rFeel").value),
    goodEnough:$("rGood").value.trim(), notes:"", size:reviewSize.size || "", estimateMin:reviewSize.estimateMin || 0, sizeWhy:reviewSize.sizeWhy || "", source:$("fDesc").value.trim().slice(0, 15000), files,
    done:false, created:Date.now(),
    steps:reviewSteps.filter(s => s.text.trim()).map(s => ({id:uid(), text:s.text.trim(), min:s.min, done:false, doneAt:null}))};
  state.assignments.push(a);
  $("saveBtn").disabled = false; $("saveBtn").textContent = "Save assignment";
  $("review").hidden = true; resetAdd(); openId = a.id;
  save(); render();
  toast(a.steps.length ? "Saved. Its first step is in today's plan if it's due soon." : "Saved.");
});
$("clearEx").addEventListener("click", () => { state.assignments = state.assignments.filter(a => !a.example); state.examplesCleared = true; save(); render(); });
$("dumpForm").addEventListener("submit", e => {
  e.preventDefault(); const v = $("dumpIn").value.trim(); if(!v) return;
  state.dump.unshift({id:uid(), text:v}); $("dumpIn").value = ""; save(); renderDump();
});
$("fPause").addEventListener("click", () => {
  if(!focus) return;
  if(focus.paused){ focus.end = Date.now() + focus.paused; focus.paused = null; $("fPause").textContent = "Pause"; tick = setInterval(updateClock, 500); }
  else { focus.paused = Math.max(0, focus.end - Date.now()); clearInterval(tick); $("fPause").textContent = "Resume"; }
  updateClock();
});
$("fDone").addEventListener("click", () => { if(!focus) return; const {aId, sId} = focus; stopFocus(); const s = state.assignments.find(x=>x.id===aId)?.steps.find(x=>x.id===sId); if(s && !s.done) toggleStep(aId, sId); });
$("fStop").addEventListener("click", stopFocus);


// ---------- page icon ----------
const EMOJI = ["📚","📝","✏️","📖","🎓","🧠","💡","☕️","🍵","🌷","🌸","🌼","🍓","🍒","🍋","🫐","✨","⭐️","🌙","☁️","🌈","🦋","🐝","🐢","🐱","🐰","🦊","🐻‍❄️","🎀","💌","🕯️","🫶"];
function renderIcon(){
  const b = $("iconBtn"); const ic = state.icon ?? "📚";
  b.textContent = ic || "+ Add icon"; b.classList.toggle("empty", !ic);
  $("pickerGrid").innerHTML = EMOJI.map(e => `<button type="button" aria-label="${e}" aria-pressed="${e===ic}" data-emoji="${e}">${e}</button>`).join("");
}
function closePicker(){ $("picker").hidden = true; $("iconBtn").setAttribute("aria-expanded","false"); }
$("iconBtn").addEventListener("click", e => {
  e.stopPropagation();
  const open = $("picker").hidden; $("picker").hidden = !open; $("iconBtn").setAttribute("aria-expanded", String(open));
});
$("picker").addEventListener("click", e => {
  e.stopPropagation();
  const em = e.target.closest("[data-emoji]"); if(!em) return;
  state.icon = em.dataset.emoji; save(); renderIcon(); closePicker();
});
$("iconForm").addEventListener("submit", e => {
  e.preventDefault(); const v = $("iconIn").value.trim(); if(!v) return;
  // keep just the first emoji or character cluster
  let first = v;
  try { first = [...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(v)][0].segment; } catch(err){ first = [...v][0]; }
  state.icon = first; $("iconIn").value = ""; save(); renderIcon(); closePicker();
});
$("iconNone").addEventListener("click", e => { e.stopPropagation(); state.icon = ""; save(); renderIcon(); closePicker(); });
document.addEventListener("click", e => { if(!$("picker").hidden && !e.target.closest(".icon-wrap")) closePicker(); });
document.addEventListener("keydown", e => { if(e.key === "Escape") closePicker(); });

// ---------- boot ----------
state = loadLocal() || fresh();
state.assignments.forEach(a => delete a._busy);
render();

// re-render at midnight / when coming back to the tab
document.addEventListener("visibilitychange", () => { if(!document.hidden) render(); });

// ---------- local runtime: Claude key, photos, backup ----------
sample = NextStep.makeSample();
assets = NextStep.assets;
assets.load(state.assignments.flatMap(a => (a.files || []).map(f => f.id))).then(() => { if(openId) renderList(); });

$("apiKey").value = NextStep.getKey() ? "••••••••••••" : "";
$("saveKey").addEventListener("click", () => {
  const v = $("apiKey").value.trim();
  if(!v || v.startsWith("•")) { $("apiKey").focus(); return; }
  NextStep.setKey(v); sample = NextStep.makeSample();
  $("apiKey").value = "••••••••••••"; toast("Key saved on this device.");
});
$("clearKey").addEventListener("click", () => { NextStep.setKey(""); sample = null; $("apiKey").value = ""; toast("Key removed."); });
$("apiKey").addEventListener("focus", e => { if(e.target.value.startsWith("•")) e.target.value = ""; });

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `next-step-backup-${todayISO()}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  try {
    const d = JSON.parse(await f.text());
    if(!d || !Array.isArray(d.assignments) || !Array.isArray(d.classes)) throw new Error("not a backup");
    d.dump = Array.isArray(d.dump) ? d.dump : []; d.checkin = d.checkin || {date:"", energy:0};
    state = d; state.assignments.forEach(a => delete a._busy); openId = null; save(); render();
    toast("Backup imported.");
  } catch(err){ toast("That file isn't a Next Step backup."); }
});

// other windows / the extension side panel: pick up changes made elsewhere
addEventListener("storage", e => {
  if(e.key !== LS || !e.newValue) return;
  try { state = JSON.parse(e.newValue); render(); } catch(err){}
});

// text sent from the browser extension (right-click menu, MyCourses card)
function openWithText(t){
  const hints = t && typeof t === "object" ? t.hints : null;
  const text = t && typeof t === "object" ? t.text : t;
  resetAdd(); $("review").hidden = true; $("form").hidden = false;
  $("fDesc").value = String(text || "").slice(0, 12000);
  $("form").scrollIntoView({block:"center"}); $("fDesc").focus();
  // came from a course page with the details already read: go straight to the review step
  if(hints){ pending.hints = hints; $("form").requestSubmit(); }
}
(async () => {
  try {
    if(!(window.chrome && chrome.storage && chrome.storage.local)) return;
    const take = async () => {
      const {pendingText} = await chrome.storage.local.get("pendingText");
      if(!pendingText) return;
      await chrome.storage.local.remove("pendingText");
      openWithText(pendingText);
    };
    await take();
    chrome.storage.onChanged.addListener((ch, area) => { if(area === "local" && ch.pendingText && ch.pendingText.newValue) take(); });
  } catch(e){}
})();
// when the hosted app runs inside the extension's side panel, the panel hands text over by postMessage
if(window.parent !== window){
  addEventListener("message", e => {
    if(e.source !== window.parent || !/^chrome-extension:\/\//.test(e.origin)) return;
    if(e.data && e.data.type === "nextstep-add" && e.data.text) openWithText(e.data.text);
  });
  window.parent.postMessage({type:"nextstep-ready"}, "*");
}
})();
