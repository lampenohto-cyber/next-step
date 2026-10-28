// What kind of work an assignment is (reading, essay, math, exam prep or other), guessed from its text.
// Shared by the app and the MyCourses content script. Exposed as globalThis.NextStepKinds.
(() => {
"use strict";
// words in English, Finnish and Swedish; a match in the title counts three times.
// Stems match the start of a word ("kirjoit" → "kirjoittaa"); short words that hide inside others
// ("exam" in "example", "lue" in "luento") are whole words only.
const W = "(?!\\p{L})";
const words = (stems, whole) => new RegExp(`(?<!\\p{L})(?:(?:${whole.join("|")})${W}|${stems.join("|")})`, "giu");
const KINDS = {
  reading: {label:"Reading", words:words(["chapter","article","textbook","canto","lukemi","lukutehtäv","luku","luvut","artikkel","kirja","läsning","kapitel","artikel"],
    ["read","reads","reading","readings","pp\\.","books?","lue","lukea","läs","läsa","bok"])},
  essay:   {label:"Essay / writing", words:words(["essay","paper","write","writing","draft","report","reflect","thesis","argument","literature review","response paper","discussion post","essee","kirjoit","raportti","pohdinta","essä","skriv","rapport","reflektion","uppsats"],
    ["words","posts?","sanaa","ord"])},
  math:    {label:"Math / problems", words:words(["calculus","algebra","equation","problem set","problems","exercise","derive","derivative","integral","matri","vector","statistic","regression","probability","anova","t-test","spss","comput","calculat","solve","formula","harjoitus","laskutehtäv","laske","ratkaise","todista","matemati","tilasto","derivaat","integraal","beräkna","övning","matematik","statistik","ekvation"],
    ["maths?","proofs?","prove","lös","lösa"])},
  exam:    {label:"Exam prep", words:words(["midterm","final exam","tentti","kokeeseen","välikoe","tentamen"],
    ["exams?","examination","tests?","koe","prov"])}
};
const ORDER = ["reading", "essay", "math", "exam", "other"];
const label = k => (KINDS[k] || {label:"Other"}).label;
// Moodle activity types nudge the guess a little
const MODULE = {turnitintooltwo:{essay:3}, forum:{essay:1}, quiz:{exam:1, reading:1}, workshop:{essay:1}};

function guess(title, body, module){
  const t = String(title || ""), b = String(body || "");
  const score = {};
  for(const k in KINDS){
    const count = s => (s.match(KINDS[k].words) || []).length;
    score[k] = count(t) * 3 + Math.min(count(b), 6) + ((MODULE[module] || {})[k] || 0);
  }
  const best = Object.keys(score).sort((x, y) => score[y] - score[x])[0];
  return score[best] > 0 ? best : "other";
}

globalThis.NextStepKinds = {ORDER, label, guess};
})();
