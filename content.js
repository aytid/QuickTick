(() => {
  if (window.__quicktickInjected) return;
  window.__quicktickInjected = true;
  const QT = window.QT;
  if (!QT) return;
  const { KEY, LEGACY_KEY, SETTINGS_KEY, esc } = QT;
  let shell = null, root = null, dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;
  let selectedDate = null, toastTimer = null, lastToday = null, dayTimer = null, asking = null, theme = 'light';

  const q = sel => root && root.querySelector(sel);
  const today = () => QT.todayISO();

  function readAll() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([KEY, LEGACY_KEY, SETTINGS_KEY], data => {
          if (chrome.runtime.lastError) { resolve({ items: [], settings: QT.normaliseSettings() }); return; }
          resolve({ items: QT.cleanList(Array.isArray(data[KEY]) ? data[KEY] : data[LEGACY_KEY]).tasks, settings: QT.normaliseSettings(data[SETTINGS_KEY]) });
        });
      } catch (_) { resolve({ items: [], settings: QT.normaliseSettings() }); }
    });
  }
  const load = async () => (await readAll()).items;
  function save(items) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [KEY]: items }, () => {
          if (chrome.runtime.lastError) { showToast('Could not save your changes.'); resolve(false); return; }
          resolve(true);
        });
      } catch (_) { showToast('QuickTick was updated. Please reload this page.'); resolve(false); }
    });
  }
  async function saveWithUndo(before, items, msg) {
    if (await save(items)) showToast(msg, async () => { await save(before); });
  }
  const hasMovedCopy = (t, items) => !!(t.movedTo && items.some(x => x.id === t.movedTo));

  function showToast(message, undo) {
    const el = q('.dm-toast');
    if (!el) return;
    el.querySelector('span').textContent = message;
    const b = el.querySelector('button');
    b.hidden = !undo;
    b.onclick = () => { el.classList.remove('show'); if (undo) undo(); };
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 3200);
  }

  function applyTheme(t) {
    theme = t || theme;
    const w = q('.wrap'); if (!w) return;
    const eff = QT.effectiveTheme(theme);
    w.setAttribute('data-theme', eff);
    if (shell) {
      shell.style.borderColor = eff === 'dark' ? '#3E3E3A' : '#141413';
      shell.style.boxShadow = eff === 'dark' ? '6px 6px 0px #000000, 0 22px 48px rgba(0,0,0,0.65)' : '6px 6px 0px #141413, 0 22px 48px rgba(20,20,19,0.22)';
    }
  }

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box}
    [hidden]{display:none!important}
    .wrap{
      --bg:#F7F6F2;--card:#FFFFFF;--input:#FFFFFF;--text:#141413;--muted:#686762;--faint:#8E8C86;
      --border:#141413;--hover:#F1EFE8;--subtle:#F1EFE8;
      --accent:#00D26A;--accent-hover:#00B85C;--overdue:#FF5E3A;--soon:#B45309;--soon-line:#FFB800;--soon-bg:#FFF9E6;
      --open:#2563EB;--open-bg:#EEF4FF;--pending:#7E22CE;--pending-bg:#F6EEFF;--done-bg:#E8FBF1;--ink:#141413;--on-ink:#FFFFFF;
      --shadow-xs:2px 2px 0px #141413;--shadow-sm:3px 3px 0px #141413;
      --mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;
      color-scheme:light;
      display:flex;flex-direction:column;width:100%;height:100%;
      background-color:var(--bg);
      background-image:radial-gradient(rgba(20,20,19,0.13) 1.1px,transparent 1.1px);
      background-size:16px 16px;
      color:var(--text);font:12.5px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
    }
    .wrap[data-theme="dark"]{
      --bg:#131312;--card:#1C1C1A;--input:#161614;--text:#F4F3EE;--muted:#A6A49D;--faint:#73716A;
      --border:#3E3E3A;--hover:#262623;--subtle:#252522;
      --accent:#00E072;--accent-hover:#00C464;--overdue:#FF6B4A;--soon:#FBBF24;--soon-line:#FFB800;--soon-bg:rgba(255,184,0,0.14);
      --open:#60A5FA;--open-bg:rgba(96,165,250,0.14);--pending:#C084FC;--pending-bg:rgba(192,132,252,.14);--done-bg:rgba(0,224,114,0.14);--ink:#F4F3EE;--on-ink:#141413;
      --shadow-xs:2px 2px 0px #000000;--shadow-sm:3px 3px 0px #000000;
      background-image:radial-gradient(rgba(255,255,255,0.08) 1.1px,transparent 1.1px);
      color-scheme:dark;
    }
    button,input{font:inherit;color:inherit}
    button{cursor:pointer}

    /* Header */
    .dm-head{height:48px;flex:0 0 48px;padding:0 13px;display:flex;align-items:center;justify-content:space-between;background:var(--card);border-bottom:2px solid var(--border);cursor:move;user-select:none;touch-action:none}
    .dm-brand{display:flex;align-items:center;gap:9px;font-weight:900;font-size:15.5px;letter-spacing:-0.02em;min-width:0}
    .dm-dot{width:24px;height:24px;flex:0 0 24px;border-radius:7px;background:var(--accent);border:2px solid var(--border);box-shadow:var(--shadow-xs);position:relative}
    .dm-dot:after{content:"✓";position:absolute;inset:0;color:#141413;font:900 14px/20px system-ui;text-align:center}
    .dm-badge-live{font-family:var(--mono);font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:6px;background:var(--subtle);border:1.5px solid var(--border);color:var(--text)}
    .dm-close{width:28px;height:28px;border-radius:8px;border:2px solid var(--border);background:var(--card);box-shadow:var(--shadow-xs);color:var(--text);font-size:17px;font-weight:800;line-height:1;display:grid;place-items:center}
    .dm-close:hover{background:var(--overdue);color:#fff}

    /* 4-Cell Segmented Metric Strip (Matches Screenshot 29 KPI cards) */
    .dm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 10px 9px;background:var(--card);border:2px solid var(--border);border-radius:12px;box-shadow:var(--shadow-sm);overflow:hidden;flex:none}
    .dm-stat{padding:7px 8px;min-width:0;border-right:1.5px solid var(--border);position:relative}
    .dm-stat:last-child{border-right:0}
    .dm-stat-top{display:flex;align-items:center;justify-content:space-between;gap:3px}
    .dm-label{font-family:var(--mono);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
    .dm-led{width:7px;height:7px;border-radius:50%;border:1.5px solid var(--border);flex:none}
    .dm-led.open{background:#3B82F6}
    .dm-led.over{background:var(--overdue)}
    .dm-led.soon{background:var(--soon-line)}
    .dm-led.done{background:var(--accent)}
    .dm-num{font-size:19px;font-weight:900;line-height:1.15;font-variant-numeric:tabular-nums;margin-top:2px}
    .dm-sub{font-size:9px;font-weight:600;color:var(--muted);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .dm-over .dm-num{color:var(--overdue)}
    .dm-soon-cell{background:var(--soon-bg)}
    .dm-done-cell{background:var(--done-bg)}

    /* Quick Add */
    .dm-add{display:flex;gap:6px;padding:0 10px;flex:none}
    .dm-add input{min-width:0;flex:1;border:2px solid var(--border);background:var(--input);border-radius:9px;padding:7px 10px;font-weight:500;box-shadow:var(--shadow-xs)}
    .dm-add input:focus{outline:none;background:var(--card);box-shadow:3px 3px 0px var(--accent)}
    .dm-add button{border:2px solid var(--border);background:var(--accent);color:#141413;font-weight:800;border-radius:9px;padding:0 12px;box-shadow:var(--shadow-xs);transition:transform .1s}
    .dm-add button:hover{background:var(--accent-hover);transform:translate(-1px,-1px)}
    .dm-add button:active{transform:translate(1px,1px);box-shadow:none}

    .dm-preview{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:22px;padding:5px 12px 6px;font-family:var(--mono);font-size:10px;color:var(--muted);flex:none}
    .dm-preview .tag{background:var(--card);border:1.5px solid var(--border);border-radius:5px;padding:1px 6px;color:var(--text);font-weight:700;font-size:10px}
    .dm-preview .tag.hi{background:#FFF0EC;color:#C83214;border-color:#FF5E3A}
    .dm-preview .tag.dt{background:#EEF4FF;color:#1D4ED8;border-color:#2563EB}

    /* Date Navigator */
    .dm-date-nav{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:0 10px 8px;flex:none}
    .dm-date-nav > button{border:1.5px solid var(--border);background:var(--card);border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:var(--shadow-xs)}
    .dm-date-nav > button:hover{background:var(--hover)}
    .dm-selected-date{font-size:11.5px;font-weight:800;text-align:center;min-width:0;letter-spacing:-0.01em}
    .dm-today-btn{display:block;margin:2px auto 0;border:0!important;box-shadow:none!important;background:none!important;color:#009E4F;font-size:10px;font-weight:800;padding:0!important;text-decoration:underline}

    /* Toast */
    .dm-toast{display:none;align-items:center;gap:8px;margin:0 10px 8px;padding:7px 10px;background:var(--ink);color:var(--on-ink);border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-weight:600;flex:none}
    .dm-toast.show{display:flex}
    .dm-toast span{flex:1}.dm-toast button{border:0;background:none;color:var(--accent);font-weight:800;text-decoration:underline;padding:0}

    /* Task List (Matches Screenshot 29 Right Drawer Cards) */
    .dm-list{padding:0 10px 10px;display:flex;flex-direction:column;gap:7px;flex:1;min-height:0;overflow:auto}
    .dm-item{display:flex;gap:8px;align-items:flex-start;background:var(--card);border:2px solid var(--border);border-left:5px solid var(--open);border-radius:11px;padding:7px 9px;box-shadow:var(--shadow-xs);transition:transform .1s}
    .dm-item:hover{transform:translate(-1px,-1px);box-shadow:var(--shadow-sm)}
    .dm-item.overdue{border-left-color:var(--overdue)}.dm-item.soon{border-left-color:var(--soon-line)}
    .dm-item.done{border-left-color:var(--accent);opacity:.68;box-shadow:none}.dm-item.pending{border-left-color:var(--pending);background:var(--pending-bg)}
    .dm-item input[type=checkbox]{width:16px;height:16px;flex:0 0 16px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
    .dm-body{min-width:0;flex:1}
    .dm-title{font-weight:800;font-size:12.5px;overflow-wrap:anywhere;line-height:1.3}
    .dm-item.done .dm-title{text-decoration:line-through;color:var(--muted)}
    .dm-meta{color:var(--muted);font-size:10.5px;margin-top:3px;display:flex;flex-wrap:wrap;align-items:center;gap:4px}
    .dm-pill{font-family:var(--mono);font-size:9.5px;font-weight:800;padding:1px 5px;border-radius:5px;border:1px solid var(--border);background:var(--subtle);color:var(--text)}
    .dm-pill.s-soon{background:#FFF4D6;color:#8A5A00;border-color:#D99B00}
    .dm-pill.s-overdue{background:#FFF0EC;color:#C83214;border-color:#FF5E3A}
    .dm-pill.s-open{background:#EEF4FF;color:#1D4ED8;border-color:#2563EB}
    .dm-pill.s-done{background:#E8FBF1;color:#007A3D;border-color:#00D26A}
    .dm-pill.p-Urgent,.dm-pill.p-High{background:#FFF0EC;color:#C83214;border-color:#FF5E3A}
    .dm-item-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;align-items:center}
    .dm-mini-action{border:1.5px solid var(--border);background:var(--card);border-radius:7px;padding:2px 7px;font-size:10px;font-weight:700;white-space:nowrap}
    .dm-mini-action:hover{background:var(--hover)}
    .dm-mini-action.danger{color:var(--overdue);border-color:var(--overdue)}
    .dm-ask{font-size:10.5px;font-weight:700;width:100%}
    .dm-moved{font-size:10px;color:var(--pending);font-weight:700}
    .dm-del{border:0;background:transparent;color:var(--faint);font-size:17px;font-weight:700;line-height:1;padding:0 2px}
    .dm-del:hover{color:var(--overdue)}
    .dm-empty{padding:22px 12px;text-align:center;color:var(--muted);font-weight:600;background:var(--card);border:1.5px dashed var(--border);border-radius:10px}

    /* Footer */
    .dm-foot{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;background:var(--card);border-top:2px solid var(--border);color:var(--muted);font-size:10.5px;font-weight:600;flex:none}
    .dm-maker-link{color:var(--text);font-weight:800;text-decoration:none}.dm-maker-link:hover{text-decoration:underline}
    .dm-dashboard{border:1.5px solid var(--border);background:var(--ink);color:var(--on-ink);font-weight:800;font-size:10.5px;padding:4px 9px;border-radius:7px;box-shadow:var(--shadow-xs)}
    .dm-dashboard:hover{background:var(--accent);color:#141413}
  `;

  function clampShell() {
    if (!shell || !shell.style.left) return;
    const w = shell.offsetWidth, h = shell.offsetHeight;
    const x = Math.max(0, Math.min(innerWidth - w, parseFloat(shell.style.left) || 0));
    const y = Math.max(0, Math.min(innerHeight - h, parseFloat(shell.style.top) || 0));
    shell.style.left = x + 'px'; shell.style.top = y + 'px';
  }
  function destroy() {
    window.removeEventListener('resize', clampShell);
    clearInterval(dayTimer);
    if (shell) shell.remove();
    shell = null; root = null; selectedDate = null; asking = null;
  }

  function create() {
    if (shell) { destroy(); return; }
    shell = document.createElement('quicktick-floating-panel');
    shell.id = 'quicktick-floating-shell';
    Object.assign(shell.style, {
      all: 'initial', position: 'fixed', right: '22px', bottom: '22px', width: '416px', height: '595px',
      maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', zIndex: '2147483647',
      borderRadius: '16px', overflow: 'hidden', boxShadow: '6px 6px 0px #141413, 0 22px 48px rgba(20,20,19,.22)',
      border: '2.5px solid #141413', display: 'block', resize: 'both', minWidth: '340px', minHeight: '380px'
    });
    root = shell.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap">
      <div class="dm-head">
        <span class="dm-brand"><span class="dm-dot"></span>QuickTick <span class="dm-badge-live">TACTILE</span></span>
        <button class="dm-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="dm-stats">
        <div class="dm-stat"><div class="dm-stat-top"><span class="dm-label">Open</span><span class="dm-led open"></span></div><div class="dm-num" data-k="open">0</div><div class="dm-sub">Planned today</div></div>
        <div class="dm-stat dm-over"><div class="dm-stat-top"><span class="dm-label">Overdue</span><span class="dm-led over"></span></div><div class="dm-num" data-k="overdue">0</div><div class="dm-sub">Deadline passed</div></div>
        <div class="dm-stat dm-soon-cell"><div class="dm-stat-top"><span class="dm-label">Due soon</span><span class="dm-led soon"></span></div><div class="dm-num" data-k="soon">0</div><div class="dm-sub">Next 3 days</div></div>
        <div class="dm-stat dm-done-cell"><div class="dm-stat-top"><span class="dm-label">Completed</span><span class="dm-led done"></span></div><div class="dm-num" data-k="rate">0%</div><div class="dm-sub" data-k="rateSub">0 of 0 done</div></div>
      </div>
      <form class="dm-add" autocomplete="off"><input maxlength="200" placeholder="Call Sam tomorrow 2pm !high" aria-label="New action item"><button type="submit">+ Add</button></form>
      <div class="dm-preview" aria-live="polite"></div>
      <div class="dm-date-nav"><button type="button" data-day-shift="-1" aria-label="Previous day">‹ Prev</button><div><div class="dm-selected-date" aria-live="polite"></div><button type="button" class="dm-today-btn" data-go-today hidden>Back to today</button></div><button type="button" data-day-shift="1" aria-label="Next day">Next ›</button></div>
      <div class="dm-toast" role="status" aria-live="polite"><span></span><button type="button">Undo</button></div>
      <div class="dm-list"><div class="dm-empty">Loading action items…</div></div>
      <div class="dm-foot"><span>Made by <a class="dm-maker-link" href="https://www.linkedin.com/in/rohan-aditya-thirumala-6b8228264?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" rel="noopener noreferrer">Rohan Aditya</a></span><button type="button" class="dm-dashboard">Full dashboard ↗</button></div>
      </div>`;
    document.documentElement.appendChild(shell);

    const head = q('.dm-head');
    q('.dm-close').addEventListener('click', destroy);
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      dragging = true; startX = e.clientX; startY = e.clientY;
      const r = shell.getBoundingClientRect(); originX = r.left; originY = r.top;
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!dragging || !shell) return;
      const x = Math.max(0, Math.min(innerWidth - shell.offsetWidth, originX + e.clientX - startX));
      const y = Math.max(0, Math.min(innerHeight - shell.offsetHeight, originY + e.clientY - startY));
      Object.assign(shell.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    });
    head.addEventListener('pointerup', () => dragging = false);
    head.addEventListener('pointercancel', () => dragging = false);
    window.addEventListener('resize', clampShell);

    const input = q('.dm-add input');
    input.addEventListener('input', renderPreview);
    root.addEventListener('keydown', e => e.stopPropagation());
    q('.dm-add').addEventListener('submit', async e => {
      e.preventDefault();
      const p = QT.parseQuick(input.value, today());
      if (!p.title) return;
      const items = await load(), before = QT.clone(items), d = p.date || selectedDate || today();
      const n = QT.makeTask({ title: p.title.slice(0, QT.MAX_TITLE), plannedDate: d, deadline: p.deadline || d, priority: p.priority || 'Medium', time: p.time, endTime: p.endTime });
      items.push(n);
      input.value = '';
      if (d !== today()) selectedDate = d;
      await saveWithUndo(before, items, 'Added to ' + QT.fmtDay(d) + (n.time ? ' at ' + n.time : ''));
      renderPreview();
    });
    q('.dm-date-nav').addEventListener('click', e => {
      if (e.target.closest('[data-go-today]')) { selectedDate = null; render(); renderPreview(); return; }
      const btn = e.target.closest('[data-day-shift]');
      if (!btn) return;
      selectedDate = QT.addDays(selectedDate || today(), Number(btn.dataset.dayShift));
      asking = null;
      render(); renderPreview();
    });
    q('.dm-list').addEventListener('change', async e => {
      if (!e.target.matches('[data-action="toggle"]')) return;
      const id = e.target.closest('[data-id]').dataset.id, checked = e.target.checked, items = await load();
      await save(items.map(t => t.id === id ? { ...t, done: checked, pending: false, movedTo: '', completedAt: checked ? new Date().toISOString() : '' } : t));
    });
    q('.dm-list').addEventListener('click', async e => {
      const b = e.target.closest('[data-action]'); if (!b || b.dataset.action === 'toggle') return;
      const id = b.closest('[data-id]').dataset.id, items = await load(), t = items.find(x => x.id === id);
      if (!t) return;
      const act = b.dataset.action, before = QT.clone(items);
      if (act === 'pending') {
        if (t.done) return;
        t.pending = true; await save(items);
      } else if (act === 'unpending') {
        t.pending = false; t.movedTo = ''; await save(items);
      } else if (act === 'nextday') {
        if (hasMovedCopy(t, items)) return;
        const d = QT.nextBusinessDay(t.plannedDate);
        const copy = QT.makeTask({ title: t.title, plannedDate: d, deadline: t.deadline === t.plannedDate ? d : t.deadline, priority: t.priority, notes: t.notes,
          time: t.time, endTime: t.endTime, seriesId: t.seriesId, seriesRule: t.seriesRule, seriesSpec: t.seriesSpec ? QT.clone(t.seriesSpec) : null });
        items.push(copy); t.pending = true; t.movedTo = copy.id;
        selectedDate = d;
        await saveWithUndo(before, items, 'Moved to ' + QT.fmtDay(d) + '. Original marked pending.');
      } else if (act === 'delete') {
        if (t.seriesId && items.some(x => x.id !== t.id && x.seriesId === t.seriesId)) { asking = t.id; render(); return; }
        await saveWithUndo(before, items.filter(x => x.id !== id), 'Deleted “' + t.title + '”');
      } else if (act === 'cancel') {
        asking = null; render();
      } else if (act.startsWith('del-')) {
        asking = null;
        const next = QT.deleteFromSeries(items, t, act.slice(4));
        await saveWithUndo(before, next, QT.plural(items.length - next.length, 'item') + ' deleted');
      }
    });
    q('.dm-dashboard').addEventListener('click', () => {
      try { chrome.runtime.sendMessage({ type: 'QuickTick_OPEN_DASHBOARD' }); } catch (_) { showToast('Reload this page to use QuickTick again.'); }
    });
    lastToday = today();
    dayTimer = setInterval(() => { if (today() !== lastToday) render(); }, 30000);
    render();
    renderPreview();
  }

  function renderPreview() {
    const input = q('.dm-add input'), box = q('.dm-preview');
    if (!input || !box) return;
    const base = selectedDate || today();
    if (!input.value.trim()) {
      box.innerHTML = `<span>Target: <b>${esc(QT.fmtDay(base))}</b> · Try <span class="tag hi">!high</span> <span class="tag dt">tomorrow</span></span>`;
      return;
    }
    const p = QT.parseQuick(input.value, today());
    const tags = [QT.fmtDay(p.date || base)].concat(p.time ? [QT.timeRange(p)] : [], p.deadline ? ['due ' + QT.fmtDay(p.deadline)] : [], [p.priority || 'Medium']);
    box.innerHTML = tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('');
  }

  async function render() {
    if (!shell || !shell.isConnected || !root) return;
    lastToday = today();
    const { items, settings } = await readAll(), viewDate = selectedDate || today();
    if (!root) return;
    applyTheme(settings.theme);
    const dayItems = items.filter(t => t.plannedDate === viewDate);
    const done = dayItems.filter(t => t.done).length;
    const put = (key, value) => { const el = q(`[data-k="${key}"]`); if (el) el.textContent = value; };
    put('open', dayItems.filter(t => !t.done).length);
    put('overdue', dayItems.filter(t => QT.statusKey(t) === 'overdue').length);
    put('soon', dayItems.filter(t => QT.statusKey(t) === 'soon').length);
    put('rate', (dayItems.length ? Math.round(done / dayItems.length * 100) : 0) + '%');
    put('rateSub', `${done} of ${dayItems.length} done`);
    dayItems.sort((a, b) => Number(a.done) - Number(b.done) || (a.time || '99').localeCompare(b.time || '99') || a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title));
    q('.dm-selected-date').textContent = QT.fmtFull(viewDate) + (viewDate === today() ? ' · Today' : '');
    q('[data-go-today]').hidden = viewDate === today();
    const list = q('.dm-list'); if (!list) return;
    list.innerHTML = dayItems.length ? dayItems.map(t => {
      const s = QT.statusKey(t);
      const statusLabel = QT.STATUS_LABEL[s] || 'Open';
      const target = hasMovedCopy(t, items) ? items.find(x => x.id === t.movedTo) : null;
      const actions = asking === t.id
        ? '<span class="dm-ask">Delete which items?</span><button class="dm-mini-action danger" data-action="del-one">This one</button><button class="dm-mini-action danger" data-action="del-following">This and following</button><button class="dm-mini-action danger" data-action="del-all">Entire series</button><button class="dm-mini-action" data-action="cancel">Cancel</button>'
        : (!t.done ? (t.pending ? '<button class="dm-mini-action" data-action="unpending">Unmark pending</button>' : '<button class="dm-mini-action" data-action="pending">Mark pending</button>') : '') +
          (target ? `<span class="dm-moved">Moved to ${esc(QT.fmtShort(target.plannedDate))}</span>` : '<button class="dm-mini-action" data-action="nextday">Move to next day</button>');
      return `<div class="dm-item ${s}" data-id="${esc(t.id)}"><input type="checkbox" data-action="toggle" ${t.done ? 'checked' : ''} aria-label="Complete ${esc(t.title)}"><div class="dm-body"><div class="dm-title">${t.seriesId ? '↻ ' : ''}${esc(t.title)}</div><div class="dm-meta"><span class="dm-pill s-${s}">${esc(statusLabel)}</span><span class="dm-pill p-${esc(t.priority)}">${esc(t.priority)}</span><span>${t.time ? esc(QT.timeRange(t)) + ' · ' : ''}Due: ${esc(QT.fmtShort(t.deadline))}</span></div><div class="dm-item-actions">${actions}</div></div><button class="dm-del" data-action="delete" title="Delete" aria-label="Delete ${esc(t.title)}">×</button></div>`;
    }).join('') : '<div class="dm-empty">No action items for this day.<br>Add one above to get started.</div>';
  }

  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'QuickTick_TOGGLE_MACRO') create(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEY] || changes[LEGACY_KEY] || changes[SETTINGS_KEY])) render();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
})();
