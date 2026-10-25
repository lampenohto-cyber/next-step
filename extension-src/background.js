// Toolbar button opens Next Step in the side panel; right-click menus add a tab, a window,
// "add selected text as an assignment", and the MyCourses suggestion card hands over its text here.
const PAGE = chrome.runtime.getURL("panel.html");

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: "add-selection", title: "Add “%s” to Next Step", contexts: ["selection"]});
    chrome.contextMenus.create({id: "open-tab", title: "Open Next Step in a tab", contexts: ["action"]});
    chrome.contextMenus.create({id: "open-window", title: "Open Next Step as a window", contexts: ["action"]});
  });
});

// open the panel first, while the click still counts as a user gesture, then hand it the text
function addToPlanner(text, tab, hints){
  if(tab) chrome.sidePanel.open({windowId: tab.windowId}).catch(() => chrome.tabs.create({url: PAGE}));
  else chrome.tabs.create({url: PAGE});
  chrome.storage.local.set({pendingText: hints ? {text, hints} : text});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if(info.menuItemId === "add-selection"){
    const from = tab && tab.url && /^https?:/.test(tab.url) ? `\n\n(From ${tab.title || tab.url}: ${tab.url})` : "";
    addToPlanner(info.selectionText + from, tab);
  } else if(info.menuItemId === "open-tab"){
    chrome.tabs.create({url: PAGE});
  } else if(info.menuItemId === "open-window"){
    chrome.windows.create({url: PAGE, type: "popup", width: 900, height: 900});
  }
});

// "Add" on the MyCourses suggestion card
chrome.runtime.onMessage.addListener((msg, sender) => {
  if(msg && msg.type === "add" && typeof msg.text === "string") addToPlanner(msg.text, sender.tab, msg.hints);
});
