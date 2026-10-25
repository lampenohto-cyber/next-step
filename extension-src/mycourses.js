// On a MyCourses (Moodle) assignment page, offer to add it to Next Step.
// Remembers per page whether you added or dismissed it, and stays quiet once it's submitted.
(() => {
"use strict";
const KINDS = /\/mod\/(assign|quiz|workshop|turnitintooltwo|lesson|questionnaire|h5pactivity|forum|lti)\/view\.php/;
if(!KINDS.test(location.pathname)) return;

const id = new URLSearchParams(location.search).get("id");
const pageKey = location.origin + location.pathname + (id ? "?id=" + id : "");
const text = el => (el ? el.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
const q = s => document.querySelector(s);

function read(){
  const title = text(q(".page-header-headings h1, #page-header h1, [role=main] h2")) ||
    document.title.split("|")[0].split(":").pop().trim();
  const crumb = [...document.querySelectorAll(".breadcrumb a, nav[aria-label] ol a")].find(a => /\/course\/view\.php/.test(a.href));
  const course = crumb ? text(crumb) : "";
  const dates = text(q('[data-region="activity-dates"], .activity-dates, .description .activity-dates'));
  const intro = text(q(".activity-description, #intro, [role=main] .box.generalbox"));
  const status = text(q(".submissionstatustable, .submissionsummarytable, [data-region='submission-status']"));
  return {title, course, dates, intro, status, when: findDue(dates, status)};
}

const isSubmitted = s => /submitted for grading|palautettu arvioitavaksi|l(ä|a)hetetty arvioitavaksi|inskick(ad|at) för bedömning/i.test(s);

// ---------- dates, in English, Finnish and Swedish Moodle ----------
// Finnish stems come first so "marraskuuta" isn't read as March.
const MONTHS = [["tammi",0],["helmi",1],["maalis",2],["huhti",3],["touko",4],["kesä",5],["heinä",6],["elo",7],["syys",8],["loka",9],["marras",10],["joulu",11],
  ["jan",0],["feb",1],["mar",2],["apr",3],["may",4],["maj",4],["jun",5],["jul",6],["aug",7],["sep",8],["oct",9],["okt",9],["nov",10],["dec",11]];
const OPENS = /^\s*(opened|opens|allow submissions|avautu|avattu|alkaa|palautukset alkaen|öppna|öppnade|öppnas|tillåt)/i;
const DUE = /(due|deadline|closes|closed|cut-?off|määrä|sulkeutu|suljettu|viimeinen|förfallo|sista|stäng|inlämningsdatum)/i;
const pad = n => String(n).padStart(2, "0");
function parseDate(line){
  let y, m, d, rest;
  let x = line.match(/(\d{1,2})\.?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
  if(x){
    const word = x[2].toLowerCase(); const hit = MONTHS.find(([p]) => word.startsWith(p));
    if(hit){ d = +x[1]; m = hit[1]; y = +x[3]; rest = line.slice(x.index + x[0].length); }
  }
  if(y === undefined && (x = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/))){ d = +x[1]; m = +x[2] - 1; y = +x[3]; rest = line.slice(x.index + x[0].length); }
  if(y === undefined && (x = line.match(/(\d{4})-(\d{2})-(\d{2})/))){ y = +x[1]; m = +x[2] - 1; d = +x[3]; rest = line.slice(x.index + x[0].length); }
  if(y === undefined || m < 0 || m > 11 || d < 1 || d > 31) return null;
  let time = "";
  const t = rest.match(/(\d{1,2})[:.](\d{2})\s*(AM|PM)?/i);
  if(t){ let h = +t[1]; const ap = (t[3] || "").toUpperCase(); if(ap === "PM" && h < 12) h += 12; if(ap === "AM" && h === 12) h = 0; if(h < 24) time = `${pad(h)}:${t[2]}`; }
  return {due:`${y}-${pad(m + 1)}-${pad(d)}`, time};
}
function findDue(...blocks){
  const lines = blocks.join("\n").split("\n").map(l => l.trim()).filter(Boolean);
  // Moodle often puts the label and the date on separate lines; join each label with the next line
  const joined = lines.map((l, i) => parseDate(l) ? (i && !parseDate(lines[i-1]) && lines[i-1].length < 40 ? lines[i-1] + " " + l : l) : null).filter(Boolean);
  const dated = joined.map(l => ({l, p:parseDate(l)})).filter(x => x.p && !OPENS.test(x.l));
  return (dated.find(x => DUE.test(x.l)) || dated[dated.length - 1] || {}).p || null;
}
// "PSY-E1234 - Cognitive Psychology" -> "PSY-E1234"
const courseCode = c => (c.match(/^[A-Z]{2,6}-[A-Z]?\d{3,5}[A-Z0-9.]*/) || [c.slice(0, 40)])[0].trim();

async function main(){
  const info = read();
  if(!info.title || isSubmitted(info.status)) return;
  const {nsSeen = {}} = await chrome.storage.local.get("nsSeen");
  if(nsSeen[pageKey]) return;
  show(info, async state => {
    const {nsSeen: cur = {}} = await chrome.storage.local.get("nsSeen");
    cur[pageKey] = state; await chrome.storage.local.set({nsSeen: cur});
  });
}

function show(info, remember){
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647";
  const root = host.attachShadow({mode:"closed"});
  root.innerHTML = `<style>
    .card{font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;background:#fff;color:#2f2e2b;border:1px solid #ecebe7;border-radius:10px;
      box-shadow:0 10px 30px rgba(0,0,0,.12);padding:14px 16px;width:300px;max-width:calc(100vw - 40px)}
    .k{font-size:12px;color:#8b8780;display:flex;align-items:center;gap:6px}
    .k i{width:14px;height:14px;border-radius:4px;background:#58806a;display:inline-block}
    .t{font-weight:600;margin:4px 0 2px}
    .d{font-size:12.5px;color:#8b8780;margin:0 0 10px}
    .row{display:flex;gap:6px;justify-content:flex-end}
    button{font:inherit;font-size:13px;border-radius:6px;padding:5px 12px;cursor:pointer;border:1px solid #ecebe7;background:#fff;color:#2f2e2b}
    button.p{background:#2f2e2b;color:#fff;border-color:#2f2e2b}
    button.g{border-color:transparent;color:#8b8780}
    @media (prefers-color-scheme: dark){
      .card{background:#1a1a19;color:#e8e6e1;border-color:#2c2b29}
      button{background:#1a1a19;color:#e8e6e1;border-color:#2c2b29}
      button.p{background:#e8e6e1;color:#1a1a19;border-color:#e8e6e1}
    }</style>
    <div class="card" role="dialog" aria-label="Add to Next Step">
      <div class="k"><i></i>Next Step</div>
      <div class="t"></div>
      <p class="d"></p>
      <div class="row">
        <button class="g" data-a="never">Don't ask here</button>
        <button data-a="later">Not now</button>
        <button class="p" data-a="add">Add</button>
      </div>
    </div>`;
  root.querySelector(".t").textContent = `Add “${info.title}” to your plan?`;
  const w = info.when;
  const due = w ? "due " + new Date(w.due + "T" + (w.time || "12:00")).toLocaleString(undefined, w.time
    ? {weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"} : {weekday:"short", month:"short", day:"numeric"}) : "no due date found";
  root.querySelector(".d").textContent = [info.course, due].filter(Boolean).join(" · ");
  root.addEventListener("click", e => {
    const a = e.target.closest("button")?.dataset.a; if(!a) return;
    if(a === "add"){
      const body = [info.title, info.course && `Course: ${info.course}`, info.dates, info.intro && `Instructions:\n${info.intro.slice(0, 10000)}`]
        .filter(Boolean).join("\n\n") + `\n\n(From MyCourses: ${pageKey})`;
      // hints let the app fill the form straight from the page, with or without Claude
      const hints = {title: info.title.slice(0, 80), cls: info.course ? courseCode(info.course) : "", due: w ? w.due : "", time: w ? w.time : ""};
      chrome.runtime.sendMessage({type:"add", text: body, hints});
      remember("added");
    } else if(a === "never") remember("dismissed");
    host.remove();
  });
  document.documentElement.appendChild(host);
}

main().catch(() => {});
})();
