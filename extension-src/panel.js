// Side panel: shows the online app so it updates without reinstalling the extension.
// Falls back to the copy bundled in the extension (index.html) when the site can't be reached.
const APP_URL = "__APP_URL__";   // filled in by build.py from site.txt
const LOCAL = "index.html";

async function reachable(){
  if(!/^https:/.test(APP_URL) || navigator.onLine === false) return false;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    // GitHub Pages allows cross-origin reads, so a missing site shows up as a 404 here
    const res = await fetch(APP_URL + "manifest.webmanifest", {cache:"no-store", signal:ctl.signal});
    clearTimeout(t); return res.ok;
  } catch(e){ return false; }
}

(async () => {
  if(!(await reachable())){ location.replace(LOCAL); return; }
  const origin = new URL(APP_URL).origin;
  const frame = document.createElement("iframe");
  frame.src = APP_URL;
  frame.allow = "clipboard-read; clipboard-write";
  document.body.appendChild(frame);

  let ready = false;
  const send = async () => {
    if(!ready) return;
    const {pendingText} = await chrome.storage.local.get("pendingText");
    if(!pendingText) return;
    await chrome.storage.local.remove("pendingText");
    frame.contentWindow.postMessage({type:"nextstep-add", text:pendingText}, origin);
  };
  addEventListener("message", e => {
    if(e.source === frame.contentWindow && e.origin === origin && e.data && e.data.type === "nextstep-ready"){ ready = true; send(); }
  });
  chrome.storage.onChanged.addListener((ch, area) => { if(area === "local" && ch.pendingText && ch.pendingText.newValue) send(); });
})();
