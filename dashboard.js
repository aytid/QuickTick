(function () {
  'use strict';

  /* ---------- Constants & helpers ---------- */
  var KEY = 'QuickTick_action_items_v1';
  var LEGACY_KEY = 'daymark_action_items_v1'; // pre-1.3.9 storage key, read once for migration
  var APP = 'QuickTick';
  var FORMAT_VERSION = 1;
  var PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
  var PRANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  var STATUS_LABEL = { open: 'Open', overdue: 'Overdue', soon: 'Due soon', done: 'Completed', pending: 'Pending' };
  var STATUS_RANK = { overdue: 0, soon: 1, open: 2, pending: 3, done: 4 };
  var MAX_TITLE = 120, MAX_NOTES = 2000;

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayISO() { return toISO(new Date()); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
  function dayDiff(a, b) { // whole local days from a to b
    var A = parseISO(a), B = parseISO(b);
    return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
  }
  function isISODate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s; }
  function fmtShort(s) { return parseISO(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtLong(s) { return parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function fmtFull(s) { return parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }

  /* ---------- State ---------- */
  var state = {
    tasks: [],
    selected: todayISO(),
    viewY: 0, viewM: 0,
    f: { q: '', from: '', to: '', status: 'all', priority: 'all', sort: 'deadline' },
    editingId: null,
    deadlineTouched: false,
    lastToday: todayISO()
  };
  (function () { var d = parseISO(state.selected); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); })();

  /* ---------- Storage ---------- */
  var storage = null;
  try { storage = window.localStorage; storage.getItem(KEY); } catch (e) { storage = null; }

  function setStorageStatus(ok, msg) {
    $('#storageDot').className = 'dot' + (ok ? '' : ' bad');
    $('#storageStatus').textContent = msg;
  }

  function validateTask(x, strict) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { err: 'not an object' };
    var id = (typeof x.id === 'string' && x.id.trim()) ? x.id.trim() : (typeof x.id === 'number' ? String(x.id) : '');
    if (!id) return { err: 'missing id' };
    if (typeof x.title !== 'string' || !x.title.trim()) return { err: 'missing title' };
    if (!isISODate(x.plannedDate)) return { err: 'invalid plannedDate' };
    if (!isISODate(x.deadline)) return { err: 'invalid deadline' };
    var pr = x.priority === undefined || x.priority === '' ? 'Medium' : x.priority;
    if (PRIORITIES.indexOf(pr) < 0) return { err: 'invalid priority' };
    if (x.done !== undefined && typeof x.done !== 'boolean') return { err: 'invalid done flag' };
    if (x.notes !== undefined && x.notes !== null && typeof x.notes !== 'string') return { err: 'invalid notes' };
    var done = !!x.done;
    var created = (typeof x.createdAt === 'string' && !isNaN(Date.parse(x.createdAt))) ? x.createdAt : new Date().toISOString();
    var completed = '';
    if (done) completed = (typeof x.completedAt === 'string' && !isNaN(Date.parse(x.completedAt))) ? x.completedAt : created;
    return { task: {
      id: id, title: x.title.trim().slice(0, MAX_TITLE), plannedDate: x.plannedDate, deadline: x.deadline,
      priority: pr, notes: (x.notes || '').slice(0, MAX_NOTES), done: done, pending: !!x.pending && !done, movedTo: (typeof x.movedTo === 'string' ? x.movedTo : ''), createdAt: created, completedAt: completed
    } };
  }

  function loadTasks() {
    if (!storage) {
      setStorageStatus(false, 'Browser storage unavailable — changes will not be saved');
      toast('Browser storage is unavailable. Your tasks will not persist; use JSON backup.', 'error', 6000);
      return [];
    }
    var raw;
    try { raw = storage.getItem(KEY); if (raw === null) raw = storage.getItem(LEGACY_KEY); } catch (e) { raw = null; }
    if (raw === null) { setStorageStatus(true, 'Storage ready'); return []; }
    try {
      var data = JSON.parse(raw);
      var arr = Array.isArray(data) ? data : (data && data.tasks);
      if (!Array.isArray(arr)) throw new Error('bad shape');
      var out = [], bad = 0, seen = {};
      arr.forEach(function (x) {
        var r = validateTask(x);
        if (r.task && !seen[r.task.id]) { seen[r.task.id] = 1; out.push(r.task); } else bad++;
      });
      if (bad) { keepRaw(raw); toast(bad + ' unreadable record(s) were skipped. A copy of the original data was kept in browser storage.', 'warn', 6000); }
      setStorageStatus(true, 'Loaded ' + plural(out.length, 'task') + ' from this browser');
      return out;
    } catch (e) {
      keepRaw(raw);
      setStorageStatus(false, 'Saved data could not be read');
      toast('Saved data could not be read. The original text was preserved under a separate storage key.', 'error', 7000);
      return [];
    }
  }
  function keepRaw(raw) { try { storage.setItem(KEY + '_unreadable_' + Date.now(), raw); } catch (e) {} }

  function saveTasks() {
    if (!storage) { setStorageStatus(false, 'Not saved — storage unavailable'); toast('Could not save: browser storage is unavailable. Download a backup.', 'error', 6000); return false; }
    try {
      var serialized = JSON.stringify(state.tasks);
      storage.setItem(KEY, serialized);
      // Keep the full dashboard and floating QuickTick panel on the same extension storage.
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set((function () { var o = {}; o[KEY] = state.tasks; return o; })());
      }
      var t = new Date();
      setStorageStatus(true, 'Saved at ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds()));
      return true;
    } catch (e) {
      setStorageStatus(false, 'Not saved — storage full or blocked');
      toast('Could not save to browser storage (it may be full or blocked). Download a JSON backup now.', 'error', 7000);
      return false;
    }
  }

  /* ---------- Status logic ---------- */
  function statusKey(t, today) {
    today = today || todayISO();
    if (t.done) return 'done';
    if (t.pending) return 'pending';
    if (t.deadline < today) return 'overdue';
    if (t.deadline <= addDays(today, 3)) return 'soon';
    return 'open';
  }

  /* ---------- Filtering & sorting ---------- */
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
  function sortTasks(list) {
    var s = state.f.sort;
    return list.slice().sort(function (a, b) {
      var r = 0;
      if (s === 'deadline') r = cmpDeadline(a, b) || (PRANK[a.priority] - PRANK[b.priority]);
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

  /* ---------- Rendering ---------- */
  function renderStats() {
    var today = todayISO(), open = 0, over = 0, soon = 0, done = 0;
    state.tasks.forEach(function (t) {
      var k = statusKey(t, today);
      if (k === 'done') done++; else { open++; if (k === 'overdue') over++; else if (k === 'soon') soon++; }
    });
    var selectedTasks = state.tasks.filter(function (t) { return t.plannedDate === state.selected; });
    var selectedDone = selectedTasks.filter(function (t) { return !!t.done; }).length;
    var total = selectedTasks.length, rate = total ? Math.round(selectedDone / total * 100) : 0;
    $('#stOpen').textContent = open;
    $('#stOverdue').textContent = over;
    $('#stSoon').textContent = soon;
    $('#stRate').textContent = rate + '%';
    $('#stBar').setAttribute('aria-valuenow', rate);
    $('#stBar').firstElementChild.style.width = rate + '%';
    $('#stRateSub').textContent = total ? (selectedDone + ' of ' + total + ' completed on ' + fmtShort(state.selected)) : 'No tasks planned for selected date';
  }

  function renderCalendar() {
    var y = state.viewY, m = state.viewM, today = todayISO();
    $('#calTitle').textContent = new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    var byDate = {};
    state.tasks.forEach(function (t) { (byDate[t.plannedDate] = byDate[t.plannedDate] || []).push(t); });
    var offset = (new Date(y, m, 1).getDay() + 6) % 7;
    var start = new Date(y, m, 1 - offset);
    var firstOfMonth = toISO(new Date(y, m, 1));
    var gridHasSelected = false, i, cells = [];
    for (i = 0; i < 42; i++) { var dd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); cells.push(dd); if (toISO(dd) === state.selected) gridHasSelected = true; }
    var tabDate = gridHasSelected ? state.selected : firstOfMonth;
    var html = '';
    cells.forEach(function (d) {
      var key = toISO(d), list = byDate[key] || [];
      var sorted = list.slice().sort(function (a, b) {
        return (STATUS_RANK[statusKey(a, today)] - STATUS_RANK[statusKey(b, today)]) || a.title.localeCompare(b.title) || tie(a, b);
      });
      var counts = { overdue: 0, soon: 0, open: 0, done: 0 };
      sorted.forEach(function (t) { counts[statusKey(t, today)]++; });
      var parts = [];
      ['overdue', 'soon', 'open', 'done'].forEach(function (k) { if (counts[k]) parts.push(counts[k] + ' ' + STATUS_LABEL[k].toLowerCase()); });
      var label = fmtFull(key) + (key === today ? ', today' : '') + '. ' + (list.length ? plural(list.length, 'task') + ': ' + parts.join(', ') : 'No tasks');
      var cls = 'day' + (d.getMonth() !== m ? ' other' : '') + (key === today ? ' today' : '') + (key === state.selected ? ' selected' : '');
      var tip = list.length ? sorted.slice(0, 8).map(function (t) { return '• ' + t.title + ' (' + STATUS_LABEL[statusKey(t, today)] + ')'; }).join('\n') + (list.length > 8 ? '\n…' : '') : 'No tasks';
      html += '<button type="button" class="' + cls + '" data-date="' + key + '" tabindex="' + (key === tabDate ? 0 : -1) + '"' +
        (key === state.selected ? ' aria-pressed="true"' : ' aria-pressed="false"') + (key === today ? ' aria-current="date"' : '') +
        ' aria-label="' + esc(label) + '" title="' + esc(fmtFull(key) + '\n' + tip) + '">' +
        '<span class="num">' + d.getDate() + '</span>';
      sorted.slice(0, 3).forEach(function (t) {
        html += '<span class="chip s-' + statusKey(t, today) + '">' + esc(t.title) + '</span>';
      });
      if (sorted.length > 3) html += '<span class="more">+' + (sorted.length - 3) + ' more</span>';
      html += '</button>';
    });
    $('#calGrid').innerHTML = html;
  }

  var ICON_EDIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_DEL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

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
      '<div class="task-title">' + esc(t.title) + '</div>' +
      '<div class="meta"><span class="badge s-' + k + '">' + STATUS_LABEL[k] + '</span>' +
      '<span class="badge p p-' + t.priority + '">' + t.priority + '</span>' +
      '<span>Deadline: ' + fmtShort(t.deadline) + esc(deadlineNote(t, today)) + '</span>' +
      (showPlanned ? '<span>· Planned: <button type="button" class="btn-link" data-act="goto" data-date="' + t.plannedDate + '">' + fmtShort(t.plannedDate) + '</button></span>' : '') +
      '</div>' +
      (t.notes ? '<div class="task-notes">' + linkify(t.notes) + '</div>' : '') +
      '<div class="task-actions">' +
      (!t.done ? (t.pending ? '<button type="button" class="btn btn-sm" data-act="unpending" title="Remove the pending mark">Unmark pending</button>' : '<button type="button" class="btn btn-sm" data-act="pending" title="Mark as pending">Mark pending</button>') : '') +
      (hasMovedCopy(t) ? '<span class="moved-note">Moved to ' + esc(fmtShort(findTask(t.movedTo).plannedDate)) + '</span>' : '<button type="button" class="btn btn-sm" data-act="nextday" title="Copy this task to the next day">Move to next day</button>') +
      '<button type="button" class="icon-btn sm" data-act="edit" aria-label="Edit “' + esc(t.title) + '”" title="Edit">' + ICON_EDIT + '</button>' +
      '<button type="button" class="icon-btn sm danger" data-act="delete" aria-label="Delete “' + esc(t.title) + '”" title="Delete">' + ICON_DEL + '</button>' +
      '</div></div></article>';
  }

  function emptyBlock(icon, title, text, btn) {
    return '<div class="empty"><div class="ico">' + icon + '</div><h3>' + title + '</h3><p>' + text + '</p>' + (btn || '') + '</div>';
  }
  var ICO_CAL = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';
  var ICO_SEARCH = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  function renderPanel() {
    var today = todayISO(), sel = state.selected, searching = hasQuery();
    var dayAll = state.tasks.filter(function (t) { return t.plannedDate === sel; });
    var list, title, sub, html = '';
    if (searching) {
      list = filteredAll();
      title = 'Search results';
      sub = plural(list.length, 'result') + ' across all dates · selected day: ' + fmtLong(sel);
    } else {
      list = sortTasks(dayAll.filter(function (t) { return matches(t, today); }));
      title = fmtLong(sel) + (sel === today ? ' · Today' : '');
      sub = plural(dayAll.length, 'item') + ' planned · ' + list.length + ' match current filters';
    }
    $('#panelTitle').textContent = title;
    $('#panelSub').textContent = sub;

    if (list.length) {
      list.forEach(function (t) { html += taskCard(t, today, searching); });
    } else if (!state.tasks.length) {
      html = emptyBlock(ICO_CAL, 'No action items yet', 'Add your first action item to start planning your days.', '<button class="btn btn-primary" type="button" data-act="add">+ Add Action Item</button>');
    } else if (searching) {
      html = emptyBlock(ICO_SEARCH, 'No results', 'Nothing matches “' + esc(state.f.q.trim()) + '”' + (activeFilterCount() ? ' with the current filters' : '') + '.', '<button class="btn" type="button" data-act="clearsearch">Clear search</button>');
    } else if (dayAll.length) {
      html = emptyBlock(ICO_SEARCH, 'No items match the current filters', plural(dayAll.length, 'item') + ' planned on this day ' + (dayAll.length === 1 ? 'is' : 'are') + ' hidden by your filters.', '<button class="btn" type="button" data-act="clearfilters">Clear Filters</button>');
    } else {
      html = emptyBlock(ICO_CAL, 'Nothing planned for this day', 'Add an action item to plan your work for ' + esc(fmtLong(sel)) + '.', '<button class="btn btn-primary" type="button" data-act="add">+ Add Action Item</button>');
    }
    $('#panelList').innerHTML = html;
  }

  function renderFilterBar() {
    var n = activeFilterCount(), pill = $('#filterCount');
    pill.hidden = n === 0; pill.textContent = n;
    $('#btnFilters').setAttribute('aria-label', 'Filters' + (n ? ', ' + n + ' active' : ''));
    var m = filteredAll().length;
    $('#matchCount').textContent = m + ' of ' + plural(state.tasks.length, 'task') + ' match your search and filters';
  }

  function renderAll() {
    state.lastToday = todayISO();
    renderStats(); renderCalendar(); renderPanel(); renderFilterBar();
  }

  /* ---------- Toasts ---------- */
  function toast(msg, type, ms) {
    var box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    while (box.children.length >= 2) box.removeChild(box.firstChild);
    box.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 3000);
  }

  /* ---------- Confirm dialog ---------- */
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

  /* ---------- Task modal ---------- */
  var taskDlg = $('#taskDlg');
  function clearErrors() {
    ['Title', 'Planned', 'Deadline'].forEach(function (n) {
      $('#e' + n).textContent = '';
      $('#t' + n).classList.remove('invalid'); $('#t' + n).removeAttribute('aria-invalid');
    });
  }
  function fillForm(t, defDate) {
    $('#tTitle').value = t ? t.title : '';
    $('#tPlanned').value = t ? t.plannedDate : defDate;
    $('#tDeadline').value = t ? t.deadline : defDate;
    $('#tPriority').value = t ? t.priority : 'Medium';
    $('#tNotes').value = t ? t.notes : '';
    $('#tDone').checked = t ? t.done : false;
  }
  function openTaskModal(task, defDate) {
    state.editingId = task ? task.id : null;
    state.deadlineTouched = !!task;
    $('#taskDlgTitle').textContent = task ? 'Edit Action Item' : 'Add Action Item';
    $('#taskSave').textContent = task ? 'Save changes' : 'Save';
    clearErrors();
    fillForm(task, defDate || state.selected);
    taskDlg.showModal();
    $('#tTitle').focus();
  }
  function fieldError(name, msg) {
    $('#e' + name).textContent = msg;
    var inp = $('#t' + name); inp.classList.add('invalid'); inp.setAttribute('aria-invalid', 'true');
  }
  function submitTask(ev) {
    ev.preventDefault();
    clearErrors();
    var title = $('#tTitle').value.trim().replace(/\s+/g, ' ');
    var planned = $('#tPlanned').value, deadline = $('#tDeadline').value;
    var firstBad = null, ok = true;
    if (!title) { fieldError('Title', 'Please enter an action item.'); firstBad = firstBad || $('#tTitle'); ok = false; }
    if (!isISODate(planned)) { fieldError('Planned', 'Choose a valid planned date.'); firstBad = firstBad || $('#tPlanned'); ok = false; }
    if (!isISODate(deadline)) { fieldError('Deadline', 'Choose a valid deadline.'); firstBad = firstBad || $('#tDeadline'); ok = false; }
    if (!ok) { firstBad.focus(); return; }

    var proceed = Promise.resolve(true);
    if (deadline < planned) {
      proceed = confirmBox('Deadline is before the planned date',
        'The deadline (' + fmtShort(deadline) + ') is earlier than the planned date (' + fmtShort(planned) + ').\nSave anyway?', 'Save anyway', false);
    }
    proceed.then(function (go) {
      if (!go) return;
      var done = $('#tDone').checked, now = new Date().toISOString();
      var notes = $('#tNotes').value.trim(), priority = $('#tPriority').value;
      var wasDone = false, isEdit = false;
      if (state.editingId) {
        var t = state.tasks.filter(function (x) { return x.id === state.editingId; })[0];
        if (t) {
          isEdit = true; wasDone = t.done;
          t.title = title; t.plannedDate = planned; t.deadline = deadline; t.priority = priority; t.notes = notes;
          t.done = done;
          t.pending = done ? false : !!t.pending;
          if (done) t.movedTo = '';
          t.completedAt = done ? (wasDone && t.completedAt ? t.completedAt : now) : '';
        }
      }
      if (!isEdit) {
        state.tasks.push({ id: newId(), title: title, plannedDate: planned, deadline: deadline, priority: priority, notes: notes, done: done, pending: false, movedTo: '', createdAt: now, completedAt: done ? now : '' });
      }
      var saved = saveTasks();
      selectDate(planned, true);
      state.editingId = null;
      taskDlg.close();
      if (saved) toast(isEdit ? 'Task updated' : 'Task saved');
    });
  }

  /* ---------- Actions ---------- */
  function selectDate(iso, followMonth) {
    state.selected = iso;
    if (followMonth) { var d = parseISO(iso); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); }
    renderAll();
  }
  function findTask(id) { return state.tasks.filter(function (t) { return t.id === id; })[0]; }

  function toggleTask(id, checked) {
    var t = findTask(id); if (!t) return;
    t.done = checked;
    t.pending = false; t.movedTo = '';
    t.completedAt = checked ? new Date().toISOString() : '';
    var saved = saveTasks();
    renderAll();
    if (saved) toast(checked ? 'Task completed' : 'Task reopened');
  }
  function markPending(id) {
    var t = findTask(id); if (!t || t.done) return;
    t.pending = true;
    var saved = saveTasks();
    renderAll();
    if (saved) toast('Task marked as pending');
  }
  function unmarkPending(id) {
    var t = findTask(id); if (!t) return;
    t.pending = false; t.movedTo = '';
    var saved = saveTasks();
    renderAll();
    if (saved) toast('Pending mark removed');
  }
  function moveTaskToNextDay(id) {
    var t = findTask(id); if (!t || hasMovedCopy(t)) return;
    var next = addDays(t.plannedDate || state.selected, 1);
    var copy = {
      id: newId(), title: t.title, plannedDate: next,
      deadline: t.deadline === t.plannedDate ? next : (t.deadline || next),
      priority: t.priority || 'Medium', notes: t.notes || '',
      done: false, pending: false, movedTo: '', createdAt: new Date().toISOString(), completedAt: ''
    };
    state.tasks.push(copy);
    t.pending = true;
    t.movedTo = copy.id;
    var saved = saveTasks();
    selectDate(next, true);
    if (saved) toast('Task copied to ' + fmtShort(next));
  }
  function deleteTask(id) {
    var t = findTask(id); if (!t) return;
    confirmBox('Delete this action item?', '“' + t.title + '” will be permanently deleted.\nThis cannot be undone unless you have a JSON backup.', 'Delete', true).then(function (go) {
      if (!go) return;
      state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
      var saved = saveTasks();
      renderAll();
      if (saved) toast('Task deleted');
    });
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function buildCsv(list) {
    var today = todayISO();
    var rows = [['Task ID', 'Title', 'Planned Date', 'Expected Deadline', 'Status', 'Priority', 'Notes', 'Completed', 'Created At', 'Completed At']];
    list.forEach(function (t) {
      rows.push([t.id, t.title, t.plannedDate, t.deadline, STATUS_LABEL[statusKey(t, today)], t.priority, t.notes, t.done ? 'Yes' : 'No', t.createdAt, t.completedAt]);
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
    var list = filteredOnly ? filteredAll() : sortTasks(state.tasks.slice().sort(function (a, b) { return a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0; })).slice();
    if (!filteredOnly) {
      list = state.tasks.slice().sort(function (a, b) { return (a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0) || cmpDeadline(a, b) || tie(a, b); });
    }
    if (!list.length) { toast(filteredOnly ? 'No tasks match the current search and filters — nothing to export.' : 'There are no tasks to export yet.', 'warn'); return; }
    download('QuickTick_action_items' + (filteredOnly ? '_filtered' : '') + '_' + todayISO() + '.csv', buildCsv(list), 'text/csv;charset=utf-8');
    toast('CSV exported (' + plural(list.length, 'task') + ')');
  }

  /* ---------- Backup / Restore ---------- */
  function buildBackup() {
    return JSON.stringify({
      app: APP, formatVersion: FORMAT_VERSION, exportedAt: new Date().toISOString(),
      taskCount: state.tasks.length, tasks: state.tasks
    }, null, 2);
  }
  function backupDownload(silent) {
    var stamp = todayISO() + '_' + pad(new Date().getHours()) + pad(new Date().getMinutes());
    download('QuickTick_backup_' + stamp + '.json', buildBackup(), 'application/json');
    if (!silent) toast('Backup downloaded (' + plural(state.tasks.length, 'task') + ')');
  }
  function parseBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'The file is not valid JSON.' }; }
    var arr;
    if (data && !Array.isArray(data) && typeof data === 'object') {
      if (data.app !== APP) return { error: 'This file is not a QuickTick backup (missing application name).' };
      if (typeof data.formatVersion !== 'number') return { error: 'The backup is missing its format version.' };
      if (data.formatVersion > FORMAT_VERSION) return { error: 'This backup was made by a newer version of QuickTick (format ' + data.formatVersion + ') and cannot be read safely.' };
      arr = data.tasks;
    } else arr = null;
    if (!Array.isArray(arr)) return { error: 'The backup does not contain a task list.' };
    var out = [], seen = {}, errors = [];
    arr.forEach(function (x, i) {
      var r = validateTask(x);
      if (!r.task) { errors.push('Task #' + (i + 1) + ': ' + r.err); return; }
      if (seen[r.task.id]) { errors.push('Task #' + (i + 1) + ': duplicate id'); return; }
      seen[r.task.id] = 1; out.push(r.task);
    });
    if (errors.length) return { error: 'No changes were made. ' + plural(errors.length, 'record') + ' in the file ' + (errors.length === 1 ? 'is' : 'are') + ' invalid.\n' + errors.slice(0, 4).join('\n') + (errors.length > 4 ? '\n…' : '') };
    return { tasks: out };
  }
  function handleRestoreFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast('That file is too large to be a QuickTick backup.', 'error'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('The file could not be read.', 'error'); };
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
    $('#mergeDesc').textContent = 'Adds ' + fresh + ' new, updates ' + overlap + ' existing (same ID, file version wins) and keeps your other ' + (current - overlap) + '.';
    $('#replaceDesc').textContent = 'Deletes all ' + plural(current, 'current task') + ' and replaces them with the ' + incoming.length + ' from the file.';
    d.querySelector('input[value="merge"]').checked = true;
    $('#restoreSafety').checked = true;
    d.returnValue = '';
    d.addEventListener('close', function () {
      if (d.returnValue !== 'ok') return;
      var mode = d.querySelector('input[name="restoreMode"]:checked').value;
      if (current && $('#restoreSafety').checked) backupDownload(true);
      var previous = state.tasks;
      if (mode === 'replace') state.tasks = incoming.slice();
      else {
        var map = {}; state.tasks.forEach(function (t) { map[t.id] = t; });
        incoming.forEach(function (t) { map[t.id] = t; });
        state.tasks = Object.keys(map).map(function (k) { return map[k]; });
      }
      if (!saveTasks()) { state.tasks = previous; renderAll(); toast('Restore cancelled because the data could not be saved.', 'error', 6000); return; }
      renderAll();
      toast('Backup restored (' + (mode === 'replace' ? 'replaced' : 'merged') + '): ' + plural(state.tasks.length, 'task') + ' now saved', 'info', 4000);
    }, { once: true });
    d.showModal();
  }

  /* ---------- Filters UI ---------- */
  function syncFiltersFromUI() {
    state.f.q = $('#search').value;
    state.f.from = $('#fFrom').value; state.f.to = $('#fTo').value;
    state.f.status = $('#fStatus').value; state.f.priority = $('#fPriority').value; state.f.sort = $('#fSort').value;
    renderPanel(); renderFilterBar();
  }
  function clearFilters() {
    $('#fFrom').value = ''; $('#fTo').value = ''; $('#fStatus').value = 'all'; $('#fPriority').value = 'all'; $('#fSort').value = 'deadline';
    state.f.from = ''; state.f.to = ''; state.f.status = 'all'; state.f.priority = 'all'; state.f.sort = 'deadline';
    renderPanel(); renderFilterBar();
  }

  /* ---------- Events ---------- */
  $('#btnToday').addEventListener('click', function () { selectDate(todayISO(), true); });
  $('#btnExport').addEventListener('click', function () { exportCsv(false); });
  $('#btnExportFiltered').addEventListener('click', function () { exportCsv(true); });
  $('#btnBackup').addEventListener('click', function () { backupDownload(false); });
  $('#btnRestore').addEventListener('click', function () { $('#restoreFile').click(); });
  $('#restoreFile').addEventListener('change', function (e) { var f = e.target.files[0]; e.target.value = ''; handleRestoreFile(f); });
  $('#btnAdd').addEventListener('click', function () { openTaskModal(null, state.selected); });
  $('#btnPanelAdd').addEventListener('click', function () { openTaskModal(null, state.selected); });

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

  $('#btnPrev').addEventListener('click', function () { var d = new Date(state.viewY, state.viewM - 1, 1); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); renderCalendar(); });
  $('#btnNext').addEventListener('click', function () { var d = new Date(state.viewY, state.viewM + 1, 1); state.viewY = d.getFullYear(); state.viewM = d.getMonth(); renderCalendar(); });

  $('#calGrid').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b) return;
    selectDate(b.getAttribute('data-date'), b.classList.contains('other'));
    var again = $('#calGrid .day[data-date="' + state.selected + '"]'); if (again) again.focus();
  });
  $('#calGrid').addEventListener('keydown', function (e) {
    var b = e.target.closest('.day'); if (!b) return;
    var delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    selectDate(addDays(b.getAttribute('data-date'), delta), true);
    var n = $('#calGrid .day[data-date="' + state.selected + '"]'); if (n) n.focus();
  });

  $('#panelList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var act = btn.getAttribute('data-act'), card = btn.closest('.task'), id = card ? card.getAttribute('data-id') : null;
    if (act === 'edit') { var t = findTask(id); if (t) openTaskModal(t); }
    else if (act === 'pending') markPending(id);
    else if (act === 'unpending') unmarkPending(id);
    else if (act === 'nextday') moveTaskToNextDay(id);
    else if (act === 'delete') deleteTask(id);
    else if (act === 'goto') { selectDate(btn.getAttribute('data-date'), true); }
    else if (act === 'add') openTaskModal(null, state.selected);
    else if (act === 'clearfilters') clearFilters();
    else if (act === 'clearsearch') { $('#search').value = ''; syncFiltersFromUI(); $('#search').focus(); }
  });
  $('#panelList').addEventListener('change', function (e) {
    var el = e.target;
    if (el.getAttribute && el.getAttribute('data-act') === 'toggle') toggleTask(el.closest('.task').getAttribute('data-id'), el.checked);
  });

  $('#taskForm').addEventListener('submit', submitTask);
  $('#taskClose').addEventListener('click', function () { taskDlg.close(); });
  $('#taskCancel').addEventListener('click', function () { taskDlg.close(); });
  $('#taskReset').addEventListener('click', function () {
    clearErrors();
    var d = $('#tPlanned').value && isISODate($('#tPlanned').value) && state.editingId ? state.selected : state.selected;
    $('#tTitle').value = ''; $('#tNotes').value = ''; $('#tPriority').value = 'Medium'; $('#tDone').checked = false;
    $('#tPlanned').value = d; $('#tDeadline').value = d; state.deadlineTouched = false;
    $('#tTitle').focus();
  });
  $('#tDeadline').addEventListener('input', function () { state.deadlineTouched = true; });
  $('#tPlanned').addEventListener('input', function () {
    if (!state.deadlineTouched && !state.editingId && isISODate(this.value)) $('#tDeadline').value = this.value;
  });
  // Close dialogs when clicking the backdrop (task dialog only if the click started on the backdrop)
  var downOnBackdrop = false;
  taskDlg.addEventListener('mousedown', function (e) { downOnBackdrop = e.target === taskDlg; });
  taskDlg.addEventListener('click', function (e) { if (e.target === taskDlg && downOnBackdrop) { /* keep open to avoid losing typed data */ } });

  // Keep date-sensitive statuses fresh (midnight rollover, returning to the tab)
  function refreshIfDayChanged() { if (todayISO() !== state.lastToday) renderAll(); }
  setInterval(refreshIfDayChanged, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshIfDayChanged(); });
  window.addEventListener('focus', refreshIfDayChanged);

  // Cross-tab sync: reload if another tab changed the data
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { state.tasks = loadTasks(); renderAll(); }
  });

  /* ---------- Init ---------- */
  state.tasks = loadTasks();
  renderAll();

  /* ---------- QuickTick shared storage ---------- */
  // chrome.storage.local is the source of truth shared with the floating panel and
  // the new-tab window. localStorage is only a fallback copy for this page.
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    function sameTasks(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
    function applySharedTasks(raw) {
      if (!Array.isArray(raw)) return false;
      var cleaned = [], seen = {};
      raw.forEach(function (x) {
        var r = validateTask(x), task = r.task;
        if (task && !seen[task.id]) { seen[task.id] = true; cleaned.push(task); }
      });
      if (sameTasks(cleaned, state.tasks)) return true; // our own save echoing back
      state.tasks = cleaned;
      try { if (storage) storage.setItem(KEY, JSON.stringify(cleaned)); } catch (e) {}
      renderAll();
      setStorageStatus(true, 'Synced ' + plural(cleaned.length, 'task') + ' with QuickTick');
      return true;
    }
    chrome.storage.local.get([KEY, LEGACY_KEY], function (result) {
      if (chrome.runtime && chrome.runtime.lastError) {
        setStorageStatus(false, 'Could not read QuickTick shared storage'); return;
      }
      var shared = result && result[KEY];
      if (!Array.isArray(shared) && result && Array.isArray(result[LEGACY_KEY])) shared = result[LEGACY_KEY]; // migrate pre-1.3.9 data
      if (Array.isArray(shared)) {
        // The shared copy exists (even if empty) and wins over this page's local copy,
        // so tasks deleted elsewhere are not resurrected.
        applySharedTasks(shared);
        var m = {}; m[KEY] = state.tasks; chrome.storage.local.set(m);
      } else if (state.tasks.length) {
        var migration = {}; migration[KEY] = state.tasks; chrome.storage.local.set(migration);
      }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes[KEY] && Array.isArray(changes[KEY].newValue)) {
        applySharedTasks(changes[KEY].newValue);
      }
    });
  }

})();
