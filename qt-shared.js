/* QuickTick shared helpers. */
(function (root) {
  'use strict';
  if (root.QT) return;
  var QT = {};

  QT.KEY = 'QuickTick_action_items_v1';
  QT.LEGACY_KEY = 'daymark_action_items_v1';
  QT.SETTINGS_KEY = 'QuickTick_settings_v1';
  QT.NOTIFIED_KEY = 'QuickTick_notified_v1';
  QT.PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
  QT.PRANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  QT.STATUS_LABEL = { open: 'Open', overdue: 'Overdue', soon: 'Due soon', done: 'Completed', pending: 'Pending' };
  QT.STATUS_RANK = { overdue: 0, soon: 1, open: 2, pending: 3, done: 4 };
  QT.MAX_TITLE = 120;
  QT.MAX_NOTES = 2000;
  QT.MAX_OCCURRENCES = 1000;
  QT.DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  QT.DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  QT.MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  QT.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  QT.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  QT.newId = function () {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  };
  QT.plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
  QT.clone = function (x) { return JSON.parse(JSON.stringify(x)); };

  var pad = QT.pad;
  QT.toISO = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  QT.parseISO = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  QT.todayISO = function () { return QT.toISO(new Date()); };
  QT.addDays = function (s, n) { var d = QT.parseISO(s); d.setDate(d.getDate() + n); return QT.toISO(d); };
  QT.dayDiff = function (a, b) {
    var A = QT.parseISO(a), B = QT.parseISO(b);
    return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000);
  };
  QT.isISODate = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && QT.toISO(QT.parseISO(s)) === s; };
  QT.isWeekend = function (s) { var d = QT.parseISO(s).getDay(); return d === 0 || d === 6; };
  QT.nextBusinessDay = function (s) { return QT.stepWeekday(s, 1); };
  QT.stepWeekday = function (s, dir) {
    var d = QT.addDays(s, dir);
    while (QT.isWeekend(d)) d = QT.addDays(d, dir);
    return d;
  };
  QT.startOfWeek = function (s) { return QT.addDays(s, -((QT.parseISO(s).getDay() + 6) % 7)); };
  QT.isoWeek = function (s) {
    var d = QT.parseISO(s);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    var week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  };
  QT.fmtShort = function (s) { return QT.parseISO(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  QT.fmtDay = function (s) { return QT.parseISO(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  QT.fmtDayNoWd = function (s) { return QT.parseISO(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  QT.fmtLong = function (s) { return QT.parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }); };
  QT.fmtFull = function (s) { return QT.parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };

  QT.isTime = function (s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); };
  QT.toMin = function (hhmm) { var p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; };
  QT.fromMin = function (m) { m = Math.max(0, Math.min(23 * 60 + 59, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  QT.addMinutes = function (hhmm, n) { return QT.fromMin(QT.toMin(hhmm) + n); };
  QT.timeRange = function (t) { return t.time ? t.time + (t.endTime ? '–' + t.endTime : '') : ''; };

  QT.statusKey = function (t, today) {
    today = today || QT.todayISO();
    if (t.done) return 'done';
    if (t.pending) return 'pending';
    if (!t.deadline) return 'open';
    if (t.deadline < today) return 'overdue';
    if (t.deadline <= QT.addDays(today, 3)) return 'soon';
    return 'open';
  };
  QT.asList = function (raw) { return Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : null); };

  QT.DEFAULT_SETTINGS = { reminderLead: 10, theme: 'light', backupNudge: true, lastBackupAt: '', backupSnoozeUntil: '' };
  QT.REMINDER_CHOICES = [-1, 0, 5, 10, 15, 30];
  QT.normaliseSettings = function (s) {
    s = s && typeof s === 'object' ? s : {};
    var d = QT.DEFAULT_SETTINGS;
    var lead = Number(s.reminderLead);
    return {
      reminderLead: QT.REMINDER_CHOICES.indexOf(lead) >= 0 ? lead : d.reminderLead,
      theme: ['system', 'light', 'dark'].indexOf(s.theme) >= 0 ? s.theme : d.theme,
      backupNudge: s.backupNudge === undefined ? d.backupNudge : !!s.backupNudge,
      lastBackupAt: typeof s.lastBackupAt === 'string' && !isNaN(Date.parse(s.lastBackupAt)) ? s.lastBackupAt : '',
      backupSnoozeUntil: typeof s.backupSnoozeUntil === 'string' && !isNaN(Date.parse(s.backupSnoozeUntil)) ? s.backupSnoozeUntil : ''
    };
  };
  QT.effectiveTheme = function (theme) {
    if (theme === 'light' || theme === 'dark') return theme;
    try { return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  };

  var ORD_NAME = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' };
  var KIND_NAME = { day: 'day', weekday: 'weekday', weekend: 'weekend day' };
  QT.ORD_NAME = ORD_NAME;

  QT.normaliseRule = function (r) {
    if (!r || typeof r !== 'object') return null;
    if (['daily', 'weekly', 'monthly', 'yearly'].indexOf(r.freq) < 0) return null;
    if (!QT.isISODate(r.start)) return null;
    var out = {
      freq: r.freq,
      interval: Math.max(1, Math.min(99, parseInt(r.interval, 10) || 1)),
      weekdaysOnly: r.freq === 'daily' && !!r.weekdaysOnly,
      dows: Array.isArray(r.dows) ? r.dows.map(Number).filter(function (d, i, a) { return d >= 0 && d <= 6 && a.indexOf(d) === i; }) : [],
      onMode: r.onMode === 'nth' ? 'nth' : 'date',
      day: Math.max(1, Math.min(31, parseInt(r.day, 10) || 1)),
      ord: [1, 2, 3, 4, -1].indexOf(Number(r.ord)) >= 0 ? Number(r.ord) : 1,
      kind: ['day', 'weekday', 'weekend', '0', '1', '2', '3', '4', '5', '6'].indexOf(String(r.kind)) >= 0 ? String(r.kind) : 'day',
      month: Math.max(0, Math.min(11, parseInt(r.month, 10) || 0)),
      start: r.start,
      endMode: ['date', 'count', 'never'].indexOf(r.endMode) >= 0 ? r.endMode : 'date',
      end: QT.isISODate(r.end) ? r.end : '',
      count: Math.max(1, Math.min(500, parseInt(r.count, 10) || 1)),
      dueOffset: Math.max(-366, Math.min(366, parseInt(r.dueOffset, 10) || 0)),
      genUntil: QT.isISODate(r.genUntil) ? r.genUntil : ''
    };
    if (out.freq === 'weekly' && !out.dows.length) out.dows = [QT.parseISO(out.start).getDay()];
    if (out.endMode === 'date' && !out.end) out.end = out.start;
    return out;
  };
  QT.ruleKey = function (r) {
    if (!r) return '';
    return JSON.stringify([r.freq, r.interval, r.weekdaysOnly, r.dows.slice().sort(), r.onMode, r.day, r.ord, r.kind, r.month, r.start, r.endMode, r.end, r.count]);
  };

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function kindMatches(kind, dow) {
    if (kind === 'day') return true;
    if (kind === 'weekday') return dow >= 1 && dow <= 5;
    if (kind === 'weekend') return dow === 0 || dow === 6;
    return dow === Number(kind);
  }
  function nthDayOfMonth(y, m, ord, kind) {
    var hits = [], dim = daysInMonth(y, m), d;
    for (d = 1; d <= dim; d++) if (kindMatches(kind, new Date(y, m, d).getDay())) hits.push(d);
    return ord === -1 ? hits[hits.length - 1] : hits[ord - 1];
  }
  function targetDayOfMonth(y, m, r, cache) {
    var k = y * 12 + m;
    if (!(k in cache)) cache[k] = r.onMode === 'nth' ? nthDayOfMonth(y, m, r.ord, r.kind) : Math.min(r.day, daysInMonth(y, m));
    return cache[k];
  }
  function sundayOf(iso) { return QT.addDays(iso, -QT.parseISO(iso).getDay()); }
  function occursOn(iso, r, cache) {
    var d = QT.parseISO(iso), dow = d.getDay(), s = QT.parseISO(r.start);
    if (r.freq === 'daily') {
      if (r.weekdaysOnly) return dow >= 1 && dow <= 5;
      return QT.dayDiff(r.start, iso) % r.interval === 0;
    }
    if (r.freq === 'weekly') {
      return r.dows.indexOf(dow) >= 0 && Math.floor(QT.dayDiff(sundayOf(r.start), sundayOf(iso)) / 7) % r.interval === 0;
    }
    if (r.freq === 'monthly') {
      var md = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      return md % r.interval === 0 && d.getDate() === targetDayOfMonth(d.getFullYear(), d.getMonth(), r, cache);
    }
    if (r.freq === 'yearly') return d.getMonth() === r.month && d.getDate() === targetDayOfMonth(d.getFullYear(), d.getMonth(), r, cache);
    return false;
  }
  QT.openEndedHorizon = function (r, from) {
    var s = QT.parseISO(from || r.start), years = r.freq === 'yearly' ? 10 : 1;
    return QT.addDays(QT.toISO(new Date(s.getFullYear() + years, s.getMonth(), s.getDate())), -1);
  };
  QT.generateDates = function (r, horizonFrom) {
    var out = [], last, cur = r.start, limitCount = Infinity, cache = {};
    if (r.endMode === 'date') last = r.end;
    else if (r.endMode === 'count') { limitCount = r.count; last = QT.toISO(new Date(QT.parseISO(r.start).getFullYear() + 60, 0, 1)); }
    else last = QT.openEndedHorizon(r, horizonFrom && horizonFrom > r.start ? horizonFrom : r.start);
    while (cur <= last && out.length < limitCount && out.length <= QT.MAX_OCCURRENCES) {
      if (occursOn(cur, r, cache)) out.push(cur);
      cur = QT.addDays(cur, 1);
    }
    return out;
  };
  QT.datesBetween = function (r, from, to) {
    var out = [], cur = from < r.start ? r.start : from, cache = {};
    while (cur <= to && out.length <= QT.MAX_OCCURRENCES) {
      if (occursOn(cur, r, cache)) out.push(cur);
      cur = QT.addDays(cur, 1);
    }
    return out;
  };
  function joinWords(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function nthPhrase(r) { return 'the ' + ORD_NAME[String(r.ord)] + ' ' + (KIND_NAME[r.kind] || QT.DOW_FULL[Number(r.kind)]); }
  QT.describeRule = function (r) {
    if (r.freq === 'daily') return r.weekdaysOnly ? 'every weekday' : r.interval === 1 ? 'every day' : 'every ' + r.interval + ' days';
    if (r.freq === 'weekly') {
      var names = r.dows.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (i) { return QT.DOW_FULL[i]; });
      var weekdays = names.length === 5 && r.dows.indexOf(0) < 0 && r.dows.indexOf(6) < 0;
      if (r.interval === 1) return names.length === 7 ? 'every day' : weekdays ? 'every weekday' : 'every ' + joinWords(names);
      return 'every ' + r.interval + ' weeks on ' + (names.length === 7 ? 'every day' : weekdays ? 'weekdays' : joinWords(names));
    }
    if (r.freq === 'monthly') {
      var every = r.interval === 1 ? 'every month' : 'every ' + r.interval + ' months';
      return (r.onMode === 'nth' ? nthPhrase(r) : 'day ' + r.day) + ' of ' + every;
    }
    return r.onMode === 'nth' ? nthPhrase(r) + ' of ' + QT.MONTHS[r.month] + ' every year' : 'every ' + r.day + ' ' + QT.MONTHS[r.month];
  };
  QT.ruleText = function (r, first, last) {
    var d = QT.describeRule(r);
    d = d.charAt(0).toUpperCase() + d.slice(1);
    if (r.endMode === 'never') return d + ', from ' + QT.fmtShort(first || r.start) + ', no end date';
    return d + ', ' + QT.fmtShort(first || r.start) + (last && last !== first ? ' to ' + QT.fmtShort(last) : '');
  };

  QT.validateTask = function (x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { err: 'not an object' };
    var id = (typeof x.id === 'string' && x.id.trim()) ? x.id.trim() : (typeof x.id === 'number' ? String(x.id) : '');
    if (!id) return { err: 'missing id' };
    if (typeof x.title !== 'string' || !x.title.trim()) return { err: 'missing title' };
    if (!QT.isISODate(x.plannedDate)) return { err: 'invalid plannedDate' };
    if (!QT.isISODate(x.deadline)) return { err: 'invalid deadline' };
    var pr = x.priority === undefined || x.priority === '' ? 'Medium' : x.priority;
    if (QT.PRIORITIES.indexOf(pr) < 0) return { err: 'invalid priority' };
    if (x.done !== undefined && typeof x.done !== 'boolean') return { err: 'invalid done flag' };
    if (x.notes !== undefined && x.notes !== null && typeof x.notes !== 'string') return { err: 'invalid notes' };
    var done = !!x.done;
    var created = (typeof x.createdAt === 'string' && !isNaN(Date.parse(x.createdAt))) ? x.createdAt : new Date().toISOString();
    var completed = '';
    if (done) completed = (typeof x.completedAt === 'string' && !isNaN(Date.parse(x.completedAt))) ? x.completedAt : created;
    var seriesId = typeof x.seriesId === 'string' ? x.seriesId.slice(0, 80) : '';
    return { task: {
      id: id, title: x.title.trim().slice(0, QT.MAX_TITLE), plannedDate: x.plannedDate, deadline: x.deadline,
      priority: pr, notes: (x.notes || '').slice(0, QT.MAX_NOTES), done: done, pending: !!x.pending && !done,
      movedTo: typeof x.movedTo === 'string' ? x.movedTo : '', createdAt: created, completedAt: completed,
      time: QT.isTime(x.time) ? x.time : '',
      endTime: QT.isTime(x.time) && QT.isTime(x.endTime) && x.endTime > x.time ? x.endTime : '',
      seriesId: seriesId,
      seriesRule: seriesId && typeof x.seriesRule === 'string' ? x.seriesRule.slice(0, 240) : '',
      seriesSpec: seriesId ? QT.normaliseRule(x.seriesSpec) : null
    } };
  };
  QT.cleanList = function (raw) {
    var out = [], seen = {}, bad = 0;
    (QT.asList(raw) || []).forEach(function (x) {
      var r = QT.validateTask(x);
      if (r.task && !seen[r.task.id]) { seen[r.task.id] = 1; out.push(r.task); } else bad++;
    });
    return { tasks: out, bad: bad };
  };
  QT.makeTask = function (f) {
    var now = new Date().toISOString();
    return {
      id: QT.newId(), title: f.title, plannedDate: f.plannedDate, deadline: f.deadline || f.plannedDate,
      priority: f.priority || 'Medium', notes: f.notes || '', done: false, pending: false, movedTo: '',
      createdAt: now, completedAt: '', time: f.time || '', endTime: f.time ? (f.endTime || '') : '',
      seriesId: f.seriesId || '', seriesRule: f.seriesRule || '', seriesSpec: f.seriesSpec || null
    };
  };

  QT.endSeriesBefore = function (tasks, seriesId, cutoff) {
    var kept = tasks.filter(function (x) { return x.seriesId === seriesId; });
    if (!kept.length) return;
    var dates = kept.map(function (x) { return x.plannedDate; }).sort();
    kept.forEach(function (x) {
      if (!x.seriesSpec) return;
      x.seriesSpec.endMode = 'date';
      x.seriesSpec.end = QT.addDays(cutoff, -1) < x.seriesSpec.start ? x.seriesSpec.start : QT.addDays(cutoff, -1);
      x.seriesRule = QT.ruleText(x.seriesSpec, dates[0], dates[dates.length - 1]);
    });
  };
  QT.deleteFromSeries = function (tasks, t, mode) {
    var out = tasks.filter(function (x) {
      if (mode === 'one') return x.id !== t.id;
      if (x.seriesId !== t.seriesId) return true;
      return mode === 'following' ? x.plannedDate < t.plannedDate : false;
    });
    if (mode === 'following') QT.endSeriesBefore(out, t.seriesId, t.plannedDate);
    return out;
  };
  QT.extendSeries = function (tasks, today) {
    today = today || QT.todayISO();
    var groups = {}, added = 0;
    tasks.forEach(function (t) { if (t.seriesId && t.seriesSpec && t.seriesSpec.endMode === 'never') (groups[t.seriesId] = groups[t.seriesId] || []).push(t); });
    Object.keys(groups).forEach(function (sid) {
      var items = groups[sid].sort(function (a, b) { return a.plannedDate < b.plannedDate ? -1 : a.plannedDate > b.plannedDate ? 1 : 0; });
      var tpl = items[items.length - 1], spec = tpl.seriesSpec;
      var genUntil = spec.genUntil || tpl.plannedDate;
      var horizon = QT.openEndedHorizon(spec, today);
      var threshold = QT.addDays(horizon, spec.freq === 'yearly' ? -365 : -35);
      if (genUntil >= threshold) return;
      var dates = QT.datesBetween(spec, QT.addDays(genUntil, 1), horizon);
      dates.forEach(function (d) {
        var n = QT.makeTask({ title: tpl.title, plannedDate: d, deadline: QT.addDays(d, spec.dueOffset || 0), priority: tpl.priority,
          notes: tpl.notes, time: tpl.time, endTime: tpl.endTime, seriesId: sid, seriesRule: tpl.seriesRule, seriesSpec: QT.clone(spec) });
        tasks.push(n); items.push(n); added++;
      });
      items.forEach(function (x) { if (x.seriesSpec) x.seriesSpec.genUntil = horizon; });
    });
    return added;
  };

  var WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  var MON = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  var WD_FULL_RE = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
  var WD_SHORT_RE = 'sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat';
  var MON_RE = 'january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';
  var PRI = { urgent: 'Urgent', u: 'Urgent', '1': 'Urgent', high: 'High', h: 'High', '2': 'High', medium: 'Medium', med: 'Medium', m: 'Medium', '3': 'Medium', low: 'Low', l: 'Low', '4': 'Low' };

  function to24(h, m, mer) {
    h = Number(h); m = Number(m || 0);
    if (m > 59) return null;
    if (mer) {
      if (h < 1 || h > 12) return null;
      mer = mer.toLowerCase();
      if (mer === 'pm' && h < 12) h += 12;
      if (mer === 'am' && h === 12) h = 0;
    } else if (h > 23) return null;
    return pad(h) + ':' + pad(m);
  }
  function ymd(y, m, d) { var dt = new Date(y, m, d); return dt.getMonth() === m && dt.getDate() === d ? QT.toISO(dt) : null; }
  function nextDayMonth(today, m, d) {
    var y = QT.parseISO(today).getFullYear(), iso = ymd(y, m, d);
    if (iso && iso < today) iso = ymd(y + 1, m, d);
    return iso;
  }

  QT.parseQuick = function (input, today) {
    today = today || QT.todayISO();
    var s = ' ' + String(input || '').replace(/\s+/g, ' ') + ' ';
    var r = { title: '', date: '', deadline: '', time: '', endTime: '', priority: '', parts: [] };
    function take(re, fn) {
      s = s.replace(re, function () {
        var res = fn.apply(null, arguments);
        return res === false ? arguments[0] : (arguments[1] || '') + ' ';
      });
    }
    function setDate(prefix, iso) {
      if (!iso) return false;
      if (prefix && /^(by|due)$/i.test(prefix)) { if (r.deadline) return false; r.deadline = iso; return true; }
      if (r.date) return false;
      r.date = iso; return true;
    }

    take(/(^|\s)!(urgent|high|medium|med|low|u|h|m|l|[1-4])(?=\s)/i, function (all, sp, p) { if (r.priority) return false; r.priority = PRI[p.toLowerCase()]; });
    take(/(^|\s)p([1-4])(?=\s)/i, function (all, sp, p) { if (r.priority) return false; r.priority = PRI[p]; });

    take(/(^|\s)(?:at\s+|from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s)/i,
      function (all, sp, h1, m1, a1, h2, m2, a2) {
        if (r.time) return false;
        if (!a1 && !a2 && m1 === undefined && m2 === undefined) return false;
        var end = to24(h2, m2, a2 || a1);
        var start = to24(h1, m1, a1 || (a2 && Number(h1) <= 12 ? a2 : ''));
        if (!a1 && a2 && start && end && start >= end) start = to24(h1, m1, a2.toLowerCase() === 'pm' ? 'am' : 'pm');
        if (!start || !end || end <= start) return false;
        r.time = start; r.endTime = end;
      });
    take(/(^|\s)(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, function (all, sp, h, m, a) { if (r.time) return false; var t = to24(h, m, a); if (!t) return false; r.time = t; });
    take(/(^|\s)(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/i, function (all, sp, h, m) { if (r.time) return false; r.time = pad(Number(h)) + ':' + m; });
    take(/(^|\s)at\s+(\d{1,2})(?=\s)/i, function (all, sp, h) { if (r.time) return false; h = Number(h); if (h > 23) return false; r.time = pad(h >= 1 && h <= 6 ? h + 12 : h) + ':00'; });
    take(/(^|\s)(?:at\s+)?(noon|midday)(?=\s)/i, function () { if (r.time) return false; r.time = '12:00'; });

    var P = '(?:(on|by|due)\s+)?';
    take(new RegExp('(^|\\s)' + P + '(day after tomorrow)(?=\\s)', 'i'), function (all, sp, pre) { return setDate(pre, QT.addDays(today, 2)); });
    take(new RegExp('(^|\\s)' + P + '(today|tonight)(?=\\s)', 'i'), function (all, sp, pre) { return setDate(pre, today); });
    take(new RegExp('(^|\\s)' + P + '(tomorrow|tmrw|tmr)(?=\\s)', 'i'), function (all, sp, pre) { return setDate(pre, QT.addDays(today, 1)); });
    take(new RegExp('(^|\\s)' + P + 'in\\s+(\\d{1,3})\\s*(days?|d|weeks?|wks?|w)(?=\\s)', 'i'), function (all, sp, pre, n, unit) {
      return setDate(pre, QT.addDays(today, Number(n) * (/^w/i.test(unit) ? 7 : 1)));
    });
    take(new RegExp('(^|\\s)' + P + 'next week(?=\\s)', 'i'), function (all, sp, pre) { return setDate(pre, QT.addDays(QT.startOfWeek(today), 7)); });
    take(new RegExp('(^|\\s)' + P + '(\\d{4})-(\\d{2})-(\\d{2})(?=\\s)', 'i'), function (all, sp, pre, y, m, d) { return setDate(pre, ymd(+y, +m - 1, +d)); });
    take(new RegExp('(^|\\s)' + P + '(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?(?=\\s)', 'i'), function (all, sp, pre, d, m, y) {
      if (y) { y = Number(y); if (y < 100) y += 2000; return setDate(pre, ymd(y, +m - 1, +d)); }
      return setDate(pre, nextDayMonth(today, +m - 1, +d));
    });
    take(new RegExp('(^|\\s)' + P + '(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + MON_RE + ')\\.?(?:\\s+(\\d{4}))?(?=\\s)', 'i'), function (all, sp, pre, d, mon, y) {
      var m = MON[mon.toLowerCase()];
      return setDate(pre, y ? ymd(+y, m, +d) : nextDayMonth(today, m, +d));
    });
    take(new RegExp('(^|\\s)' + P + '(' + MON_RE + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)', 'i'), function (all, sp, pre, mon, d, y) {
      var m = MON[mon.toLowerCase()];
      return setDate(pre, y ? ymd(+y, m, +d) : nextDayMonth(today, m, +d));
    });
    function weekday(pre, which, name) {
      var target = WD[name.toLowerCase()], iso;
      if (which && /next/i.test(which)) iso = QT.addDays(QT.addDays(QT.startOfWeek(today), 7), (target + 6) % 7);
      else { var delta = (target - QT.parseISO(today).getDay() + 7) % 7; iso = QT.addDays(today, delta === 0 ? 7 : delta); }
      return setDate(pre, iso);
    }
    take(new RegExp('(^|\\s)(?:(on|by|due)\\s+)?(next\\s+|this\\s+)?(' + WD_FULL_RE + ')(?=\\s)', 'i'), function (all, sp, pre, which, name) { return weekday(pre, which, name); });
    take(new RegExp('(^|\\s)(?:(on|by|due)\\s+(next\\s+|this\\s+)?|()(next\\s+|this\\s+))(' + WD_SHORT_RE + ')\\.?(?=\\s)', 'i'), function (all, sp, pre, which1, none, which2, name) { return weekday(pre, which1 || which2, name); });

    r.title = s.replace(/\s+/g, ' ').trim();
    if (r.time && !r.endTime) r.endTime = QT.addMinutes(r.time, 30) > r.time ? QT.addMinutes(r.time, 30) : '';
    if (r.date) r.parts.push(QT.fmtDay(r.date));
    if (r.time) r.parts.push(QT.timeRange(r));
    if (r.deadline) r.parts.push('due ' + QT.fmtDay(r.deadline));
    if (r.priority) r.parts.push(r.priority);
    return r;
  };

  root.QT = QT;
})(typeof self !== 'undefined' ? self : this);
