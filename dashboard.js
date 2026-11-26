/* QuickTick v3.0 Tactile Studio Dashboard */
(function () {
  'use strict';
  var QT = window.QT;

  var KEY = QT.KEY, LEGACY_KEY = QT.LEGACY_KEY, SETTINGS_KEY = QT.SETTINGS_KEY;
  var APP = 'QuickTick', FORMAT_VERSION = 1;
  var PRIORITIES = QT.PRIORITIES, PRANK = QT.PRANK, STATUS_LABEL = QT.STATUS_LABEL, STATUS_RANK = QT.STATUS_RANK;
  var MAX_OCCURRENCES = QT.MAX_OCCURRENCES, DOW_FULL = QT.DOW_FULL, MONTHS = QT.MONTHS;
  var pad = QT.pad, esc = QT.esc, plural = QT.plural, newId = QT.newId;
  var toISO = QT.toISO, parseISO = QT.parseISO, todayISO = QT.todayISO, addDays = QT.addDays, dayDiff = QT.dayDiff;
  var isISODate = QT.isISODate, isWeekend = QT.isWeekend, nextBusinessDay = QT.nextBusinessDay;
  var fmtShort = QT.fmtShort, fmtLong = QT.fmtLong, fmtFull = QT.fmtFull, fmtDay = QT.fmtDay, fmtDayNoWd = QT.fmtDayNoWd;
  var isTime = QT.isTime, toMin = QT.toMin, fromMin = QT.fromMin, addMinutes = QT.addMinutes, timeRange = QT.timeRange;
  var statusKey = QT.statusKey, generateDates = QT.generateDates, describeRule = QT.describeRule;
  var HAS_CHROME = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var settings = QT.normaliseSettings((function () { try { return JSON.parse(ls(SETTINGS_KEY) || '{}'); } catch (e) { return {}; } })());
  function applyTheme() {
    var root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', settings.theme);
  }
  applyTheme();
  function saveSettings(patch) {
    var next = {}; Object.keys(settings).forEach(function (k) { next[k] = settings[k]; });
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    settings = QT.normaliseSettings(next);
    ls(SETTINGS_KEY, JSON.stringify(settings));
    if (HAS_CHROME) { var o = {}; o[SETTINGS_KEY] = settings; chrome.storage.local.set(o); }
    applySettings();
  }
  function applySettings() { applyTheme(); renderBackupState(); renderSettingsDialog(); }

  var VIEW_KEY = 'QuickTick_calendar_view_v2', WEEKENDS_KEY = 'QuickTick_month_weekends', SCOPE_KEY = 'QuickTick_stats_scope';
  function loadViewPrefs() {
    var v = ls(VIEW_KEY), weekends = ls(WEEKENDS_KEY);
    if (!v) {
      var old = ls('QuickTick_calendar_view');
      v = old === 'day' ? 'day' : 'month';
      if (weekends === null) weekends = old === 'week' ? '1' : '0';
    }
    return { view: ['day', 'workweek', 'week', 'month'].indexOf(v) >= 0 ? v : 'month', weekends: weekends === '1' };
  }
  var prefs = loadViewPrefs();

  var state = {
    tasks: [],
    selected: todayISO(),
    viewY: 0, viewM: 0,
    view: prefs.view,
    monthWeekends: prefs.weekends,
    scope: (ls(SCOPE_KEY) || ls('QuickTick_open_scope')) === 'all' ? 'all' : 'today',
    railFilter: 'all',
    f: { q: '', from: '', to: '', status: 'all', priority: 'all', sort: 'time' },
    editingId: null, editScope: 'this', editSeries: null,
    deadlineTouched: false, endTouched: false,
    lastToday: todayISO()
  };
  (function () { var d = parseISO(state.selected); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); })();

  var storage = null;
  try { storage = window.localStorage; storage.getItem(KEY); } catch (e) { storage = null; }

  function setStorageStatus(ok, msg) {
    $('#storageDot').className = 'dot' + (ok ? '' : ' bad');
    $('#storageStatus').textContent = msg;
  }
  function loadTasks() {
    if (!storage) {
      setStorageStatus(false, 'Browser storage unavailable');
      return [];
    }
    var raw;
    try { raw = storage.getItem(KEY); if (raw === null) raw = storage.getItem(LEGACY_KEY); } catch (e) { raw = null; }
    if (raw === null) { setStorageStatus(true, 'Storage ready'); return []; }
    try {
      var res = QT.cleanList(JSON.parse(raw));
      setStorageStatus(true, 'Loaded ' + plural(res.tasks.length, 'task') + ' from this browser');
      return res.tasks;
    } catch (e) {
      setStorageStatus(false, 'Saved data could not be read');
      return [];
    }
  }
  function saveTasks() {
    if (!storage) { setStorageStatus(false, 'Not saved: storage unavailable'); return false; }
    try {
      storage.setItem(KEY, JSON.stringify(state.tasks));
      if (HAS_CHROME) { var o = {}; o[KEY] = state.tasks; chrome.storage.local.set(o); }
      var t = new Date();
      setStorageStatus(true, 'Saved at ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()));
      return true;
    } catch (e) {
      setStorageStatus(false, 'Not saved: storage full or blocked');
      return false;
    }
  }
  function findTask(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i]; return null; }
  function seriesItems(sid) { return state.tasks.filter(function (x) { return x.seriesId === sid; }).sort(function (a, b) { return a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0; }); }

  function undoable(ids, message, mutate) {
    var idSet = {}; ids.forEach(function (id) { idSet[id] = 1; });
    var before = QT.clone(state.tasks.filter(function (t) { return idSet[t.id]; }));
    var existed = {}; state.tasks.forEach(function (t) { existed[t.id] = 1; });
    if (mutate() === false) return false;
    var created = {}; state.tasks.forEach(function (t) { if (!existed[t.id]) created[t.id] = 1; });
    var saved = saveTasks();
    renderAll();
    var undo = function () {
      state.tasks = state.tasks.filter(function (t) { return !idSet[t.id] && !created[t.id]; }).concat(before);
      if (saveTasks()) toast('Undone');
      renderAll();
      if ($('#seriesDlg').open) renderSeriesList();
    };
    lastUndo = saved ? undo : null;
    if (saved && message) toast(message, '', 7000, { label: 'Undo', fn: undo });
    return saved;
  }

  function hasQuery() { return state.f.q.trim() !== ''; }
  function matches(t, today) {
    var f = state.f, q = f.q.trim().toLowerCase();
    if (q && t.title.toLowerCase().indexOf(q) < 0 && t.notes.toLowerCase().indexOf(q) < 0) return false;
    if (f.from && t.plannedDate < f.from) return false;
    if (f.to && t.plannedDate > f.to) return false;
    if (f.status !== 'all' && statusKey(t, today) !== f.status) return false;
    if (f.priority !== 'all' && t.priority !== f.priority) return false;
    return true;
  }
  function tie(a, b) { return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  function cmpDeadline(a, b) { return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0; }
  function whenKey(t) { return t.plannedDate + ' ' + (t.time || '99:99'); }
  function cmpWhen(a, b) { var x = whenKey(a), y = whenKey(b); return x < y ? -1 : x > y ? 1 : 0; }
  function cmpDay(today) {
    return function (a, b) {
      return (Number(a.done) - Number(b.done)) || cmpWhen(a, b) || (STATUS_RANK[statusKey(a, today)] - STATUS_RANK[statusKey(b, today)]) || a.title.localeCompare(b.title) || tie(a, b);
    };
  }
  function sortTasks(list) {
    var s = state.f.sort;
    return list.slice().sort(function (a, b) {
      var r = 0;
      if (s === 'time') r = cmpWhen(a, b) || cmpDeadline(a, b) || (PRANK[a.priority] - PRANK[b.priority]);
      else if (s === 'deadline') r = cmpDeadline(a, b) || (PRANK[a.priority] - PRANK[b.priority]);
      else if (s === 'priority') r = (PRANK[a.priority] - PRANK[b.priority]) || cmpDeadline(a, b);
      else if (s === 'recent') r = a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      else if (s === 'planned') r = (a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0) || cmpDeadline(a, b);
      else if (s === 'title') r = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      return r || tie(a, b);
    });
  }
  function filteredAll() {
    var today = todayISO();
    return sortTasks(state.tasks.filter(function (t) { return matches(t, today); }));
  }
  function activeFilterCount() {
    var f = state.f, n = 0;
    if (f.from) n++; if (f.to) n++; if (f.status !== 'all') n++; if (f.priority !== 'all') n++;
    return n;
  }

  /* ---------- Stats & Left Command Rail ---------- */
  function renderStats() {
    var today = todayISO(), all = state.scope === 'all', open = 0, over = 0, soon = 0;
    var seriesSet = {};
    state.tasks.forEach(function (t) {
      if (t.seriesId) seriesSet[t.seriesId] = 1;
      if (t.done) return;
      var k = statusKey(t, today);
      if (all) {
        open++;
        if (k === 'overdue') over++; else if (k === 'soon') soon++;
      } else {
        if (t.plannedDate === today) open++;
        if (k === 'overdue' && t.plannedDate <= today) over++;
        if (!t.pending && t.deadline === today) soon++;
      }
    });
    var sel = state.tasks.filter(function (t) { return t.plannedDate === state.selected; });
    var selDone = sel.filter(function (t) { return t.done; }).length;
    var rate = sel.length ? Math.round(selDone / sel.length * 100) : 0;
    $('#stOpen').textContent = open;
    $('#stOpenSub').textContent = all ? 'All dates' : 'Planned today';
    $('#stOverdue').textContent = over;
    $('#stOverdueSub').textContent = all ? 'Passed deadline' : 'Deadline passed';
    $('#stSoonLbl').textContent = all ? 'DUE SOON' : 'DUE TODAY';
    $('#stSoon').textContent = soon;
    $('#stSoonSub').textContent = all ? 'Next 3 days' : 'Action required';
    $('#stRate').textContent = rate + '%';
    $('#stRateSub').textContent = selDone + ' of ' + sel.length + ' done';

    $all('#statsScope [data-scope]').forEach(function (b) {
      var on = b.getAttribute('data-scope') === state.scope;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    });

    if ($('#railSeriesCnt')) $('#railSeriesCnt').textContent = Object.keys(seriesSet).length;
    if ($('#btnToday')) $('#btnToday').classList.toggle('is-today', state.selected === today);
  }

  /* ---------- Calendar ---------- */
  var VIEW_LABEL = { day: 'Day', workweek: 'Work week', week: 'Week', month: 'Month' };
  var HOUR_PX = 48, tgScrollKey = '';
  function byDateMap() {
    var m = {};
    state.tasks.forEach(function (t) { (m[t.plannedDate] = m[t.plannedDate] || []).push(t); });
    return m;
  }
  function visibleDates() {
    if (state.view === 'day') return [state.selected];
    var mon = QT.startOfWeek(state.selected), n = state.view === 'workweek' ? 5 : 7, out = [];
    for (var i = 0; i < n; i++) out.push(addDays(mon, i));
    return out;
  }
  function rangeTitle(a, b) {
    var A = parseISO(a), B = parseISO(b);
    if (A.getFullYear() !== B.getFullYear()) return fmtShort(a) + ' – ' + fmtShort(b);
    if (A.getMonth() !== B.getMonth()) return A.getDate() + ' ' + MONTHS[A.getMonth()].slice(0, 3) + ' – ' + B.getDate() + ' ' + MONTHS[B.getMonth()].slice(0, 3) + ' ' + B.getFullYear();
    return A.getDate() + '–' + B.getDate() + ' ' + MONTHS[A.getMonth()] + ' ' + A.getFullYear();
  }
  function setCalNote(text, btnText, action) {
    $('#calNote').hidden = !text;
    if (!text) return;
    $('#calNoteText').textContent = text;
    $('#calNoteBtn').textContent = btnText;
    $('#calNoteBtn').setAttribute('data-action', action);
  }
  function renderCalendar() {
    var month = state.view === 'month';
    $('#calGrid').hidden = !month; $('#calWeekdays').hidden = !month;
    $('#timeGrid').hidden = month;
    $('#calWeekBadge').textContent = 'W' + QT.isoWeek(state.selected);
    $all('#viewPills [data-view]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === state.view);
    });
    if (month) renderMonth(); else renderTimeGrid(visibleDates());
  }

  function renderMonth() {
    var y = state.viewY, m = state.viewM, today = todayISO(), byDate = byDateMap();
    $('#calTitle').textContent = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    var start = new Date(y, m, 1 - (new Date(y, m, 1).getDay() + 6) % 7);
    var hideWeekends = !state.monthWeekends, cells = [], all = [], hasSel = false, i;
    for (i = 0; i < 42; i++) {
      var dd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      all.push(dd);
      if (hideWeekends && (dd.getDay() === 0 || dd.getDay() === 6)) continue;
      cells.push(dd); if (toISO(dd) === state.selected) hasSel = true;
    }
    var firstInMonth = cells.filter(function (c) { return c.getMonth() === m; })[0] || cells[0];
    var tabDate = hasSel ? state.selected : toISO(firstInMonth);
    var names = hideWeekends ? ['MON', 'TUE', 'WED', 'THU', 'FRI'] : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    $('#calWeekdays').innerHTML = names.map(function (n) { return '<div>' + n + '</div>'; }).join('');
    $('#calWeekdays').classList.toggle('cols-5', hideWeekends);
    $('#calGrid').classList.toggle('cols-5', hideWeekends);
    var hidden = 0;
    if (hideWeekends) state.tasks.forEach(function (t) { if (isWeekend(t.plannedDate) && parseISO(t.plannedDate).getMonth() === m && parseISO(t.plannedDate).getFullYear() === y) hidden++; });
    setCalNote(hidden ? plural(hidden, 'item') + ' on weekends this month ' + (hidden === 1 ? 'is' : 'are') + ' hidden.' : '', 'Show weekends', 'weekends');
    var html = '';
    cells.forEach(function (d) {
      var key = toISO(d), list = (byDate[key] || []).slice().sort(cmpDay(today));
      var cls = 'day' + (d.getMonth() !== m ? ' other' : '') + (key === today ? ' today' : '') + (key === state.selected ? ' selected' : '');
      html += '<button type="button" class="' + cls + '" data-date="' + key + '" tabindex="' + (key === tabDate ? 0 : -1) + '"' +
        ' aria-pressed="' + (key === state.selected) + '"' + (key === today ? ' aria-current="date"' : '') + '>' +
        '<div class="day-top"><span class="num">' + d.getDate() + '</span>' + (list.length ? '<span class="day-cnt">' + list.length + '</span>' : '') + '</div>';
      list.slice(0, 3).forEach(function (t) {
        html += '<span class="chip s-' + statusKey(t, today) + '" data-id="' + esc(t.id) + '">' + esc(t.title) + '</span>';
      });
      if (list.length > 3) html += '<span class="more">+' + (list.length - 3) + ' more</span>';
      html += '</button>';
    });
    $('#calGrid').innerHTML = html;
  }

  function layoutLanes(list) {
    var items = list.map(function (t) {
      var s0 = toMin(t.time), e0 = t.endTime ? toMin(t.endTime) : s0 + 30;
      return { t: t, s: s0, e: Math.max(e0, s0 + 20) };
    }).sort(function (a, b) { return a.s - b.s || b.e - a.e; });
    var cluster = [], end = -1;
    function flush() {
      var lanes = [];
      cluster.forEach(function (it) { var l = 0; while (lanes[l] !== undefined && lanes[l] > it.s) l++; lanes[l] = it.e; it.lane = l; });
      cluster.forEach(function (it) { it.lanes = lanes.length; });
      cluster = [];
    }
    items.forEach(function (it) { if (it.s >= end) { flush(); end = -1; } cluster.push(it); end = Math.max(end, it.e); });
    flush();
    return items;
  }
  function renderTimeGrid(dates) {
    var today = todayISO(), byDate = byDateMap(), n = dates.length;
    $('#timeGrid').style.setProperty('--n', n);
    $('#calTitle').textContent = n === 1 ? fmtFull(dates[0]) + (dates[0] === today ? ' · Today' : '') : rangeTitle(dates[0], dates[n - 1]);

    $('#tgHead').hidden = n === 1;
    $('#tgHead').innerHTML = '<span></span>' + dates.map(function (d) {
      var dt = parseISO(d);
      return '<button type="button" class="tg-dh' + (d === today ? ' today' : '') + (d === state.selected ? ' selected' : '') + '" data-date="' + d + '" aria-pressed="' + (d === state.selected) + '">' +
        QT.DOW_SHORT[dt.getDay()] + '<span class="n">' + dt.getDate() + '</span></button>';
    }).join('');

    $('#tgAllDay').innerHTML = '<div class="lbl">No time</div>' + dates.map(function (d) {
      var list = (byDate[d] || []).filter(function (t) { return !t.time; }).sort(cmpDay(today));
      return '<div class="tg-ad" data-date="' + d + '">' + (list.length ? list.map(function (t) {
        var k = statusKey(t, today);
        return '<button type="button" class="chip s-' + k + '" data-id="' + esc(t.id) + '">' + esc(t.title) + '</button>';
      }).join('') : (n === 1 ? '<span class="empty-note">Nothing without a time</span>' : '')) + '</div>';
    }).join('');

    var html = '<div class="tg-gutter">';
    for (var h = 1; h < 24; h++) html += '<span style="top:' + (h * HOUR_PX) + 'px">' + pad(h) + ':00</span>';
    html += '</div>';
    var firstTimed = Infinity, now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    dates.forEach(function (d) {
      html += '<div class="tg-col' + (d === today ? ' today' : '') + '" data-date="' + d + '">';
      layoutLanes((byDate[d] || []).filter(function (t) { return t.time; })).forEach(function (it) {
        var t = it.t, k = statusKey(t, today), w = 100 / it.lanes;
        firstTimed = Math.min(firstTimed, it.s);
        html += '<div class="tg-item s-' + k + '" data-id="' + esc(t.id) + '" role="button" tabindex="0" ' +
          'style="top:' + (it.s / 60 * HOUR_PX) + 'px;height:' + Math.max((it.e - it.s) / 60 * HOUR_PX - 2, 20) + 'px;left:calc(' + (w * it.lane) + '% + 3px);width:calc(' + w + '% - 6px)">' +
          '<input type="checkbox" data-act="toggle" ' + (t.done ? 'checked ' : '') + 'aria-label="Complete ' + esc(t.title) + '">' +
          '<div class="tx"><b>' + (t.seriesId ? '↻ ' : '') + esc(t.title) + '</b><small>' + esc(timeRange(t)) + '</small></div>' +
          '<span class="rs" data-act="resize" aria-hidden="true"></span></div>';
      });
      if (d === today) html += '<div class="tg-now" style="top:' + (nowMin / 60 * HOUR_PX) + 'px"></div>';
      html += '<div class="tg-ghost" hidden></div></div>';
    });
    $('#tgBody').innerHTML = html;

    var hidden = 0;
    if (state.view === 'workweek') {
      var sat = addDays(dates[0], 5), sun = addDays(dates[0], 6);
      hidden = (byDate[sat] || []).length + (byDate[sun] || []).length;
    }
    setCalNote(hidden ? plural(hidden, 'item') + ' this weekend ' + (hidden === 1 ? 'is' : 'are') + ' hidden.' : '', 'Show the full week', 'week');

    var key = state.view + dates[0];
    if (key !== tgScrollKey) {
      tgScrollKey = key;
      var target = firstTimed < Infinity ? firstTimed - 60 : dates.indexOf(today) >= 0 ? nowMin - 60 : 8 * 60;
      $('#tgScroll').scrollTop = Math.max(0, target) / 60 * HOUR_PX;
    }
  }
  function slotAt(col, clientY) {
    var r = col.getBoundingClientRect();
    var mins = Math.floor((clientY - r.top) / HOUR_PX * 4) * 15;
    return Math.max(0, Math.min(23 * 60 + 45, mins));
  }

  /* ---------- Right Action Drawer ---------- */
  var ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_CLOCK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var ICON_DEL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
  var ICO_CAL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';
  var ICO_SEARCH = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICO_REPEAT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>';

  function deadlineNote(t, today) {
    if (t.done) return '';
    var d = dayDiff(today, t.deadline);
    if (d === 0) return ' (today)';
    if (d === 1) return ' (tomorrow)';
    if (d > 1) return ' (in ' + d + ' days)';
    if (d === -1) return ' (yesterday)';
    return ' (' + (-d) + ' days ago)';
  }
  function hasMovedCopy(t) { return !!(t.movedTo && findTask(t.movedTo)); }
  function taskCard(t, today, showPlanned) {
    var k = statusKey(t, today);
    return '<article class="task s-' + k + '" data-id="' + esc(t.id) + '">' +
      '<input type="checkbox" class="chk" data-act="toggle" ' + (t.done ? 'checked ' : '') + 'aria-label="Mark “' + esc(t.title) + '” as completed">' +
      '<div class="task-main">' +
      '<div class="task-title" title="Drag onto the calendar to reschedule">' + esc(t.title) + '</div>' +
      '<div class="meta">' +
      '<span class="badge s-' + k + '">' + STATUS_LABEL[k] + '</span>' +
      '<span class="badge p p-' + t.priority + '">' + t.priority + '</span>' +
      (t.time ? '<span class="time" title="Planned time">' + ICON_CLOCK + esc(timeRange(t)) + '</span>' : '') +
      (t.seriesId ? '<span class="badge rep" title="' + esc(t.seriesRule ? 'Repeats: ' + t.seriesRule : 'Part of a repeating series') + '">↻ Repeats</span>' : '') +
      '<span>Due: ' + fmtShort(t.deadline) + esc(deadlineNote(t, today)) + '</span>' +
      (showPlanned ? '<span>· Planned: <button type="button" class="btn-link" data-act="goto" data-date="' + t.plannedDate + '">' + fmtShort(t.plannedDate) + '</button></span>' : '') +
      '</div>' +
      (t.notes ? '<div class="task-notes">' + linkify(t.notes) + '</div>' : '') +
      '<div class="task-actions">' +
      (!t.done ? (t.pending ? '<button type="button" class="btn btn-sm" data-act="unpending">Unmark pending</button>' : '<button type="button" class="btn btn-sm" data-act="pending">Mark pending</button>') : '') +
      (hasMovedCopy(t) ? '<span class="moved-note">Moved to ' + esc(fmtShort(findTask(t.movedTo).plannedDate)) + '</span>' : '<button type="button" class="btn btn-sm" data-act="nextday" title="Copy this task to the next working day">Move to next day</button>') +
      '<button type="button" class="icon-btn sm" data-act="edit" aria-label="Edit “' + esc(t.title) + '”" title="Edit">' + ICON_EDIT + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-act="delete" aria-label="Delete “' + esc(t.title) + '”" title="Delete">' + ICON_DEL + '</button>' +
      '</div></div></article>';
  }
  function emptyBlock(icon, title, text, btn) {
    return '<div class="empty"><div class="ico">' + icon + '</div><h3>' + title + '</h3><p>' + text + '</p>' + (btn || '') + '</div>';
  }
  function renderPanel() {
    var today = todayISO(), sel = state.selected, searching = hasQuery() || state.railFilter !== 'all' || activeFilterCount() > 0;
    var dayAll = state.tasks.filter(function (t) { return t.plannedDate === sel; });
    var list, html = '';
    $('#panelTodayTag').hidden = sel !== today || searching;
    if (searching) {
      list = filteredAll();
      if (state.railFilter === 'high') {
        list = list.filter(function (t) { return !t.done && (t.priority === 'High' || t.priority === 'Urgent'); });
      }
      $('#panelTitle').textContent = hasQuery() ? 'Search results' : state.railFilter === 'high' ? 'High Priority' : state.railFilter !== 'all' ? STATUS_LABEL[state.railFilter] : 'Filtered items';
      $('#panelSub').textContent = plural(list.length, 'item') + ' matching across all dates';
    } else {
      list = sortTasks(dayAll);
      $('#panelTitle').textContent = fmtLong(sel);
      $('#panelSub').textContent = plural(dayAll.length, 'item') + ' planned';
    }
    if (list.length) list.forEach(function (t) { html += taskCard(t, today, searching); });
    else if (!state.tasks.length) html = emptyBlock(ICO_CAL, 'No action items yet', 'Add your first action item, or type one into Quick add above.', '<button class="btn btn-primary" type="button" data-act="add">New action item</button>');
    else if (searching) html = emptyBlock(ICO_SEARCH, 'No matching items', 'Nothing matches the current search or filter.', '<button class="btn" type="button" data-act="clearfilters">Reset filters</button>');
    else html = emptyBlock(ICO_CAL, 'Nothing planned for this day', 'Add an action item to plan your work for ' + esc(fmtLong(sel)) + '.', '<button class="btn btn-primary" type="button" data-act="add">New action item</button>');
    $('#panelList').innerHTML = html;
  }
  function renderFilterBar() {
    var n = activeFilterCount(), pill = $('#filterCount');
    pill.hidden = n === 0; pill.textContent = n;
    $('#matchCount').textContent = filteredAll().length + ' of ' + plural(state.tasks.length, 'task') + ' match your search and filters';
  }

  function daysSince(iso) { return iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : Infinity; }
  function renderBackupState() {
    var d = daysSince(settings.lastBackupAt);
    var when = $('#backupWhen');
    when.textContent = d === Infinity ? 'Last backup: never' : 'Last backup: ' + (d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago');
    var snoozed = settings.backupSnoozeUntil && Date.parse(settings.backupSnoozeUntil) > Date.now();
    var show = settings.backupNudge && state.tasks.length > 0 && d > 7 && !snoozed;
    $('#backupBanner').hidden = !show;
    if (show) $('#backupBannerText').textContent = d === Infinity
      ? 'You haven\'t downloaded a backup yet. Your action items only live in this browser.'
      : 'Your last backup was ' + d + ' days ago. Download a fresh one to keep your action items safe.';
  }

  function renderAll() {
    state.lastToday = todayISO();
    renderStats(); renderCalendar(); renderPanel(); renderFilterBar(); renderBackupState();
  }

  function toast(msg, type, ms, action) {
    var box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    var span = document.createElement('span'); span.textContent = msg; el.appendChild(span);
    if (action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', function () { if (el.parentNode) el.parentNode.removeChild(el); action.fn(); });
      el.appendChild(b);
    }
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    box.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 3000);
  }

  function confirmBox(title, msg, okText, danger, noCancel) {
    return new Promise(function (resolve) {
      var d = $('#confirmDlg');
      $('#confirmTitle').textContent = title;
      $('#confirmMsg').textContent = msg;
      var ok = $('#confirmOk'); ok.textContent = okText || 'OK';
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      $('#confirmCancel').style.display = noCancel ? 'none' : '';
      d.returnValue = '';
      d.addEventListener('close', function () { resolve(d.returnValue === 'ok'); }, { once: true });
      d.showModal();
    });
  }

  /* ---------- Repeat rule controls ---------- */
  var rec = { touched: {} };
  (function buildRecurrenceControls() {
    var i, h = '';
    for (i = 1; i <= 30; i++) h += '<option value="' + i + '">' + i + '</option>';
    $('#rEvery').innerHTML = h;
    h = ''; for (i = 1; i <= 31; i++) h += '<option value="' + i + '">' + i + '</option>';
    $('#rDay').innerHTML = h;
    $('#rYearMonth').innerHTML = MONTHS.map(function (m, k) { return '<option value="' + k + '">' + m + '</option>'; }).join('');
    $('#rDow').innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(function (l, k) {
      return '<button type="button" data-dow="' + k + '" aria-pressed="false" aria-label="' + DOW_FULL[k] + '" title="' + DOW_FULL[k] + '">' + l + '</button>';
    }).join('');
  })();
  function setDows(list) { $all('#rDow button').forEach(function (b) { b.setAttribute('aria-pressed', String(list.indexOf(Number(b.getAttribute('data-dow'))) >= 0)); }); }
  function getDows() { return $all('#rDow button').filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return Number(b.getAttribute('data-dow')); }); }
  function sixMonthsOn(iso) { var d = parseISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + 6, d.getDate())); }
  function applyStartDefaults(force) {
    var s = $('#tPlanned').value; if (!isISODate(s)) return;
    var d = parseISO(s), date = d.getDate(), t = rec.touched;
    if (force || !t.dow) setDows([d.getDay()]);
    if (force || !t.day) $('#rDay').value = String(date);
    if (force || !t.month) $('#rYearMonth').value = String(d.getMonth());
    if (force || !t.nth) { $('#rOrd').value = date > 28 ? '-1' : String(Math.ceil(date / 7)); $('#rKind').value = String(d.getDay()); }
    if (force || !t.end) $('#rEnd').value = sixMonthsOn(s);
  }
  function resetRuleForm() {
    rec.touched = {};
    $('#rFreq').value = 'weekly'; $('#rEvery').value = '1'; $('#rWeekdays').checked = false;
    $('#rOnDate').checked = true; $('#rEndMode').value = 'date'; $('#rCount').value = '10';
    clearRecErrors();
    applyStartDefaults(true);
  }
  function fillRuleForm(spec, lastDate) {
    $('#rFreq').value = spec.freq;
    $('#rEvery').value = String(Math.min(30, spec.interval));
    $('#rWeekdays').checked = !!spec.weekdaysOnly;
    setDows(spec.dows);
    (spec.onMode === 'nth' ? $('#rOnNth') : $('#rOnDate')).checked = true;
    $('#rDay').value = String(spec.day); $('#rOrd').value = String(spec.ord); $('#rKind').value = String(spec.kind);
    $('#rYearMonth').value = String(spec.month);
    if (spec.endMode === 'count') { $('#rEndMode').value = 'date'; $('#rEnd').value = lastDate || spec.start; }
    else { $('#rEndMode').value = spec.endMode; $('#rEnd').value = spec.end || sixMonthsOn(spec.start); }
    $('#rCount').value = String(spec.count || 10);
    rec.touched = { dow: 1, day: 1, month: 1, nth: 1, end: 1 };
    clearRecErrors();
  }
  function readRule() {
    var freq = $('#rFreq').value;
    return {
      freq: freq, interval: Math.max(1, parseInt($('#rEvery').value, 10) || 1),
      weekdaysOnly: freq === 'daily' && $('#rWeekdays').checked, dows: getDows(),
      onMode: $('#taskDlg').querySelector('input[name="rOnMode"]:checked').value,
      day: parseInt($('#rDay').value, 10) || 1, ord: parseInt($('#rOrd').value, 10) || 1,
      kind: $('#rKind').value, month: parseInt($('#rYearMonth').value, 10) || 0,
      start: $('#tPlanned').value, endMode: $('#rEndMode').value, end: $('#rEnd').value,
      count: parseInt($('#rCount').value, 10)
    };
  }
  function ruleProblem(r) {
    if (!isISODate(r.start)) return { field: 'Start', msg: 'Choose a valid start date.' };
    if (r.endMode === 'date') {
      if (!isISODate(r.end)) return { field: 'End', msg: 'Choose a valid end date.' };
      if (r.end < r.start) return { field: 'End', msg: 'The end date is before the start date.' };
    }
    if (r.endMode === 'count' && !(r.count >= 1 && r.count <= 500)) return { field: 'End', msg: 'Enter between 1 and 500 occurrences.' };
    if (r.freq === 'weekly' && !r.dows.length) return { field: 'Dow', msg: 'Pick at least one day of the week.' };
    return null;
  }
  function deadlineOffset() {
    var p = $('#tPlanned').value, d = $('#tDeadline').value;
    return isISODate(p) && isISODate(d) ? dayDiff(p, d) : 0;
  }
  function repeatOn() { return !$('#tRepeatBox').hidden && $('#tRepeat').checked; }
  function setRepeat(on) {
    $('#tRepeat').checked = on;
    $('#recPanel').hidden = !on;
    var seriesScope = state.editingId && state.editScope !== 'this';
    $('#tDoneWrap').hidden = on || seriesScope;
    $('#tPlannedLbl').textContent = on || seriesScope ? 'Starts on' : 'Planned date';
    $('#tDeadlineLbl').textContent = on || seriesScope ? 'First deadline' : 'Deadline';
    $('#taskSave').textContent = state.editingId ? (seriesScope ? 'Save series' : 'Save changes') : on ? 'Create series' : 'Save';
    syncRecurrenceUI();
  }
  function syncRecurrenceUI() {
    var r = readRule(), f = r.freq;
    if (!repeatOn()) { $('#tRepeatHint').textContent = 'Does not repeat'; return; }
    $all('#recPanel .rec-row').forEach(function (el) { el.hidden = el.getAttribute('data-show').split(' ').indexOf(f) < 0; });
    $('#rEvery').hidden = f === 'yearly';
    $('#rYearMonth').hidden = f !== 'yearly';
    $('#rEvery').disabled = r.weekdaysOnly;
    $('#rEveryUnit').textContent = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: '' }[f];
    $('#rEnd').hidden = r.endMode !== 'date';
    $('#rCountWrap').hidden = r.endMode !== 'count';
    var nth = r.onMode === 'nth';
    $('#rDay').disabled = nth; $('#rOrd').disabled = !nth; $('#rKind').disabled = !nth;
    var prob = ruleProblem(r), desc = prob ? '' : describeRule(QT.normaliseRule(r));
    $('#tRepeatHint').textContent = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : '';
    renderRecurrenceSummary(r, prob);
  }
  function seriesDates(r) {
    var rule = QT.normaliseRule(r);
    var dates = generateDates(rule, todayISO());
    if (state.editingId && state.editScope !== 'this' && state.editSeries && state.editSeries.doneDates) {
      var dd = state.editSeries.doneDates; dates = dates.filter(function (d) { return !dd[d]; });
    }
    return dates;
  }
  function renderRecurrenceSummary(r, prob) {
    var box = $('#rSummary');
    box.className = 'rec-summary';
    if (prob) { box.className += ' bad'; box.innerHTML = '<span class="count">' + esc(prob.msg) + '</span>'; return; }
    var rule = QT.normaliseRule(r), dates = seriesDates(r);
    var head = 'Occurs <b>' + esc(describeRule(rule)) + '</b> starting ' + esc(fmtFull(r.start));
    if (r.endMode === 'date') head += ' until ' + esc(fmtFull(r.end)) + '.';
    else if (r.endMode === 'count') head += ', ' + plural(r.count, 'time') + '.';
    else head += ', with no end date.';
    var line, off = deadlineOffset();
    if (!dates.length) { box.className += ' bad'; line = 'No dates match this pattern in the chosen range.'; }
    else if (dates.length > MAX_OCCURRENCES) { box.className += ' bad'; line = 'This creates more than ' + MAX_OCCURRENCES + ' action items.'; }
    else {
      line = plural(dates.length, 'action item') + ', ' + fmtShort(dates[0]) + (dates.length > 1 ? ' to ' + fmtShort(dates[dates.length - 1]) : '') + '.';
      line += off === 0 ? ' Each is due on its own date.' : off > 0 ? ' Each is due ' + plural(off, 'day') + ' after its date.' : '';
    }
    box.innerHTML = head + '<span class="count">' + esc(line) + '</span>';
  }
  function clearRecErrors() {
    ['End', 'Dow'].forEach(function (n) { $('#er' + n).textContent = ''; });
    ['#rEnd', '#rCount'].forEach(function (s) { $(s).classList.remove('invalid'); $(s).removeAttribute('aria-invalid'); });
  }
  function validateRecurrence() {
    clearRecErrors();
    var r = readRule(), prob = ruleProblem(r);
    if (prob) {
      if (prob.field === 'Start') { fieldError('Planned', prob.msg); $('#tPlanned').focus(); return false; }
      $('#er' + prob.field).textContent = prob.msg;
      var inp = prob.field === 'End' ? (r.endMode === 'count' ? $('#rCount') : $('#rEnd')) : $('#rDow button');
      if (prob.field === 'End') { inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true'); }
      inp.focus(); return false;
    }
    var n = seriesDates(r).length;
    if (!n) { $('#erEnd').textContent = 'No dates match this pattern.'; return false; }
    if (n > MAX_OCCURRENCES) { $('#erEnd').textContent = 'Too many occurrences.'; return false; }
    return true;
  }

  /* ---------- Task dialog ---------- */
  var taskDlg = $('#taskDlg');
  function clearErrors() {
    ['Title', 'Planned', 'Deadline', 'Time', 'EndTime'].forEach(function (n) {
      $('#e' + n).textContent = '';
      $('#t' + n).classList.remove('invalid'); $('#t' + n).removeAttribute('aria-invalid');
    });
    clearRecErrors();
  }
  function fieldError(name, msg) {
    $('#e' + name).textContent = msg;
    var inp = $('#t' + name); inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true');
  }
  function setPriority(p) {
    $('#tPriority').value = p;
    $all('#tPrioritySeg button').forEach(function (b) {
      var on = b.getAttribute('data-p') === p;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
  }
  function fillForm(t, defDate) {
    $('#tTitle').value = t ? t.title : '';
    $('#tPlanned').value = t ? t.plannedDate : defDate;
    $('#tDeadline').value = t ? t.deadline : defDate;
    $('#tTime').value = t ? t.time : '';
    $('#tEndTime').value = t ? t.endTime : '';
    state.endTouched = !!(t && t.endTime);
    setPriority(t ? t.priority : 'Medium');
    $('#tNotes').value = t ? t.notes : '';
    $('#tDone').checked = t ? t.done : false;
    $('#taskReset').hidden = !!t;
    $('#taskDelete').hidden = !t;
    $('#tScopeBox').hidden = !(t && t.seriesId);
    $('#tSeriesRule').textContent = t && t.seriesId ? 'Repeats: ' + (t.seriesRule || 'part of a series') : '';
    $('#tRepeatBox').classList.remove('series-edit');
    $('#tRepeatBox').hidden = !!t;
    resetRuleForm();
  }
  function seriesSpecFor(sid) {
    var items = seriesItems(sid);
    for (var i = items.length - 1; i >= 0; i--) if (items[i].seriesSpec) return items[i].seriesSpec;
    return null;
  }
  function setScope(scope) {
    var t = findTask(state.editingId); if (!t || !t.seriesId) return;
    state.editScope = scope;
    $all('#tScopeSeg button').forEach(function (b) {
      var on = b.getAttribute('data-scope') === scope;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    clearErrors();
    var items = seriesItems(t.seriesId), spec = seriesSpecFor(t.seriesId), offset = dayDiff(t.plannedDate, t.deadline);
    if (scope === 'this') {
      state.editSeries = null;
      $('#tPlanned').value = t.plannedDate; $('#tDeadline').value = t.deadline;
      $('#tRepeatBox').hidden = true;
      $('#tScopeNote').textContent = 'Changes apply to this occurrence only.';
      setRepeat(false);
      return;
    }
    var cutoff = scope === 'following' ? t.plannedDate : '';
    var inScope = items.filter(function (x) { return x.plannedDate >= cutoff; });
    var doneDates = {};
    inScope.forEach(function (x) { if (x.done) doneDates[x.plannedDate] = 1; });
    var anchor = scope === 'following' ? t.plannedDate : (spec && spec.start < items[0].plannedDate ? spec.start : items[0].plannedDate);
    $('#tPlanned').value = anchor;
    $('#tDeadline').value = addDays(anchor, spec ? spec.dueOffset : offset);
    var open = inScope.filter(function (x) { return !x.done; }).length, done = inScope.length - open;
    if (spec) {
      $('#tRepeatBox').hidden = false;
      $('#tRepeatBox').classList.add('series-edit');
      fillRuleForm(QT.normaliseRule(Object.assign({}, spec, { start: anchor })), items[items.length - 1].plannedDate);
      state.editSeries = { legacy: false, doneDates: doneDates, origKey: QT.ruleKey(QT.normaliseRule(readRule())), origStart: anchor, origOffset: dayDiff(anchor, $('#tDeadline').value) };
      $('#tScopeNote').textContent = (scope === 'following' ? 'Changes apply to this item and later ones' : 'Changes apply to the whole series') +
        ' (' + plural(open, 'open item') + ').';
      setRepeat(true);
    } else {
      $('#tRepeatBox').hidden = true;
      state.editSeries = { legacy: true, doneDates: doneDates };
      $('#tScopeNote').textContent = 'Changes apply to the details of ' + plural(open, 'open item') + '.';
      setRepeat(false);
    }
  }
  function openTaskModal(task, defDate, opts) {
    opts = opts || {};
    state.editingId = task ? task.id : null;
    state.editScope = 'this'; state.editSeries = null;
    state.deadlineTouched = !!task;
    $('#taskDlgTitle').textContent = task ? (task.seriesId ? 'Edit repeating action item' : 'Edit action item') : 'New action item';
    fillForm(task, defDate || state.selected);
    if (!task) {
      if (opts.date) { $('#tPlanned').value = opts.date; $('#tDeadline').value = opts.date; }
      if (isTime(opts.time)) { $('#tTime').value = opts.time; $('#tEndTime').value = addMinutes(opts.time, 30); }
      applyStartDefaults(true);
      setRepeat(!!opts.repeat);
    } else if (task.seriesId) setScope(opts.scope || 'this');
    else setRepeat(false);
    taskDlg.showModal();
    $('#tTitle').focus();
  }

  function submitTask(ev) {
    ev.preventDefault();
    clearErrors();
    var title = $('#tTitle').value.trim().replace(/\s+/g, ' ');
    var planned = $('#tPlanned').value, deadline = $('#tDeadline').value;
    var time = $('#tTime').value, endTime = $('#tEndTime').value;
    var firstBad = null, ok = true;
    function bad(name, msg, el) { fieldError(name, msg); firstBad = firstBad || el || $('#t' + name); ok = false; }
    if (!title) bad('Title', 'Please enter an action item.');
    if (!isISODate(planned)) bad('Planned', 'Choose a valid date.');
    if (!isISODate(deadline)) bad('Deadline', 'Choose a valid deadline.');
    if (time && !isTime(time)) bad('Time', 'Enter a valid time or leave it empty.');
    if (endTime && !isTime(endTime)) bad('EndTime', 'Enter a valid time or leave it empty.');
    else if (endTime && !time) bad('EndTime', 'Add a start time first.', $('#tTime'));
    else if (endTime && time && endTime <= time) bad('EndTime', 'End time must be after the start time.');
    if (!ok) { firstBad.focus(); return; }
    var seriesEdit = state.editingId && state.editScope !== 'this';
    if ((repeatOn() || (seriesEdit && state.editSeries && !state.editSeries.legacy)) && !validateRecurrence()) return;

    var f = { title: title, planned: planned, deadline: deadline, time: time, endTime: time ? endTime : '',
      priority: $('#tPriority').value, notes: $('#tNotes').value.trim(), done: $('#tDone').checked };
    var proceed = deadline < planned
      ? confirmBox('Deadline is before planned date', 'The deadline (' + fmtShort(deadline) + ') is earlier than ' + fmtShort(planned) + '.\nSave anyway?', 'Save anyway', false)
      : Promise.resolve(true);
    proceed.then(function (go) {
      if (!go) return;
      if (!state.editingId && repeatOn()) return createSeries(f);
      if (seriesEdit) return applySeriesEdit(f);
      saveSingle(f);
    });
  }
  function saveSingle(f) {
    var now = new Date().toISOString(), saved;
    if (state.editingId) {
      var t = findTask(state.editingId); if (!t) { taskDlg.close(); return; }
      var wasDone = t.done;
      t.title = f.title; t.plannedDate = f.planned; t.deadline = f.deadline; t.priority = f.priority; t.notes = f.notes;
      t.time = f.time; t.endTime = f.endTime;
      t.done = f.done; t.pending = f.done ? false : t.pending;
      if (f.done) t.movedTo = '';
      t.completedAt = f.done ? (wasDone && t.completedAt ? t.completedAt : now) : '';
      saved = saveTasks();
      if (saved) toast('Task updated');
    } else {
      var n = QT.makeTask({ title: f.title, plannedDate: f.planned, deadline: f.deadline, priority: f.priority, notes: f.notes, time: f.time, endTime: f.endTime });
      if (f.done) { n.done = true; n.completedAt = now; }
      state.tasks.push(n);
      saved = saveTasks();
      if (saved) toast('Task saved');
    }
    state.editingId = null;
    taskDlg.close();
    selectDate(f.planned, true);
  }

  /* ---------- Series ---------- */
  function buildRule(f) {
    var rule = QT.normaliseRule(readRule());
    rule.dueOffset = dayDiff(f.planned, f.deadline);
    return rule;
  }
  function finishRule(rule, dates) {
    rule.genUntil = rule.endMode === 'never' ? QT.openEndedHorizon(rule, rule.start > todayISO() ? rule.start : todayISO()) : '';
    return QT.ruleText(rule, dates[0], dates[dates.length - 1]);
  }
  function confirmMany(n, first, last) {
    return n > 100
      ? confirmBox('Create ' + n + ' action items?', 'This creates ' + n + ' separate action items between ' + fmtShort(first) + ' and ' + fmtShort(last) + '.', 'Create ' + n, false)
      : Promise.resolve(true);
  }
  function createSeries(f) {
    var rule = buildRule(f), dates = seriesDates(rule);
    confirmMany(dates.length, dates[0], dates[dates.length - 1]).then(function (go) {
      if (!go) return;
      var sid = 's_' + newId(), text = finishRule(rule, dates);
      state.tasks = state.tasks.concat(dates.map(function (d) {
        return QT.makeTask({ title: f.title, plannedDate: d, deadline: addDays(d, rule.dueOffset), priority: f.priority, notes: f.notes,
          time: f.time, endTime: f.endTime, seriesId: sid, seriesRule: text, seriesSpec: QT.clone(rule) });
      }));
      if (!saveTasks()) { state.tasks = state.tasks.filter(function (x) { return x.seriesId !== sid; }); renderAll(); return; }
      taskDlg.close();
      selectDate(dates[0], true);
      toast('Created ' + plural(dates.length, 'repeating action item'), '', 4000);
    });
  }
  function applySeriesEdit(f) {
    var t = findTask(state.editingId); if (!t) { taskDlg.close(); return; }
    var sid = t.seriesId, scope = state.editScope, items = seriesItems(sid), es = state.editSeries || { legacy: true };
    var cutoff = scope === 'following' ? t.plannedDate : '';
    var inScope = items.filter(function (x) { return x.plannedDate >= cutoff; });
    var offset = dayDiff(f.planned, f.deadline);
    var ids = items.map(function (x) { return x.id; });
    var sameRule = es.legacy || (QT.ruleKey(QT.normaliseRule(readRule())) === es.origKey && f.planned === es.origStart);

    if (sameRule) {
      var n = 0;
      undoable(ids, '', function () {
        inScope.forEach(function (x) {
          if (x.done) return;
          x.title = f.title; x.priority = f.priority; x.notes = f.notes; x.time = f.time; x.endTime = f.endTime;
          x.deadline = addDays(x.plannedDate, offset);
          if (x.seriesSpec) x.seriesSpec.dueOffset = offset;
          n++;
        });
      });
      taskDlg.close();
      toastUndoLast('Updated ' + plural(n, 'item') + ' in the series');
      return;
    }

    var rule = buildRule(f), dates = seriesDates(rule);
    confirmMany(dates.length, dates[0], dates[dates.length - 1]).then(function (go) {
      if (!go) return;
      var newSid = scope === 'all' ? sid : 's_' + newId(), text = finishRule(rule, dates);
      var removed = {}, keptDone = 0;
      inScope.forEach(function (x) { if (x.done) keptDone++; else removed[x.id] = 1; });
      undoable(ids, '', function () {
        state.tasks = state.tasks.filter(function (x) { return !removed[x.id]; });
        if (scope === 'following') QT.endSeriesBefore(state.tasks, sid, cutoff);
        else state.tasks.forEach(function (x) { if (x.seriesId === sid) { x.seriesSpec = QT.clone(rule); x.seriesRule = text; } });
        dates.forEach(function (d) {
          state.tasks.push(QT.makeTask({ title: f.title, plannedDate: d, deadline: addDays(d, offset), priority: f.priority, notes: f.notes,
            time: f.time, endTime: f.endTime, seriesId: newSid, seriesRule: text, seriesSpec: QT.clone(rule) }));
        });
      });
      taskDlg.close();
      selectDate(dates[0], true);
      toastUndoLast('Series updated: ' + plural(dates.length, 'item'));
    });
  }
  var lastUndo = null;
  function toastUndoLast(msg) {
    var u = lastUndo; lastUndo = null;
    toast(msg, '', 7000, u ? { label: 'Undo', fn: u } : null);
  }

  function deleteFromSeries(t, preset) {
    var d = $('#seriesDelDlg'), all = seriesItems(t.seriesId);
    var following = all.filter(function (x) { return x.plannedDate >= t.plannedDate; });
    var doneCount = all.filter(function (x) { return x.done; }).length;
    $('#seriesDelMsg').textContent = '“' + t.title + '” on ' + fmtShort(t.plannedDate) + ' is part of a repeating series.';
    $('#sdOneDesc').textContent = 'Deletes just the item on ' + fmtShort(t.plannedDate) + '.';
    $('#sdFollowDesc').textContent = 'Deletes ' + plural(following.length, 'item') + ' from ' + fmtShort(t.plannedDate) + ' onwards.';
    $('#sdAllDesc').textContent = 'Deletes all ' + plural(all.length, 'item') + (doneCount ? ', including ' + doneCount + ' completed' : '') + '.';
    d.querySelector('input[value="' + (preset || 'one') + '"]').checked = true;
    d.returnValue = '';
    d.addEventListener('close', function () {
      if (d.returnValue !== 'ok') return;
      var mode = d.querySelector('input[name="seriesDelMode"]:checked').value, before = state.tasks.length;
      undoable(all.map(function (x) { return x.id; }), '', function () { state.tasks = QT.deleteFromSeries(state.tasks, t, mode); });
      toastUndoLast(plural(before - state.tasks.length, 'item') + ' deleted');
      if ($('#seriesDlg').open) renderSeriesList();
    }, { once: true });
    d.showModal();
  }

  function renderSeriesList() {
    var today = todayISO(), groups = {};
    state.tasks.forEach(function (t) { if (t.seriesId) (groups[t.seriesId] = groups[t.seriesId] || []).push(t); });
    var rows = Object.keys(groups).map(function (sid) {
      var items = groups[sid].sort(function (a, b) { return a.plannedDate < b.plannedDate ? -1 : 1; });
      var upcoming = items.filter(function (x) { return !x.done && x.plannedDate >= today; });
      var anchor = upcoming[0] || items[items.length - 1];
      return { sid: sid, items: items, upcoming: upcoming, anchor: anchor, done: items.filter(function (x) { return x.done; }).length };
    });
    $('#seriesList').innerHTML = rows.length ? rows.map(function (r) {
      var a = r.anchor;
      return '<div class="series-row" data-id="' + esc(a.id) + '">' +
        '<b>' + esc(a.title) + (a.time ? ' <span class="opt">' + esc(timeRange(a)) + '</span>' : '') + '</b>' +
        '<div class="group"><button type="button" class="btn btn-sm" data-act="edit-series">Edit series</button><button type="button" class="btn btn-sm btn-danger-ghost" data-act="delete-series">Delete</button></div>' +
        '<div class="rule">' + esc(a.seriesRule || 'Repeating series') + '</div>' +
        '<div class="facts">' + (r.upcoming.length ? 'Next: ' + esc(fmtDay(r.upcoming[0].plannedDate)) + ' · ' + plural(r.upcoming.length, 'upcoming item') : 'No upcoming items') + '</div></div>';
    }).join('') : emptyBlock(ICO_REPEAT, 'No repeating items', 'Switch on Repeat when you create an action item to make a series.', '');
  }
  function openSeriesManager() { renderSeriesList(); $('#seriesDlg').showModal(); }

  /* ---------- Single-item actions ---------- */
  function selectDate(iso, followMonth) {
    state.selected = iso;
    if (followMonth) { var d = parseISO(iso); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); }
    renderAll();
  }
  function toggleTask(id, checked) {
    var t = findTask(id); if (!t) return;
    undoable([id], checked ? 'Completed “' + t.title + '”' : 'Reopened “' + t.title + '”', function () {
      t.done = checked; t.pending = false; t.movedTo = '';
      t.completedAt = checked ? new Date().toISOString() : '';
    });
  }
  function markPending(id, on) {
    var t = findTask(id); if (!t || (on && t.done)) return;
    undoable([id], on ? 'Marked as pending' : 'Pending mark removed', function () { t.pending = on; if (!on) t.movedTo = ''; });
  }
  function moveTaskToNextDay(id) {
    var t = findTask(id); if (!t || hasMovedCopy(t)) return;
    var next = nextBusinessDay(t.plannedDate);
    undoable([id], 'Copied to ' + fmtDay(next) + '; original marked pending', function () {
      var copy = QT.makeTask({ title: t.title, plannedDate: next, deadline: t.deadline === t.plannedDate ? next : t.deadline, priority: t.priority,
        notes: t.notes, time: t.time, endTime: t.endTime, seriesId: t.seriesId, seriesRule: t.seriesRule, seriesSpec: t.seriesSpec ? QT.clone(t.seriesSpec) : null });
      state.tasks.push(copy);
      t.pending = true; t.movedTo = copy.id;
    });
    selectDate(next, true);
  }
  function deleteTask(id) {
    var t = findTask(id); if (!t) return;
    if (t.seriesId && state.tasks.some(function (x) { return x !== t && x.seriesId === t.seriesId; })) { deleteFromSeries(t); return; }
    undoable([id], 'Deleted “' + t.title + '”', function () { state.tasks = state.tasks.filter(function (x) { return x.id !== id; }); });
  }
  function moveTask(id, to) {
    var t = findTask(id); if (!t) return;
    var newTime = to.clearTime ? '' : (to.time !== undefined ? to.time : t.time);
    if (to.date === t.plannedDate && newTime === t.time) return;
    var dur = t.time && t.endTime ? toMin(t.endTime) - toMin(t.time) : 30;
    var shift = dayDiff(t.plannedDate, to.date);
    var label = fmtDay(to.date) + (newTime ? ' at ' + newTime : '');
    undoable([id], 'Moved to ' + label, function () {
      t.plannedDate = to.date;
      t.deadline = addDays(t.deadline, shift);
      t.time = newTime;
      t.endTime = newTime ? (toMin(newTime) + dur <= 23 * 60 + 59 ? addMinutes(newTime, dur) : '23:59') : '';
      if (t.endTime && t.endTime <= t.time) t.endTime = '';
    });
  }
  function resizeTask(id, endMin) {
    var t = findTask(id); if (!t || !t.time) return;
    var end = fromMin(Math.max(toMin(t.time) + 15, endMin));
    if (end === t.endTime) return;
    undoable([id], 'Now ends at ' + end, function () { t.endTime = end; });
  }

  /* ---------- CSV & Backup ---------- */
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCsv(list) {
    var today = todayISO();
    var rows = [['Task ID', 'Title', 'Planned Date', 'Start Time', 'End Time', 'Expected Deadline', 'Status', 'Priority', 'Notes', 'Completed', 'Created At', 'Completed At', 'Repeats']];
    list.forEach(function (t) {
      rows.push([t.id, t.title, t.plannedDate, t.time, t.endTime, t.deadline, STATUS_LABEL[statusKey(t, today)], t.priority, t.notes, t.done ? 'Yes' : 'No', t.createdAt, t.completedAt, t.seriesId ? (t.seriesRule || 'Yes') : '']);
    });
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  }
  function exportCsv(filteredOnly) {
    var list = filteredOnly ? filteredAll() : state.tasks.slice().sort(function (a, b) { return cmpWhen(a, b) || cmpDeadline(a, b) || tie(a, b); });
    if (!list.length) { toast('There are no tasks to export yet.', 'warn'); return; }
    download('QuickTick_action_items' + (filteredOnly ? '_filtered' : '') + '_' + todayISO() + '.csv', buildCsv(list), 'text/csv;charset=utf-8');
    toast('CSV exported (' + plural(list.length, 'task') + ')');
  }
  function backupDownload(silent) {
    var now = new Date(), stamp = todayISO() + '_' + pad(now.getHours()) + pad(now.getMinutes());
    download('QuickTick_backup_' + stamp + '.json', JSON.stringify({
      app: APP, formatVersion: FORMAT_VERSION, exportedAt: now.toISOString(), taskCount: state.tasks.length, tasks: state.tasks
    }, null, 2), 'application/json');
    saveSettings({ lastBackupAt: now.toISOString(), backupSnoozeUntil: '' });
    if (!silent) toast('Backup downloaded (' + plural(state.tasks.length, 'task') + ')');
  }
  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'The file is not valid JSON.' }; }
    if (!data || Array.isArray(data) || typeof data !== 'object') return { error: 'The backup does not contain a task list.' };
    if (data.app !== APP) return { error: 'This file is not a QuickTick backup.' };
    if (!Array.isArray(data.tasks)) return { error: 'The backup does not contain a task list.' };
    var out = [], seen = {}, errors = [];
    data.tasks.forEach(function (x, i) {
      var r = QT.validateTask(x);
      if (!r.task) { errors.push('Task #' + (i + 1) + ': ' + r.err); return; }
      if (seen[r.task.id]) { errors.push('Task #' + (i + 1) + ': duplicate id'); return; }
      seen[r.task.id] = 1; out.push(r.task);
    });
    if (errors.length) return { error: 'Invalid records in backup file.' };
    return { tasks: out };
  }
  function handleRestoreFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = parseBackup(String(reader.result));
      if (res.error) { confirmBox('Backup could not be restored', res.error, 'OK', false, true); return; }
      showRestoreDialog(res.tasks, file.name);
    };
    reader.readAsText(file);
  }
  function showRestoreDialog(incoming, name) {
    var d = $('#restoreDlg'), existing = {};
    state.tasks.forEach(function (t) { existing[t.id] = 1; });
    var overlap = incoming.filter(function (t) { return existing[t.id]; }).length;
    var fresh = incoming.length - overlap, current = state.tasks.length;
    $('#restoreSummary').textContent = '“' + name + '” contains ' + plural(incoming.length, 'task') + '. You currently have ' + plural(current, 'task') + '.';
    $('#mergeDesc').textContent = 'Adds ' + fresh + ' new, updates ' + overlap + ' existing and keeps your other ' + (current - overlap) + '.';
    $('#replaceDesc').textContent = 'Deletes all ' + plural(current, 'current task') + ' and replaces them with the ' + incoming.length + ' from the file.';
    d.querySelector('input[value="merge"]').checked = true;
    $('#restoreSafety').checked = true;
    d.returnValue = '';
    d.addEventListener('close', function () {
      if (d.returnValue !== 'ok') return;
      var mode = d.querySelector('input[name="restoreMode"]:checked').value;
      if (current && $('#restoreSafety').checked) backupDownload(true);
      if (mode === 'replace') state.tasks = incoming.slice();
      else {
        var map = {}; state.tasks.forEach(function (t) { map[t.id] = t; });
        incoming.forEach(function (t) { map[t.id] = t; });
        state.tasks = Object.keys(map).map(function (k) { return map[k]; });
      }
      saveTasks();
      renderAll();
      toast('Backup restored (' + plural(state.tasks.length, 'task') + ')');
    }, { once: true });
    d.showModal();
  }

  /* ---------- Filters & Left Rail ---------- */
  function syncFiltersFromUI() {
    state.f.q = $('#search').value;
    state.f.from = $('#fFrom').value; state.f.to = $('#fTo').value;
    state.f.status = $('#fStatus').value; state.f.priority = $('#fPriority').value; state.f.sort = $('#fSort').value;
    renderStats(); renderPanel(); renderFilterBar();
  }
  function clearFilters() {
    $('#fFrom').value = ''; $('#fTo').value = ''; $('#fStatus').value = 'all'; $('#fPriority').value = 'all'; $('#fSort').value = 'time';
    state.f.from = ''; state.f.to = ''; state.f.status = 'all'; state.f.priority = 'all'; state.f.sort = 'time';
    state.railFilter = 'all';
    renderStats(); renderPanel(); renderFilterBar();
  }

  /* ---------- Dropdown menus ---------- */
  var menus = [];
  function setupMenu(btn, menu) {
    function items() { return $all('[role^="menuitem"]', menu); }
    var api = {
      open: function (idx) {
        menus.forEach(function (m) { if (m !== api) m.close(false); });
        menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
        var list = items();
        list[((idx || 0) + list.length) % list.length].focus();
      },
      close: function (refocus) {
        if (menu.hidden) return;
        menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
        if (refocus) btn.focus();
      },
      wrap: btn.closest('.menu-wrap')
    };
    btn.addEventListener('click', function () { if (menu.hidden) api.open(); else api.close(false); });
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); api.close(true); }
    });
    menus.push(api);
    return api;
  }
  document.addEventListener('click', function (e) { menus.forEach(function (m) { if (!m.wrap.contains(e.target)) m.close(false); }); });
  var backupMenu = setupMenu($('#btnBackupMenu'), $('#backupMenu'));
  var viewMenu = setupMenu($('#btnView'), $('#viewMenu'));

  /* ---------- Views & navigation ---------- */
  function setView(v, save) {
    state.view = VIEW_LABEL[v] ? v : 'month';
    if (save) ls(VIEW_KEY, state.view);
    var item = $('#viewMenu [data-view="' + state.view + '"]');
    $all('#viewMenu [data-view]').forEach(function (b) { b.setAttribute('aria-checked', String(b === item)); });
    $('#viewLabel').textContent = state.view === 'workweek' ? 'Work week' : 'More';
    if (state.view === 'month') { var d = parseISO(state.selected); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); }
    tgScrollKey = '';
    renderCalendar();
  }
  function setMonthWeekends(on) {
    state.monthWeekends = on;
    ls(WEEKENDS_KEY, on ? '1' : '0');
    $('#viewWeekends').setAttribute('aria-checked', String(on));
    renderCalendar();
  }
  function navigate(dir) {
    if (state.view === 'month') {
      var d = new Date(state.viewY, state.viewM + dir, 1); state.viewY = d.getFullYear(); state.viewM = d.getMonth();
      renderCalendar(); return;
    }
    selectDate(state.view === 'day' ? QT.stepWeekday(state.selected, dir) : addDays(state.selected, 7 * dir), true);
  }

  /* ---------- Quick add ---------- */
  function renderQuickPreview() {
    var v = $('#quickInput').value, box = $('#quickPreview');
    if (!v.trim()) {
      box.innerHTML = '<span>Target: <b>' + esc(fmtDay(state.selected)) + '</b> · Try <span class="tag hi">!high</span> <span class="tag dt">tomorrow</span></span>';
      return;
    }
    var p = QT.parseQuick(v, todayISO()), tags = [];
    tags.push(fmtDay(p.date || state.selected));
    if (p.time) tags.push(timeRange(p));
    if (p.deadline) tags.push('due ' + fmtDay(p.deadline));
    tags.push(p.priority || 'Medium');
    box.innerHTML = (p.title ? '<span class="tag">' + esc(p.title) + '</span>' : '<span>Add a title</span>') +
      tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
  }
  function submitQuick(e) {
    e.preventDefault();
    var p = QT.parseQuick($('#quickInput').value, todayISO());
    if (!p.title) { toast('Type what needs doing, then any date, time or priority.', 'warn'); return; }
    var date = p.date || state.selected, n = QT.makeTask({ title: p.title.slice(0, QT.MAX_TITLE), plannedDate: date,
      deadline: p.deadline || date, priority: p.priority || 'Medium', time: p.time, endTime: p.endTime });
    undoable([], 'Added “' + n.title + '” to ' + fmtDay(date) + (n.time ? ' at ' + n.time : ''), function () { state.tasks.push(n); });
    $('#quickInput').value = '';
    if (date !== state.selected) selectDate(date, true);
    renderQuickPreview();
  }

  /* ---------- Drag and drop ---------- */
  var drag = null, suppressClick = false;
  function snap15(m) { return Math.max(0, Math.min(24 * 60, Math.round(m / 15) * 15)); }
  function dragStart(e, id, mode, el) {
    if (e.button !== 0 || e.target.closest('input,a,[data-act="toggle"]')) return;
    var t = findTask(id); if (!t) return;
    var grab = 0;
    if (mode === 'move' && el.classList.contains('tg-item')) grab = (e.clientY - el.getBoundingClientRect().top) / HOUR_PX * 60;
    drag = { id: id, mode: mode, el: el, t: t, x0: e.clientX, y0: e.clientY, started: false, grab: grab, target: null };
  }
  function clearDropMarks() {
    $all('.drop-target').forEach(function (x) { x.classList.remove('drop-target'); });
    $all('.tg-drop').forEach(function (x) { x.parentNode.removeChild(x); });
  }
  function dragMove(e) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
      drag.started = true;
      document.body.classList.add('is-dragging');
      if (drag.mode === 'move') {
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'drag-ghost';
        drag.ghost.textContent = (drag.t.time ? drag.t.time + '  ' : '') + drag.t.title;
        document.body.appendChild(drag.ghost);
      }
    }
    e.preventDefault();
    if (drag.mode === 'resize') {
      var col = drag.el.closest('.tg-col'), start = toMin(drag.t.time);
      var end = snap15((e.clientY - col.getBoundingClientRect().top) / HOUR_PX * 60);
      drag.endMin = Math.max(start + 15, Math.min(23 * 60 + 59, end));
      drag.el.style.height = ((drag.endMin - start) / 60 * HOUR_PX - 2) + 'px';
      drag.el.querySelector('small').textContent = drag.t.time + '–' + fromMin(drag.endMin);
      return;
    }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    clearDropMarks();
    var under = document.elementFromPoint(e.clientX, e.clientY), target = null, mark = null;
    if (under) {
      var day = under.closest('#calGrid .day'), ad = under.closest('.tg-ad'), dh = under.closest('.tg-dh'), colEl = under.closest('.tg-col');
      if (day) { target = { date: day.getAttribute('data-date') }; mark = day; }
      else if (ad) { target = { date: ad.getAttribute('data-date'), clearTime: true }; mark = ad; }
      else if (dh) { target = { date: dh.getAttribute('data-date') }; mark = dh; }
      else if (colEl) {
        var mins = snap15((e.clientY - colEl.getBoundingClientRect().top) / HOUR_PX * 60 - drag.grab);
        mins = Math.min(mins, 23 * 60 + 45);
        var dur = drag.t.time && drag.t.endTime ? toMin(drag.t.endTime) - toMin(drag.t.time) : 30;
        target = { date: colEl.getAttribute('data-date'), time: fromMin(mins) };
        var box = document.createElement('div');
        box.className = 'tg-drop';
        box.style.top = (mins / 60 * HOUR_PX) + 'px';
        box.style.height = Math.max(dur / 60 * HOUR_PX - 2, 20) + 'px';
        box.textContent = target.time;
        colEl.appendChild(box);
      }
    }
    if (mark) mark.classList.add('drop-target');
    drag.target = target;
  }
  function dragEnd() {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.started) return;
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 0);
    document.body.classList.remove('is-dragging');
    if (d.ghost) d.ghost.parentNode.removeChild(d.ghost);
    clearDropMarks();
    if (d.mode === 'resize') { if (d.endMin !== undefined) resizeTask(d.id, d.endMin); else renderCalendar(); return; }
    if (d.target) moveTask(d.id, d.target); else renderCalendar();
  }
  document.addEventListener('pointermove', dragMove);
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', function () { if (drag) { drag.target = null; drag.endMin = undefined; dragEnd(); } });
  document.addEventListener('click', function (e) { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } }, true);
  $('#calGrid').addEventListener('pointerdown', function (e) { var c = e.target.closest('.chip[data-id]'); if (c) dragStart(e, c.getAttribute('data-id'), 'move', c); });
  $('#tgAllDay').addEventListener('pointerdown', function (e) { var c = e.target.closest('.chip[data-id]'); if (c) dragStart(e, c.getAttribute('data-id'), 'move', c); });
  $('#tgBody').addEventListener('pointerdown', function (e) {
    var it = e.target.closest('.tg-item'); if (!it) return;
    dragStart(e, it.getAttribute('data-id'), e.target.closest('[data-act="resize"]') ? 'resize' : 'move', it);
  });
  $('#panelList').addEventListener('pointerdown', function (e) {
    var title = e.target.closest('.task-title'); if (!title) return;
    var card = title.closest('.task'); dragStart(e, card.getAttribute('data-id'), 'move', card);
  });

  /* ---------- Settings & help ---------- */
  function renderSettingsDialog() {
    $('#setReminder').value = String(settings.reminderLead);
    $all('#setTheme button').forEach(function (b) {
      var on = b.getAttribute('data-theme') === settings.theme;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    $('#setBackupNudge').checked = settings.backupNudge;
  }
  $('#btnSettings').addEventListener('click', function () { renderSettingsDialog(); $('#settingsDlg').showModal(); });
  $('#settingsClose').addEventListener('click', function () { $('#settingsDlg').close(); });
  $('#setReminder').addEventListener('change', function () { saveSettings({ reminderLead: Number(this.value) }); });
  $('#setTheme').addEventListener('click', function (e) { var b = e.target.closest('[data-theme]'); if (b) saveSettings({ theme: b.getAttribute('data-theme') }); });
  $('#setBackupNudge').addEventListener('change', function () { saveSettings({ backupNudge: this.checked }); });
  $('#setTestNotify').addEventListener('click', function () {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try { chrome.runtime.sendMessage({ type: 'QuickTick_TEST_NOTIFY' }); } catch (err) {}
      toast('Test notification sent.');
    }
  });
  $('#btnHelp').addEventListener('click', function () { $('#helpDlg').showModal(); });
  $('#helpClose').addEventListener('click', function () { $('#helpDlg').close(); });
  $('#seriesClose').addEventListener('click', function () { $('#seriesDlg').close(); });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = e.target, tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) {
      if (e.key === 'Escape' && (el.id === 'quickInput' || el.id === 'search')) el.blur();
      return;
    }
    if (document.querySelector('dialog[open]')) return;
    var k = e.key === '?' ? '?' : e.key.toLowerCase(), done = true;
    if (k === 'n') openTaskModal(null, state.selected);
    else if (k === 'a') $('#quickInput').focus();
    else if (k === '/') $('#search').focus();
    else if (k === 't') selectDate(todayISO(), true);
    else if (k === '[') navigate(-1);
    else if (k === ']') navigate(1);
    else if (k === 'd') setView('day', true);
    else if (k === 'w') setView('workweek', true);
    else if (k === 'e') setView('week', true);
    else if (k === 'm') setView('month', true);
    else if (k === 'f') $('#btnFilters').click();
    else if (k === '?') $('#helpDlg').showModal();
    else done = false;
    if (done) e.preventDefault();
  });

  /* ---------- Events ---------- */
  $('#btnToday').addEventListener('click', function () { $('#search').value = ''; state.f.q = ''; clearFilters(); selectDate(todayISO(), true); renderQuickPreview(); });
  $('#btnSeries').addEventListener('click', openSeriesManager);
  $('#btnExportFiltered').addEventListener('click', function () { exportCsv(true); });
  $('#btnExport').addEventListener('click', function () { backupMenu.close(true); exportCsv(false); });
  $('#btnBackup').addEventListener('click', function () { backupMenu.close(true); backupDownload(false); });
  $('#btnRestore').addEventListener('click', function () { backupMenu.close(true); $('#restoreFile').click(); });
  $('#restoreFile').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; handleRestoreFile(f); });
  $('#bannerBackup').addEventListener('click', function () { backupDownload(false); });
  $('#bannerLater').addEventListener('click', function () { saveSettings({ backupSnoozeUntil: new Date(Date.now() + 86400000).toISOString() }); });
  $('#btnAdd').addEventListener('click', function () { openTaskModal(null, state.selected); });
  $('#btnPanelAdd').addEventListener('click', function () { openTaskModal(null, state.selected); });
  $('#quickForm').addEventListener('submit', submitQuick);
  $('#quickInput').addEventListener('input', renderQuickPreview);

  $('#viewPills').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) setView(b.getAttribute('data-view'), true);
  });
  $('#viewMenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) { viewMenu.close(true); setView(b.getAttribute('data-view'), true); return; }
    if (e.target.closest('#viewWeekends')) { setMonthWeekends(!state.monthWeekends); if (state.view !== 'month') setView('month', true); }
  });
  $('#calNoteBtn').addEventListener('click', function () {
    if (this.getAttribute('data-action') === 'weekends') setMonthWeekends(true); else setView('week', true);
  });
  $('#btnPrev').addEventListener('click', function () { navigate(-1); });
  $('#btnNext').addEventListener('click', function () { navigate(1); });
  $all('#statsScope [data-scope]').forEach(function (b) {
    b.addEventListener('click', function () { state.scope = b.getAttribute('data-scope'); ls(SCOPE_KEY, state.scope); renderStats(); });
  });

  $('#btnFilters').addEventListener('click', function () {
    var open = this.getAttribute('aria-expanded') === 'true';
    this.setAttribute('aria-expanded', String(!open));
    $('#filters').hidden = open;
  });
  $('#search').addEventListener('input', syncFiltersFromUI);
  ['#fFrom', '#fTo', '#fStatus', '#fPriority', '#fSort'].forEach(function (s) {
    $(s).addEventListener('input', syncFiltersFromUI);
    $(s).addEventListener('change', syncFiltersFromUI);
  });
  $('#btnClearFilters').addEventListener('click', clearFilters);



  $('#calGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b) return;
    selectDate(b.getAttribute('data-date'), b.classList.contains('other'));
  });
  $('#calGrid').addEventListener('dblclick', function (e) { var b = e.target.closest('.day'); if (b) openTaskModal(null, b.getAttribute('data-date')); });

  $('#tgHead').addEventListener('click', function (e) { var b = e.target.closest('.tg-dh'); if (b) selectDate(b.getAttribute('data-date'), true); });
  $('#tgAllDay').addEventListener('click', function (e) {
    var c = e.target.closest('.chip[data-id]');
    if (c) { var t = findTask(c.getAttribute('data-id')); if (t) openTaskModal(t); return; }
    var ad = e.target.closest('.tg-ad'); if (ad) openTaskModal(null, ad.getAttribute('data-date'));
  });
  $('#tgBody').addEventListener('click', function (e) {
    if (e.target.closest('input[data-act="toggle"]')) return;
    var it = e.target.closest('.tg-item');
    if (it) { var t = findTask(it.getAttribute('data-id')); if (t) openTaskModal(t); return; }
    var col = e.target.closest('.tg-col');
    if (col) openTaskModal(null, col.getAttribute('data-date'), { date: col.getAttribute('data-date'), time: fromMin(Math.floor(slotAt(col, e.clientY) / 30) * 30) });
  });
  $('#tgBody').addEventListener('change', function (e) {
    if (e.target.getAttribute('data-act') === 'toggle') toggleTask(e.target.closest('.tg-item').getAttribute('data-id'), e.target.checked);
  });

  $('#panelList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var act = btn.getAttribute('data-act'), card = btn.closest('.task'), id = card ? card.getAttribute('data-id') : null;
    if (act === 'edit') { var t = findTask(id); if (t) openTaskModal(t); }
    else if (act === 'pending') markPending(id, true);
    else if (act === 'unpending') markPending(id, false);
    else if (act === 'nextday') moveTaskToNextDay(id);
    else if (act === 'delete') deleteTask(id);
    else if (act === 'goto') selectDate(btn.getAttribute('data-date'), true);
    else if (act === 'add') openTaskModal(null, state.selected);
    else if (act === 'clearfilters') { $('#search').value = ''; clearFilters(); }
  });
  $('#panelList').addEventListener('change', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'toggle') toggleTask(el.closest('.task').getAttribute('data-id'), el.checked);
  });

  $('#seriesList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var t = findTask(b.closest('.series-row').getAttribute('data-id')); if (!t) return;
    if (b.getAttribute('data-act') === 'edit-series') { $('#seriesDlg').close(); openTaskModal(t, null, { scope: 'all' }); }
    else deleteFromSeries(t, 'all');
  });

  $('#taskForm').addEventListener('submit', submitTask);
  $('#taskClose').addEventListener('click', function () { taskDlg.close(); });
  $('#taskCancel').addEventListener('click', function () { taskDlg.close(); });
  $('#taskDelete').addEventListener('click', function () {
    var t = findTask(state.editingId), scope = state.editScope; taskDlg.close();
    if (!t) return;
    if (t.seriesId && scope !== 'this') deleteFromSeries(t, scope); else deleteTask(t.id);
  });
  $('#taskReset').addEventListener('click', function () {
    clearErrors();
    var d = state.selected;
    $('#tTitle').value = ''; $('#tNotes').value = ''; setPriority('Medium'); $('#tDone').checked = false;
    $('#tTime').value = ''; $('#tEndTime').value = ''; state.endTouched = false;
    $('#tPlanned').value = d; $('#tDeadline').value = d; state.deadlineTouched = false;
    resetRuleForm(); setRepeat(false);
    $('#tTitle').focus();
  });
  $('#tScopeSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-scope]'); if (b) setScope(b.getAttribute('data-scope')); });
  $('#tDeadline').addEventListener('input', function () { state.deadlineTouched = true; });
  $('#tPlanned').addEventListener('input', function () {
    if (!state.deadlineTouched && !state.editingId && isISODate(this.value)) $('#tDeadline').value = this.value;
    applyStartDefaults(false);
    syncRecurrenceUI();
  });
  $('#tTime').addEventListener('focus', function () { state.prevTime = this.value; });
  $('#tTime').addEventListener('input', function () {
    var v = this.value, end = $('#tEndTime').value, prev = state.prevTime;
    if (isTime(v) && isTime(prev) && isTime(end) && end > prev) $('#tEndTime').value = addMinutes(v, toMin(end) - toMin(prev));
    else if (isTime(v) && (!state.endTouched || !isTime(end) || end <= v)) $('#tEndTime').value = addMinutes(v, 30);
    else if (!v && !state.endTouched) $('#tEndTime').value = '';
    if (isTime(v)) state.prevTime = v;
  });
  $('#tEndTime').addEventListener('input', function () { state.endTouched = !!this.value; });
  $('#tPrioritySeg').addEventListener('click', function (e) { var b = e.target.closest('button[data-p]'); if (b) setPriority(b.getAttribute('data-p')); });
  $('#tRepeat').addEventListener('change', function () { setRepeat(this.checked); });
  $('#rDow').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-dow]'); if (!b) return;
    b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
    rec.touched.dow = true; $('#erDow').textContent = '';
    syncRecurrenceUI();
  });
  ['input', 'change'].forEach(function (ev) {
    $('#recPanel').addEventListener(ev, syncRecurrenceUI);
    $('#tDeadline').addEventListener(ev, syncRecurrenceUI);
  });

  state.tasks = loadTasks();
  $('#viewWeekends').setAttribute('aria-checked', String(state.monthWeekends));
  setView(state.view, false);
  renderSettingsDialog();
  renderAll();
  renderQuickPreview();

  if (HAS_CHROME) {
    var applyShared = function (raw) {
      if (!Array.isArray(raw)) return;
      var cleaned = QT.cleanList(raw).tasks;
      if (JSON.stringify(cleaned) === JSON.stringify(state.tasks)) return;
      state.tasks = cleaned;
      try { if (storage) storage.setItem(KEY, JSON.stringify(cleaned)); } catch (e) {}
      renderAll();
      if ($('#seriesDlg').open) renderSeriesList();
      setStorageStatus(true, 'Synced ' + plural(cleaned.length, 'task') + ' with QuickTick');
    };
    chrome.storage.local.get([KEY, LEGACY_KEY, SETTINGS_KEY], function (result) {
      if (result && result[SETTINGS_KEY]) { settings = QT.normaliseSettings(result[SETTINGS_KEY]); ls(SETTINGS_KEY, JSON.stringify(settings)); applySettings(); }
      var shared = result && result[KEY];
      if (!Array.isArray(shared) && result && Array.isArray(result[LEGACY_KEY])) shared = result[LEGACY_KEY];
      if (Array.isArray(shared)) applyShared(shared);
      else if (state.tasks.length) { var mig = {}; mig[KEY] = state.tasks; chrome.storage.local.set(mig); }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes[KEY] && Array.isArray(changes[KEY].newValue)) applyShared(changes[KEY].newValue);
      if (changes[SETTINGS_KEY] && changes[SETTINGS_KEY].newValue) {
        settings = QT.normaliseSettings(changes[SETTINGS_KEY].newValue);
        ls(SETTINGS_KEY, JSON.stringify(settings));
        applySettings();
      }
    });
  }
})();
