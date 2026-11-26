(() => {
  const QT = window.QT, { KEY, LEGACY_KEY, SETTINGS_KEY, esc } = QT;
  const $ = id => document.getElementById(id);
  let tasks = [], selected = QT.todayISO(), lastToday = QT.todayISO(), asking = null, toastTimer = null, theme = 'light';

  async function load() {
    const d = await chrome.storage.local.get([KEY, LEGACY_KEY, SETTINGS_KEY]);
    tasks = QT.cleanList(Array.isArray(d[KEY]) ? d[KEY] : d[LEGACY_KEY]).tasks;
    applyTheme(QT.normaliseSettings(d[SETTINGS_KEY]).theme);
    render();
  }
  async function save() { await chrome.storage.local.set({ [KEY]: tasks }); render(); }
  function applyTheme(t) {
    theme = t;
    document.documentElement.setAttribute('data-theme', QT.effectiveTheme(t));
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(theme));

  function toast(msg, undo) {
    const el = $('toast');
    el.querySelector('span').textContent = msg;
    el.querySelector('button').hidden = !undo;
    el.querySelector('button').onclick = () => { el.hidden = true; if (undo) undo(); };
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
  function withUndo(msg, mutate) {
    const before = QT.clone(tasks);
    mutate();
    save();
    toast(msg, () => { tasks = before; save(); });
  }

  const moved = t => t.movedTo && tasks.find(x => x.id === t.movedTo);
  function render() {
    lastToday = QT.todayISO();
    const today = lastToday;
    $('date').textContent = QT.fmtFull(selected) + (selected === today ? ' · Today' : '');
    $('goToday').hidden = selected === today;
    const day = tasks.filter(t => t.plannedDate === selected).sort((a, b) =>
      Number(a.done) - Number(b.done) || (a.time || '99').localeCompare(b.time || '99') || a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title));

    const doneCount = day.filter(t => t.done).length;
    $('stOpen').textContent = day.filter(t => !t.done).length;
    $('stOver').textContent = day.filter(t => QT.statusKey(t, today) === 'overdue').length;
    $('stSoon').textContent = day.filter(t => QT.statusKey(t, today) === 'soon').length;
    $('stRate').textContent = (day.length ? Math.round(doneCount / day.length * 100) : 0) + '%';
    $('stSub').textContent = `${doneCount} of ${day.length} done`;

    const list = $('list');
    list.innerHTML = day.length ? '' : '<div class="empty">No action items for this day. Add one above.</div>';
    day.forEach(t => {
      const s = QT.statusKey(t, today), m = moved(t), el = document.createElement('div');
      el.className = 'item ' + s;
      const statusLabel = QT.STATUS_LABEL[s] || 'Open';
      const actions = asking === t.id
        ? '<span class="ask">Delete which items?</span><button class="mini danger" data-a="del-one">This one</button><button class="mini danger" data-a="del-following">This and following</button><button class="mini danger" data-a="del-all">Entire series</button><button class="mini" data-a="cancel">Cancel</button>'
        : (t.done ? '' : (t.pending ? '<button class="mini" data-a="unpend">Unmark pending</button>' : '<button class="mini" data-a="pend">Mark pending</button>')) +
          (m ? `<span class="moved">Moved to ${esc(QT.fmtShort(m.plannedDate))}</span>` : '<button class="mini" data-a="next">Move to next day</button>');
      el.innerHTML = `<input type="checkbox" aria-label="Complete ${esc(t.title)}" ${t.done ? 'checked' : ''}><div class="body"><div class="title">${t.seriesId ? '↻ ' : ''}${esc(t.title)}</div>` +
        `<div class="meta"><span class="pill s-${s}">${esc(statusLabel)}</span><span class="pill p-${esc(t.priority)}">${esc(t.priority)}</span><span>${t.time ? esc(QT.timeRange(t)) + ' · ' : ''}Due: ${esc(QT.fmtShort(t.deadline))}</span></div><div class="actions">${actions}</div></div>` +
        `<button class="del" title="Delete" aria-label="Delete ${esc(t.title)}">×</button>`;
      el.querySelector('input').addEventListener('change', e => {
        t.done = e.target.checked; t.pending = false; t.movedTo = ''; t.completedAt = t.done ? new Date().toISOString() : ''; save();
      });
      el.querySelector('.del').addEventListener('click', () => {
        if (t.seriesId && tasks.some(x => x !== t && x.seriesId === t.seriesId)) { asking = t.id; render(); return; }
        withUndo('Deleted “' + t.title + '”', () => { tasks = tasks.filter(x => x.id !== t.id); });
      });
      el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'pend') { t.pending = true; save(); }
        else if (a === 'unpend') { t.pending = false; t.movedTo = ''; save(); }
        else if (a === 'next') {
          if (moved(t)) return;
          const d = QT.nextBusinessDay(t.plannedDate);
          const copy = QT.makeTask({ title: t.title, plannedDate: d, deadline: t.deadline === t.plannedDate ? d : t.deadline, priority: t.priority, notes: t.notes,
            time: t.time, endTime: t.endTime, seriesId: t.seriesId, seriesRule: t.seriesRule, seriesSpec: t.seriesSpec ? QT.clone(t.seriesSpec) : null });
          tasks.push(copy); t.pending = true; t.movedTo = copy.id; selected = d; save();
        }
        else if (a === 'cancel') { asking = null; render(); }
        else if (a.startsWith('del-')) {
          const mode = a.slice(4), before = QT.clone(tasks), n0 = tasks.length; asking = null;
          tasks = QT.deleteFromSeries(tasks, t, mode);
          save();
          toast(QT.plural(n0 - tasks.length, 'item') + ' deleted', () => { tasks = before; save(); });
        }
      }));
      list.appendChild(el);
    });
    $('count').textContent = `${tasks.filter(t => !t.done).length} open · synced`;
  }
  function renderPreview() {
    const v = $('title').value;
    if (!v.trim()) {
      $('preview').innerHTML = `<span>Target: <b>${esc(QT.fmtDay(selected))}</b> · Try <span class="tag hi">!high</span> <span class="tag dt">tomorrow</span></span>`;
      return;
    }
    const p = QT.parseQuick(v, QT.todayISO());
    const tags = [QT.fmtDay(p.date || selected)].concat(p.time ? [QT.timeRange(p)] : [], p.deadline ? ['due ' + QT.fmtDay(p.deadline)] : [], [p.priority || 'Medium']);
    $('preview').innerHTML = tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('');
  }

  $('add').addEventListener('submit', e => {
    e.preventDefault();
    const p = QT.parseQuick($('title').value, QT.todayISO());
    if (!p.title) return;
    const date = p.date || selected;
    const n = QT.makeTask({ title: p.title.slice(0, QT.MAX_TITLE), plannedDate: date, deadline: p.deadline || date, priority: p.priority || 'Medium', time: p.time, endTime: p.endTime });
    $('title').value = '';
    selected = date;
    withUndo('Added to ' + QT.fmtDay(date) + (n.time ? ' at ' + n.time : ''), () => { tasks.push(n); });
    renderPreview();
  });
  $('title').addEventListener('input', renderPreview);
  $('prev').addEventListener('click', () => { selected = QT.addDays(selected, -1); asking = null; render(); renderPreview(); });
  $('next').addEventListener('click', () => { selected = QT.addDays(selected, 1); asking = null; render(); renderPreview(); });
  $('goToday').addEventListener('click', () => { selected = QT.todayISO(); render(); renderPreview(); });
  $('close').addEventListener('click', () => window.close());
  setInterval(() => { if (QT.todayISO() !== lastToday) render(); }, 30000);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[KEY]) { tasks = QT.cleanList(changes[KEY].newValue).tasks; render(); }
    if (changes[SETTINGS_KEY]) applyTheme(QT.normaliseSettings(changes[SETTINGS_KEY].newValue).theme);
  });
  load();
  renderPreview();
})();
