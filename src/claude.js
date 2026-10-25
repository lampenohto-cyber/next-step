// Stand-ins for the claude.ai artifact runtime: AI calls with the user's own API key
// (Claude or Gemini, picked from the key's prefix), and photo storage in IndexedDB. Exposed as window.NextStep.
(() => {
"use strict";
const KEY_LS = "nextstep.apiKey";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-5-5";
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/";
const GEMINI_MODEL_LS = "nextstep.geminiModel";

const getKey = () => { try { return localStorage.getItem(KEY_LS) || ""; } catch(e){ return ""; } };
const setKey = k => { try { k ? localStorage.setItem(KEY_LS, k) : localStorage.removeItem(KEY_LS); } catch(e){} };
// Google API keys start with "AIza"; anything else is treated as a Claude key ("sk-ant-…")
const provider = (k = getKey()) => /^AIza/.test(k) ? "gemini" : "claude";
const providerName = (k = getKey()) => provider(k) === "gemini" ? "Gemini" : "Claude";

const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const fail = (msg, code, status) => Object.assign(new Error(msg), {code, status});

function parseJSON(text){
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch(e){}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if(a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw fail("The reply wasn't JSON", "bad_json");
}

async function askClaude(key, prompt, images, quick){
  const content = [];
  for(const img of images){
    content.push({type:"image", source:{type:"base64", media_type:img.type || "image/jpeg", data:await blobToBase64(img)}});
  }
  content.push({type:"text", text:prompt + "\n\nReply with the JSON object only, no other text."});
  const res = await fetch(CLAUDE_API, {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-api-key":key,
      "anthropic-version":"2026-10-21",
      "anthropic-beta":"server-side-fallback-2026-07-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({
      model:CLAUDE_MODEL,
      max_tokens:16000,
      output_config:{effort: quick ? "low" : "medium"},
      fallbacks:"default",
      messages:[{role:"user", content}]
    })
  });
  if(!res.ok){
    let msg = res.statusText;
    try { msg = (await res.json()).error?.message || msg; } catch(e){}
    throw fail(msg, res.status === 401 ? "bad_key" : "api_error", res.status);
  }
  const data = await res.json();
  if(data.stop_reason === "refusal") throw fail("Claude declined this request", "refusal");
  return parseJSON((data.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
}

// Gemini model names change over time, so start from the "latest flash" alias and,
// if Google doesn't know it, pick the newest flash model the key can use.
async function geminiModel(key, refresh){
  let m = ""; try { m = localStorage.getItem(GEMINI_MODEL_LS) || ""; } catch(e){}
  if(m && !refresh) return m;
  if(!refresh) return "gemini-flash-latest";
  const res = await fetch(GEMINI_API + "models?pageSize=200&key=" + encodeURIComponent(key));
  if(!res.ok) throw fail("Couldn't list Gemini models", res.status === 400 || res.status === 403 ? "bad_key" : "api_error", res.status);
  const ver = n => (n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1] * 1;
  const usable = ((await res.json()).models || [])
    .filter(x => (x.supportedGenerationMethods || []).includes("generateContent"))
    .map(x => x.name.replace(/^models\//, ""))
    .filter(n => /flash/.test(n) && !/lite|tts|image|live|audio|embed|thinking|exp/.test(n));
  usable.sort((a, b) => ver(b) - ver(a) || (/preview/.test(a) - /preview/.test(b)));
  if(!usable.length) throw fail("No Gemini model available for this key", "api_error");
  try { localStorage.setItem(GEMINI_MODEL_LS, usable[0]); } catch(e){}
  return usable[0];
}

async function askGemini(key, prompt, images){
  const parts = [];
  for(const img of images) parts.push({inline_data:{mime_type:img.type || "image/jpeg", data:await blobToBase64(img)}});
  parts.push({text:prompt});
  const body = JSON.stringify({contents:[{role:"user", parts}], generationConfig:{responseMimeType:"application/json"}});
  let model = await geminiModel(key, false);
  for(let attempt = 0; attempt < 2; attempt++){
    const res = await fetch(GEMINI_API + "models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key),
      {method:"POST", headers:{"content-type":"application/json"}, body});
    if(res.status === 404 && attempt === 0){ model = await geminiModel(key, true); continue; }
    if(!res.ok){
      let msg = res.statusText;
      try { msg = (await res.json()).error?.message || msg; } catch(e){}
      const badKey = res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg));
      throw fail(msg, badKey ? "bad_key" : "api_error", res.status);
    }
    const data = await res.json();
    const cand = (data.candidates || [])[0];
    if(data.promptFeedback?.blockReason || !cand || cand.finishReason === "SAFETY") throw fail("Gemini declined this request", "refusal");
    return parseJSON((cand.content?.parts || []).map(p => p.text || "").join(""));
  }
}

// Same shape the app used from claude.use("sample"): json(prompt, {modelTier, images}) and limits().
function makeSample(){
  if(!getKey()) return null;
  return {
    async limits(){ return {images:true}; },
    async json(prompt, opts = {}){
      const key = getKey();
      if(!key) throw fail("No API key", "not_granted");
      const images = opts.images || [];
      return provider(key) === "gemini" ? askGemini(key, prompt, images) : askClaude(key, prompt, images, opts.modelTier === "quick");
    }
  };
}

// ---------- photo storage (IndexedDB) ----------
const DB = "nextstep", STORE = "assets";
let dbp = null;
function idb(){
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn){
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error);
  });
}
const urls = new Map();
const assets = {
  async upload(blob){
    const id = Math.random().toString(36).slice(2, 12);
    await tx("readwrite", s => s.put(blob, id));
    const url = URL.createObjectURL(blob); urls.set(id, url);
    return {id, url};
  },
  async delete(id){ await tx("readwrite", s => s.delete(id)); const u = urls.get(id); if(u){ URL.revokeObjectURL(u); urls.delete(id); } },
  async load(ids){
    for(const id of ids){
      if(urls.has(id)) continue;
      try { const b = await tx("readonly", s => s.get(id)); if(b) urls.set(id, URL.createObjectURL(b)); } catch(e){}
    }
  },
  url: id => urls.get(id) || ""
};

window.NextStep = {getKey, setKey, provider, providerName, makeSample, assets};
})();

if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
