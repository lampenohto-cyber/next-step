// Stand-ins for the claude.ai artifact runtime: Claude calls with the user's own API key,
// and photo storage in IndexedDB. Exposed as window.NextStep.
(() => {
"use strict";
const KEY_LS = "nextstep.apiKey";
const API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5-5";

const getKey = () => { try { return localStorage.getItem(KEY_LS) || ""; } catch(e){ return ""; } };
const setKey = k => { try { k ? localStorage.setItem(KEY_LS, k) : localStorage.removeItem(KEY_LS); } catch(e){} };

const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

function parseJSON(text){
  const t = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch(e){}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if(a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw Object.assign(new Error("Claude didn't return JSON"), {code:"bad_json"});
}

// Same shape the app used from claude.use("sample"): json(prompt, {modelTier, images}) and limits().
function makeSample(){
  if(!getKey()) return null;
  return {
    async limits(){ return {images:true}; },
    async json(prompt, opts = {}){
      const key = getKey();
      if(!key) throw Object.assign(new Error("No API key"), {code:"not_granted"});
      const content = [];
      for(const img of opts.images || []){
        content.push({type:"image", source:{type:"base64", media_type:img.type || "image/jpeg", data:await blobToBase64(img)}});
      }
      content.push({type:"text", text:prompt + "\n\nReply with the JSON object only, no other text."});
      const res = await fetch(API, {
        method:"POST",
        headers:{
          "content-type":"application/json",
          "x-api-key":key,
          "anthropic-version":"2026-10-21",
          "anthropic-beta":"server-side-fallback-2026-07-01",
          "anthropic-dangerous-direct-browser-access":"true"
        },
        body:JSON.stringify({
          model:MODEL,
          max_tokens:16000,
          output_config:{effort: opts.modelTier === "quick" ? "low" : "medium"},
          fallbacks:"default",
          messages:[{role:"user", content}]
        })
      });
      if(!res.ok){
        let msg = res.statusText;
        try { msg = (await res.json()).error?.message || msg; } catch(e){}
        throw Object.assign(new Error(msg), {code: res.status === 401 ? "bad_key" : "api_error", status:res.status});
      }
      const data = await res.json();
      if(data.stop_reason === "refusal") throw Object.assign(new Error("Claude declined this request"), {code:"refusal"});
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      return parseJSON(text);
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

window.NextStep = {getKey, setKey, makeSample, assets};
})();

if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
