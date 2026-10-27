(() => {
  if (window.__quicktickInjected) return;
  window.__quicktickInjected = true;

  const KEY = 'QuickTick_action_items_v1';
  const LEGACY_KEY = 'daymark_action_items_v1'; // pre-1.3.9 key, read for migration only
  const LOCALE = 'en-GB';
  let shell = null, root = null, dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;
  let selectedDate = null, toastTimer = null, lastToday = null, dayTimer = null;

  const q = sel => root && root.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = () => fmt(new Date());
  const shiftDate = (iso, amount) => {
    const d = new Date((iso || today()) + 'T12:00:00');
    d.setDate(d.getDate() + amount);
    return fmt(d);
  };
  const headingDate = iso => new Date((iso || today()) + 'T12:00:00')
    .toLocaleDateString(LOCALE, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const dateLabel = s => {
    if (!s) return 'No deadline';
    const d = new Date(s + 'T12:00:00');
    return isNaN(d) ? 'No deadline' : d.toLocaleDateString(LOCALE, {day:'numeric', month:'short', year:'numeric'});
  };
  const newId = () => 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const showToast = message => {
    const el = q('.dm-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  };
  const asList = raw => Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : null);

  function load() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([KEY, LEGACY_KEY], data => {
          if (chrome.runtime.lastError) { resolve([]); return; }
          resolve(asList(data[KEY]) || asList(data[LEGACY_KEY]) || []);
        });
      } catch (_) { resolve([]); } // extension was reloaded; this page's script is orphaned
    });
  }
  function save(items) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({[KEY]: items}, () => {
          if (chrome.runtime.lastError) { showToast('Could not save your changes.'); resolve(false); return; }
          resolve(true); // the storage.onChanged listener re-renders
        });
      } catch (_) { showToast('QuickTick was updated — please reload this page.'); resolve(false); }
    });
  }
  function state(t) {
    if (t.done) return 'done';
    if (t.pending) return 'pending';
    if (!t.deadline) return 'open';
    const diff = Math.round((new Date(t.deadline+'T12:00:00') - new Date(today()+'T12:00:00')) / 86400000);
    return diff < 0 ? 'overdue' : diff <= 3 ? 'soon' : 'open';
  }
  const hasMovedCopy = (t, items) => !!(t.movedTo && items.some(x => String(x.id) === String(t.movedTo)));

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box}
    .wrap{display:flex;flex-direction:column;width:100%;height:100%;background:#f5f7fb;color:#172033;font:13px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    button,input{font:inherit}
    button{cursor:pointer}
    .dm-head{height:38px;flex:0 0 38px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e3e8f0;cursor:move;user-select:none;touch-action:none}
    .dm-brand{display:flex;align-items:center;gap:9px;font-weight:800;color:#172554;min-width:0}
    .dm-titlebrand{font-size:15px;letter-spacing:-.025em;color:#172554;font-weight:850;line-height:1}
    .dm-dot{width:15px;height:15px;flex:0 0 15px;border-radius:4px;background:#16a34a;box-shadow:0 0 0 3px #dcfce7;position:relative}
    .dm-dot:after{content:"✓";position:absolute;inset:0;color:#fff;font:900 11px/15px system-ui;text-align:center}
    .dm-close{border:0;background:transparent;color:#64748b;font-size:22px;line-height:1;padding:0 3px}
    .dm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px 10px 8px}
    .dm-stat{background:#fff;border:1px solid #e3e8f0;border-radius:9px;padding:7px 8px;min-width:0}
    .dm-label{font-size:9px;text-transform:uppercase;font-weight:800;letter-spacing:.03em;color:#718096}
    .dm-num{font-size:20px;font-weight:750;line-height:1.25}
    .dm-sub{font-size:9px;color:#718096;line-height:1.25}
    .dm-open .dm-num{color:#2563eb}.dm-over .dm-num{color:#dc2626}.dm-soon .dm-num{color:#b45309}.dm-rate .dm-num{color:#15803d}
    .dm-add{display:flex;gap:6px;padding:0 10px 9px}
    .dm-add input{min-width:0;flex:1;border:1px solid #d7deea;background:#fff;color:#172033;border-radius:8px;padding:8px}
    .dm-add button{border:0;background:#4f46e5;color:#fff;font-weight:700;border-radius:8px;padding:0 12px}
    .dm-date-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px 8px}
    .dm-date-nav button{border:1px solid #dbe2ee;background:#fff;color:#334155;border-radius:7px;padding:6px 9px;font-size:11px;font-weight:700;white-space:nowrap}
    .dm-date-nav button:hover{background:#f0fdf4;border-color:#86efac}
    .dm-selected-date{font-size:11px;font-weight:750;color:#334155;text-align:center;min-width:0}
    .dm-today-btn{display:block;margin:3px auto 0;border:0;background:none;color:#4f46e5;font-size:10px;font-weight:700;padding:0}
    [hidden]{display:none!important}
    .dm-toast{display:none;margin:0 10px 8px;padding:7px 9px;border:1px solid #86efac;background:#f0fdf4;color:#166534;border-radius:7px;font-size:11px;font-weight:650}
    .dm-toast.show{display:block}
    .dm-list{padding:0 10px 10px;display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow:auto}
    .dm-item{display:flex;gap:8px;align-items:flex-start;background:#fff;border:1px solid #e3e8f0;border-left:3px solid #2563eb;border-radius:8px;padding:8px}
    .dm-item.overdue{border-left-color:#dc2626}.dm-item.soon{border-left-color:#f59e0b}
    .dm-item.done{border-left-color:#15803d;opacity:.72}.dm-item.pending{border-left-color:#9333ea;background:#fcf8ff}
    .dm-item input[type=checkbox]{appearance:none;-webkit-appearance:none;display:inline-grid;place-content:center;width:17px;height:17px;min-width:17px;flex:0 0 17px;margin:1px 0 0;border:1.5px solid #94a3b8;border-radius:4px;background:#fff;cursor:pointer}
    .dm-item input[type=checkbox]:checked{background:#16a34a;border-color:#16a34a}
    .dm-item input[type=checkbox]:checked:after{content:"✓";color:#fff;font:900 13px/1 system-ui}
    .dm-item input[type=checkbox]:focus-visible{outline:2px solid #86efac;outline-offset:2px}
    .dm-body{min-width:0;flex:1}
    .dm-title{font-weight:650;overflow-wrap:anywhere}
    .dm-item.done .dm-title{text-decoration:line-through;color:#718096}
    .dm-item-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;align-items:center}
    .dm-mini-action{border:1px solid #dbe2ee;background:#fff;color:#475569;border-radius:5px;padding:3px 5px;font-size:10px;white-space:nowrap}
    .dm-mini-action:hover{background:#f8fafc}
    .dm-moved{font-size:10px;color:#6b21a8;font-weight:650}
    .dm-meta{color:#718096;font-size:10px;margin-top:3px}
    .dm-del{border:0;background:transparent;color:#94a3b8;font-size:17px;line-height:1;padding:0 2px}
    .dm-del:hover{color:#dc2626}
    .dm-empty{padding:20px 12px;text-align:center;color:#718096}
    .dm-foot{display:flex;justify-content:space-between;align-items:center;padding:0 10px 10px;color:#718096;font-size:10px}
    .dm-maker-link{color:inherit;text-decoration:none}.dm-maker-link:hover{text-decoration:underline;color:#166534}
    .dm-foot button{border:0;background:none;color:#4f46e5;font-weight:700;padding:0}
  `;

  function clampShell() {
    if (!shell || !shell.style.left) return; // still anchored bottom-right by CSS
    const w = shell.offsetWidth, h = shell.offsetHeight;
    const x = Math.max(0, Math.min(innerWidth - w, parseFloat(shell.style.left) || 0));
    const y = Math.max(0, Math.min(innerHeight - h, parseFloat(shell.style.top) || 0));
    shell.style.left = x + 'px'; shell.style.top = y + 'px';
  }
  function destroy() {
    window.removeEventListener('resize', clampShell);
    clearInterval(dayTimer);
    if (shell) shell.remove();
    shell = null; root = null; selectedDate = null;
  }

  function create() {
    if (shell) { destroy(); return; }
    shell = document.createElement('quicktick-floating-panel');
    shell.id = 'quicktick-floating-shell';
    Object.assign(shell.style, {
      all:'initial', position:'fixed', right:'22px', bottom:'22px', width:'410px', height:'535px',
      maxWidth:'calc(100vw - 16px)', maxHeight:'calc(100vh - 16px)', zIndex:'2147483647',
      borderRadius:'14px', overflow:'hidden', boxShadow:'0 16px 48px rgba(15,23,42,.28)',
      border:'1px solid #dbe2ee', display:'block', resize:'both', minWidth:'320px', minHeight:'350px'
    });
    root = shell.attachShadow({mode:'open'});
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap">
      <div class="dm-head"><span class="dm-brand"><span class="dm-dot"></span><span class="dm-titlebrand">QuickTick</span></span><button class="dm-close" type="button" aria-label="Close">×</button></div>
      <div class="dm-stats">
        <div class="dm-stat dm-open"><div class="dm-label">Open Action Items</div><div class="dm-num" data-k="open">0</div><div class="dm-sub">Unfinished, selected day</div></div>
        <div class="dm-stat dm-over"><div class="dm-label">Overdue</div><div class="dm-num" data-k="overdue">0</div><div class="dm-sub">Deadline passed</div></div>
        <div class="dm-stat dm-soon"><div class="dm-label">Due Soon</div><div class="dm-num" data-k="soon">0</div><div class="dm-sub">Today + 3 days</div></div>
        <div class="dm-stat dm-rate"><div class="dm-label">Day Completion</div><div class="dm-num" data-k="rate">0%</div><div class="dm-sub" data-k="rateSub">0 of 0 completed</div></div>
      </div>
      <form class="dm-add"><input maxlength="120" placeholder="Add an action item…" aria-label="New action item" required><button type="submit">+ Add</button></form>
      <div class="dm-date-nav"><button type="button" data-day-shift="-1" aria-label="Previous day">‹ Previous</button><div><div class="dm-selected-date" aria-live="polite"></div><button type="button" class="dm-today-btn" data-go-today hidden>Back to today</button></div><button type="button" data-day-shift="1" aria-label="Next day">Next ›</button></div>
      <div class="dm-toast" role="status" aria-live="polite"></div>
      <div class="dm-list"><div class="dm-empty">Loading action items…</div></div>
      <div class="dm-foot"><span>QuickTick · Made by <a class="dm-maker-link" href="https://www.linkedin.com/in/rohan-aditya-thirumala-6b8228264?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" rel="noopener noreferrer">Rohan Aditya</a></span><button type="button" class="dm-dashboard">Full dashboard ↗</button></div>
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
      Object.assign(shell.style, {left:x+'px', top:y+'px', right:'auto', bottom:'auto'});
    });
    head.addEventListener('pointerup', () => dragging = false);
    head.addEventListener('pointercancel', () => dragging = false);
    window.addEventListener('resize', clampShell);

    q('.dm-add').addEventListener('submit', async e => {
      e.preventDefault();
      const input = q('.dm-add input'), title = input.value.trim();
      if (!title) return;
      const items = await load(), d = selectedDate || today();
      items.push({id:newId(), title, plannedDate:d, deadline:d, priority:'Medium', notes:'', done:false, pending:false, movedTo:'', createdAt:new Date().toISOString(), completedAt:''});
      if (await save(items)) input.value = '';
    });
    q('.dm-date-nav').addEventListener('click', e => {
      if (e.target.closest('[data-go-today]')) { selectedDate = null; render(); return; }
      const btn = e.target.closest('[data-day-shift]');
      if (!btn) return;
      selectedDate = shiftDate(selectedDate || today(), Number(btn.dataset.dayShift));
      render();
    });
    q('.dm-list').addEventListener('change', async e => {
      if (!e.target.matches('[data-action="toggle"]')) return;
      const id = String(e.target.closest('[data-id]').dataset.id), checked = e.target.checked, items = await load();
      await save(items.map(t => String(t.id) === id ? {...t, done:checked, pending:false, movedTo:'', completedAt:checked ? new Date().toISOString() : ''} : t));
    });
    q('.dm-list').addEventListener('click', async e => {
      const b = e.target.closest('[data-action]'); if (!b || b.dataset.action === 'toggle') return;
      const id = String(b.closest('[data-id]').dataset.id), items = await load(), t = items.find(x => String(x.id) === id);
      if (!t) return;
      const act = b.dataset.action;
      if (act === 'pending') {
        if (t.done) return;
        await save(items.map(x => String(x.id) === id ? {...x, pending:true} : x));
      } else if (act === 'unpending') {
        await save(items.map(x => String(x.id) === id ? {...x, pending:false, movedTo:''} : x));
      } else if (act === 'nextday') {
        if (hasMovedCopy(t, items)) return;
        const d = shiftDate(t.plannedDate || selectedDate || today(), 1), copyId = newId();
        items.push({...t, id:copyId, plannedDate:d, deadline:t.deadline === t.plannedDate ? d : (t.deadline || d), done:false, pending:false, movedTo:'', createdAt:new Date().toISOString(), completedAt:''});
        const idx = items.findIndex(x => String(x.id) === id);
        if (idx >= 0) items[idx] = {...items[idx], pending:true, movedTo:copyId};
        if (await save(items)) { selectedDate = d; render(); showToast('Task copied to ' + headingDate(d) + '. Original marked pending.'); }
      } else if (act === 'delete') {
        if (!confirm('Delete this action item?')) return;
        await save(items.filter(x => String(x.id) !== id));
      }
    });
    q('.dm-dashboard').addEventListener('click', () => {
      try { chrome.runtime.sendMessage({type:'QuickTick_OPEN_DASHBOARD'}); } catch (_) { showToast('Reload this page to use QuickTick again.'); }
    });
    lastToday = today();
    dayTimer = setInterval(() => { if (today() !== lastToday) render(); }, 30000); // midnight rollover
    render();
  }

  async function render() {
    if (!shell || !shell.isConnected || !root) return;
    lastToday = today();
    const items = await load(), viewDate = selectedDate || today();
    if (!root) return;
    const dayItems = items.filter(t => t.plannedDate === viewDate);
    const done = dayItems.filter(t => t.done).length, open = dayItems.filter(t => !t.done).length;
    const put = (key, value) => { const el = q(`[data-k="${key}"]`); if (el) el.textContent = value; };
    put('open', open);
    put('overdue', dayItems.filter(t => state(t) === 'overdue').length);
    put('soon', dayItems.filter(t => state(t) === 'soon').length);
    put('rate', (dayItems.length ? Math.round(done / dayItems.length * 100) : 0) + '%');
    put('rateSub', `${done} of ${dayItems.length} completed`);
    dayItems.sort((a, b) => Number(a.done) - Number(b.done) || (a.deadline || '').localeCompare(b.deadline || '') || (a.title || '').localeCompare(b.title || ''));
    const dateEl = q('.dm-selected-date');
    if (dateEl) dateEl.textContent = headingDate(viewDate) + (viewDate === today() ? ' · Today' : '');
    const goToday = q('[data-go-today]'); if (goToday) goToday.hidden = viewDate === today();
    const list = q('.dm-list'); if (!list) return;
    list.innerHTML = dayItems.length ? dayItems.map(t => {
      const s = state(t);
      const prefix = s === 'done' ? 'Completed · ' : s === 'pending' ? 'Pending · ' : s === 'overdue' ? 'Overdue · ' : s === 'soon' ? 'Due soon · ' : '';
      const moved = hasMovedCopy(t, items);
      const target = moved ? items.find(x => String(x.id) === String(t.movedTo)) : null;
      return `<div class="dm-item ${s}" data-id="${esc(t.id)}"><input type="checkbox" data-action="toggle" ${t.done ? 'checked' : ''} aria-label="Complete ${esc(t.title)}"><div class="dm-body"><div class="dm-title">${esc(t.title)}</div><div class="dm-meta">${prefix}${dateLabel(t.deadline)}</div><div class="dm-item-actions">${!t.done ? (t.pending ? '<button class="dm-mini-action" data-action="unpending">Unmark pending</button>' : '<button class="dm-mini-action" data-action="pending">Mark pending</button>') : ''}${moved ? `<span class="dm-moved">Moved to ${esc(dateLabel(target.plannedDate))}</span>` : '<button class="dm-mini-action" data-action="nextday">Move to next day</button>'}</div></div><button class="dm-del" data-action="delete" title="Delete" aria-label="Delete ${esc(t.title)}">×</button></div>`;
    }).join('') : '<div class="dm-empty">No action items for this day.<br>Add one above to get started.</div>';
  }

  chrome.runtime.onMessage.addListener(msg => { if (msg?.type === 'QuickTick_TOGGLE_MACRO') create(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[KEY] || changes[LEGACY_KEY])) render();
  });
})();
