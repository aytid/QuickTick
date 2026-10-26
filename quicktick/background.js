chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'QuickTick_OPEN_DASHBOARD') {
    chrome.tabs.create({url: chrome.runtime.getURL('dashboard.html')});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab && tab.url || '';
  if (/^(chrome|edge|about):\/\/newtab/i.test(url) || url === 'chrome://newtab/') {
    chrome.windows.create({
      url: chrome.runtime.getURL('newtab-checklist.html'),
      type: 'popup',
      width: 390,
      height: 560
    });
    return;
  }
  if (!tab?.id || /^(chrome|edge|about|chrome-extension):\/\//i.test(url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {type:'QuickTick_TOGGLE_MACRO'});
    return;
  } catch (_) {}
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
    await chrome.tabs.sendMessage(tab.id, {type:'QuickTick_TOGGLE_MACRO'});
  } catch (err) {
    console.warn('QuickTick could not open on this page:', err);
  }
});
