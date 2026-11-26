/* QuickTick background service worker: toolbar button, live badge counter, reminders and repeating-series top-up. */
importScripts('qt-shared.js');
const QT = self.QT;
const { KEY, LEGACY_KEY, SETTINGS_KEY, NOTIFIED_KEY } = QT;

async function migrateLegacy() {
  try {
    const d = await chrome.storage.local.get([KEY, LEGACY_KEY]);
    if (!Array.isArray(d[KEY]) && Array.isArray(d[LEGACY_KEY])) {
      await chrome.storage.local.set({ [KEY]: d[LEGACY_KEY] });
    }
  } catch (_) {}
}
async function ensureAlarms() {
  if (!(await chrome.alarms.get('qt-tick'))) chrome.alarms.create('qt-tick', { periodInMinutes: 1, delayInMinutes: 0.1 });
}

async function updateOpenBadge() {
  try {
    const { tasks } = await loadAll();
    const today = QT.todayISO();
    const openToday = tasks.filter(t => t && !t.done && t.plannedDate === today).length;
    const overdue = tasks.filter(t => t && !t.done && QT.statusKey(t, today) === 'overdue').length;
    const count = openToday + overdue;
    await chrome.action.setBadgeBackgroundColor({ color: overdue > 0 ? '#FF5E3A' : '#00D26A' });
    await chrome.action.setBadgeTextColor?.({ color: '#141413' });
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => { migrateLegacy(); ensureAlarms(); extendSeries(true); updateOpenBadge(); });
chrome.runtime.onStartup.addListener(() => { migrateLegacy(); ensureAlarms(); extendSeries(true); updateOpenBadge(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[KEY] || changes[LEGACY_KEY])) updateOpenBadge();
});
ensureAlarms();
updateOpenBadge();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'QuickTick_OPEN_DASHBOARD') openDashboard();
  if (msg?.type === 'QuickTick_TEST_NOTIFY') {
    chrome.notifications.create('qt-test', {
      type: 'basic', iconUrl: 'icons/quicktick128.png', title: 'QuickTick reminders are working',
      message: 'You will see a notification like this before timed action items.', priority: 1
    });
  }
});
async function openDashboard() {
  const url = chrome.runtime.getURL('dashboard.html');
  const tabs = await chrome.tabs.query({ url: url + '*' });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId !== undefined) chrome.windows.update(tabs[0].windowId, { focused: true });
  } else chrome.tabs.create({ url });
}

const NEW_TAB = /^(chrome|edge|about|chrome-search):\/\/(newtab|new-tab-page|local-ntp)|^https:\/\/(www\.)?google\.[a-z.]+\/_\/chrome\/newtab|^https:\/\/ntp\.msn\.com/i;
const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source|chrome-search):/i;
function flashBadge(tabId, title) {
  chrome.action.setBadgeBackgroundColor({ color: '#FF5E3A' });
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setTitle({ title, tabId });
  setTimeout(() => {
    updateOpenBadge();
    chrome.action.setTitle({ title: 'Open QuickTick floating checklist', tabId });
  }, 4000);
}
chrome.action.onClicked.addListener(async (tab) => {
  const url = (tab && (tab.url || tab.pendingUrl)) || '';
  if (NEW_TAB.test(url)) {
    chrome.windows.create({ url: chrome.runtime.getURL('newtab-checklist.html'), type: 'popup', width: 416, height: 630 });
    return;
  }
  if (!tab?.id) return;
  if (RESTRICTED.test(url)) {
    flashBadge(tab.id, 'QuickTick cannot run on browser pages. Open it from a normal website, or use the Full Dashboard.');
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'QuickTick_TOGGLE_MACRO' });
    return;
  } catch (_) {}
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['qt-shared.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'QuickTick_TOGGLE_MACRO' });
  } catch (err) {
    console.warn('QuickTick could not open on this page:', err);
    flashBadge(tab.id, 'QuickTick cannot run on this page (e.g. Chrome Web Store or a protected page).');
  }
});

async function loadAll() {
  const d = await chrome.storage.local.get([KEY, LEGACY_KEY, SETTINGS_KEY, NOTIFIED_KEY]);
  const raw = Array.isArray(d[KEY]) ? d[KEY] : (QT.asList(d[LEGACY_KEY]) || []);
  return { tasks: raw, settings: QT.normaliseSettings(d[SETTINGS_KEY]), notified: d[NOTIFIED_KEY] || {} };
}
const startMs = t => QT.parseISO(t.plannedDate).getTime() + QT.toMin(t.time) * 60000;

function notify(t, note) {
  chrome.notifications.create('qt|' + t.id, {
    type: 'basic', iconUrl: 'icons/quicktick128.png',
    title: t.title,
    message: note + ' · ' + QT.timeRange(t),
    contextMessage: t.priority + ' priority' + (t.seriesId ? ' · repeats' : ''),
    buttons: [{ title: 'Snooze 5 min' }, { title: 'Mark done' }],
    priority: t.priority === 'Urgent' || t.priority === 'High' ? 2 : 1
  });
}
function whenNote(ms) {
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins > 0) return 'Starts in ' + mins + ' min';
  if (mins === 0) return 'Starting now';
  return 'Started ' + (-mins) + ' min ago';
}
async function checkReminders() {
  const { tasks, settings, notified } = await loadAll();
  if (settings.reminderLead < 0) return;
  const now = Date.now(), lead = settings.reminderLead * 60000;
  let changed = false;
  for (const t of tasks) {
    if (!t || t.done || t.pending || !QT.isTime(t.time) || !QT.isISODate(t.plannedDate)) continue;
    const start = startMs(t), key = t.id + '|' + t.plannedDate + '|' + t.time;
    if (now >= start - lead && now <= start + 5 * 60000 && !notified[key]) {
      notify(t, whenNote(start));
      notified[key] = now; changed = true;
    }
  }
  for (const k of Object.keys(notified)) if (now - notified[k] > 3 * 86400000) { delete notified[k]; changed = true; }
  if (changed) await chrome.storage.local.set({ [NOTIFIED_KEY]: notified });
}

let lastExtend = 0;
async function extendSeries(force) {
  if (!force && Date.now() - lastExtend < 6 * 3600000) return;
  lastExtend = Date.now();
  const { tasks } = await loadAll();
  const clean = QT.cleanList(tasks).tasks;
  if (QT.extendSeries(clean, QT.todayISO()) > 0) await chrome.storage.local.set({ [KEY]: clean });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'qt-tick') { await checkReminders(); await extendSeries(false); updateOpenBadge(); return; }
  if (alarm.name.startsWith('qt-snooze|')) {
    const id = alarm.name.slice('qt-snooze|'.length);
    const { tasks } = await loadAll();
    const t = tasks.find(x => x && x.id === id);
    if (t && !t.done && QT.isTime(t.time)) notify(t, whenNote(startMs(t)));
  }
});
chrome.notifications.onButtonClicked.addListener(async (nid, index) => {
  if (!nid.startsWith('qt|')) return;
  const id = nid.slice(3);
  chrome.notifications.clear(nid);
  if (index === 0) { chrome.alarms.create('qt-snooze|' + id, { delayInMinutes: 5 }); return; }
  const { tasks } = await loadAll();
  const t = tasks.find(x => x && x.id === id);
  if (!t) return;
  t.done = true; t.pending = false; t.movedTo = ''; t.completedAt = new Date().toISOString();
  await chrome.storage.local.set({ [KEY]: tasks });
});
chrome.notifications.onClicked.addListener((nid) => {
  chrome.notifications.clear(nid);
  if (nid.startsWith('qt|') || nid === 'qt-test') openDashboard();
});
