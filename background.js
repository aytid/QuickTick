const KEY = 'QuickTick_action_items_v1';
const LEGACY_KEY = 'daymark_action_items_v1';

// One-time migration of data saved under the pre-1.3.9 storage key.
async function migrateLegacy() {
  try {
    const d = await chrome.storage.local.get([KEY, LEGACY_KEY]);
    if (!Array.isArray(d[KEY]) && Array.isArray(d[LEGACY_KEY])) {
      await chrome.storage.local.set({[KEY]: d[LEGACY_KEY]}); // legacy copy is kept as a backup
    }
  } catch (_) {}
}
chrome.runtime.onInstalled.addListener(migrateLegacy);
chrome.runtime.onStartup.addListener(migrateLegacy);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'QuickTick_OPEN_DASHBOARD') {
    chrome.tabs.create({url: chrome.runtime.getURL('dashboard.html')});
  }
});

const NEW_TAB = /^(chrome|edge|about|chrome-search):\/\/(newtab|new-tab-page|local-ntp)|^https:\/\/(www\.)?google\.[a-z.]+\/_\/chrome\/newtab|^https:\/\/ntp\.msn\.com/i;
const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source|chrome-search):/i;

function flashBadge(tabId, title) {
  chrome.action.setBadgeBackgroundColor({color: '#b91c1c'});
  chrome.action.setBadgeText({text: '!', tabId});
  chrome.action.setTitle({title, tabId});
  setTimeout(() => {
    chrome.action.setBadgeText({text: '', tabId});
    chrome.action.setTitle({title: 'Open QuickTick floating checklist', tabId});
  }, 4000);
}

chrome.action.onClicked.addListener(async (tab) => {
  const url = (tab && (tab.url || tab.pendingUrl)) || '';
  if (NEW_TAB.test(url)) {
    chrome.windows.create({
      url: chrome.runtime.getURL('newtab-checklist.html'),
      type: 'popup',
      width: 390,
      height: 600
    });
    return;
  }
  if (!tab?.id) return;
  if (RESTRICTED.test(url)) {
    flashBadge(tab.id, 'QuickTick cannot run on browser pages. Open it from a normal website, or use the Full Dashboard.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {type: 'QuickTick_TOGGLE_MACRO'});
    return;
  } catch (_) { /* content script not injected yet */ }
  try {
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['content.js']});
    await chrome.tabs.sendMessage(tab.id, {type: 'QuickTick_TOGGLE_MACRO'});
  } catch (err) {
    console.warn('QuickTick could not open on this page:', err);
    flashBadge(tab.id, 'QuickTick cannot run on this page (e.g. Chrome Web Store or a protected page).');
  }
});
