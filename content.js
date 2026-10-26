(() => {
  if (window.__daymarkMacroInjected) return;
  window.__daymarkMacroInjected = true;

  const KEY = 'daymark_action_items_v1';
  let shell = null, dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateLabel = s => {
    if (!s) return 'No deadline';
    const d = new Date(s + 'T12:00:00');
    return isNaN(d) ? 'No deadline' : d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
  };
  function load() {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([KEY], data => {
          if (chrome.runtime && chrome.runtime.lastError) { resolve([]); return; }
          const raw = data[KEY];
          if (Array.isArray(raw)) { resolve(raw); return; }
          if (raw && Array.isArray(raw.tasks)) { resolve(raw.tasks); return; }
          // Migrate existing tasks saved by the dashboard in extension-page localStorage.
          try {
            const old = JSON.parse(localStorage.getItem(KEY) || 'null');
            if (Array.isArray(old)) { resolve(old); return; }
            if (old && Array.isArray(old.tasks)) { resolve(old.tasks); return; }
          } catch (_) {}
          resolve([]);
        });
      } else {
        try {
          const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
          resolve(Array.isArray(raw) ? raw : (raw && Array.isArray(raw.tasks) ? raw.tasks : []));
        } catch (_) { resolve([]); }
      }
    });
  }
  function save(items) {
    return new Promise(resolve => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({[KEY]:items}, () => {
          if (chrome.runtime && chrome.runtime.lastError) { resolve(false); return; }
          render(); resolve(true);
        });
      } else {
        try { localStorage.setItem(KEY, JSON.stringify(items)); render(); resolve(true); }
        catch (_) { resolve(false); }
      }
    });
  }
  function state(t) {
    if (t.done) return 'done';
    if (!t.deadline) return 'open';
    const diff = Math.round((new Date(t.deadline+'T12:00:00') - new Date(today()+'T12:00:00')) / 86400000);
    return diff < 0 ? 'overdue' : diff <= 3 ? 'soon' : 'open';
  }
  function create() {
    if (shell) { shell.remove(); shell = null; return; }
    shell = document.createElement('section');
    shell.id = 'daymark-floating-shell';
    Object.assign(shell.style, {
      position:'fixed',right:'22px',bottom:'22px',width:'410px',height:'535px',
      maxWidth:'calc(100vw - 16px)',maxHeight:'calc(100vh - 16px)',zIndex:'2147483647',
      borderRadius:'14px',overflow:'hidden',boxShadow:'0 16px 48px rgba(15,23,42,.28)',
      border:'1px solid #dbe2ee',background:'#f5f7fb',display:'flex',flexDirection:'column',
      resize:'both',minWidth:'320px',minHeight:'350px',fontFamily:'Inter,system-ui,-apple-system,Segoe UI,sans-serif',
      color:'#172033',fontSize:'13px'
    });
    shell.innerHTML = `
      <style>
      #daymark-floating-shell *{box-sizing:border-box}
      #daymark-floating-shell button,#daymark-floating-shell input{font:inherit}
      #daymark-floating-shell button{cursor:pointer}
      #daymark-floating-shell .dm-head{height:38px;flex:0 0 38px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e3e8f0;cursor:move;user-select:none}
      #daymark-floating-shell .dm-brand{display:flex;align-items:center;gap:9px;font-weight:800;color:#172554;min-width:0} #daymark-floating-shell .dm-titlebrand{font-size:15px;letter-spacing:-.025em;color:#172554;font-weight:850;line-height:1} #daymark-floating-shell .dm-draghint{font-size:9px;letter-spacing:.08em;font-weight:750;color:#64748b;background:#eef2ff;border:1px solid #dbe4ff;border-radius:999px;padding:4px 7px;line-height:1}
      #daymark-floating-shell .dm-dot{width:15px;height:15px;flex:0 0 15px;border-radius:4px;background:#16a34a;box-shadow:0 0 0 3px #dcfce7;position:relative} #daymark-floating-shell .dm-dot:after{content:"✓";position:absolute;inset:0;color:#fff;font:900 11px/15px system-ui;text-align:center}
      #daymark-floating-shell .dm-close{border:0;background:transparent;color:#64748b;font-size:22px;line-height:1;padding:0 3px}
      #daymark-floating-shell .dm-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:10px 10px 8px}
      #daymark-floating-shell .dm-stat{background:#fff;border:1px solid #e3e8f0;border-radius:9px;padding:7px 8px;min-width:0}
      #daymark-floating-shell .dm-label{font-size:9px;text-transform:uppercase;font-weight:800;letter-spacing:.03em;color:#718096}
      #daymark-floating-shell .dm-num{font-size:20px;font-weight:750;line-height:1.25}
      #daymark-floating-shell .dm-sub{font-size:9px;color:#718096;line-height:1.25}
      #daymark-floating-shell .dm-open .dm-num{color:#2563eb} #daymark-floating-shell .dm-over .dm-num{color:#dc2626}
      #daymark-floating-shell .dm-soon .dm-num{color:#b45309} #daymark-floating-shell .dm-rate .dm-num{color:#15803d}
      #daymark-floating-shell .dm-add{display:flex;gap:6px;padding:0 10px 9px}
      #daymark-floating-shell .dm-add input{min-width:0;flex:1;border:1px solid #d7deea;background:#fff;border-radius:8px;padding:8px}
      #daymark-floating-shell .dm-add button{border:0;background:#4f46e5;color:#fff;font-weight:700;border-radius:8px;padding:0 12px}
      #daymark-floating-shell .dm-list{padding:0 10px 10px;display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;overflow:auto}
      #daymark-floating-shell .dm-item{display:flex;gap:8px;align-items:flex-start;background:#fff;border:1px solid #e3e8f0;border-left:3px solid #2563eb;border-radius:8px;padding:8px}
      #daymark-floating-shell .dm-item.overdue{border-left-color:#dc2626} #daymark-floating-shell .dm-item.soon{border-left-color:#f59e0b}
      #daymark-floating-shell .dm-item.done{border-left-color:#15803d;opacity:.72}
      #daymark-floating-shell .dm-item input[type=checkbox]{appearance:none!important;-webkit-appearance:none!important;display:inline-grid!important;place-content:center;width:17px;height:17px;min-width:17px;flex:0 0 17px;margin:1px 0 0;border:1.5px solid #94a3b8;border-radius:4px;background:#fff;opacity:1!important;visibility:visible!important;cursor:pointer}
      #daymark-floating-shell .dm-item input[type=checkbox]:checked{background:#16a34a;border-color:#16a34a}
      #daymark-floating-shell .dm-item input[type=checkbox]:checked:after{content:"✓";color:#fff;font:900 13px/1 system-ui}
      #daymark-floating-shell .dm-item input[type=checkbox]:focus-visible{outline:2px solid #86efac;outline-offset:2px}
      #daymark-floating-shell .dm-item input[type=checkbox]:checked{background:#16a34a;border-color:#16a34a}
      #daymark-floating-shell .dm-item input[type=checkbox]:checked:after{content:"✓";color:#fff;font:900 13px/1 system-ui}
      #daymark-floating-shell .dm-item input[type=checkbox]:focus-visible{outline:2px solid #86efac;outline-offset:2px}
      #daymark-floating-shell .dm-body{min-width:0;flex:1} #daymark-floating-shell .dm-title{font-weight:650;overflow-wrap:anywhere}
      #daymark-floating-shell .dm-item.done .dm-title{text-decoration:line-through;color:#718096}
      #daymark-floating-shell .dm-meta{color:#718096;font-size:10px;margin-top:3px}
      #daymark-floating-shell .dm-del{border:0;background:transparent;color:#94a3b8;font-size:17px;line-height:1;padding:0 2px}
      #daymark-floating-shell .dm-empty{padding:20px 12px;text-align:center;color:#718096}
      #daymark-floating-shell .dm-foot{display:flex;justify-content:space-between;align-items:center;padding:0 10px 10px;color:#718096;font-size:10px}
      #daymark-floating-shell .dm-maker-link{color:inherit;text-decoration:none} #daymark-floating-shell .dm-maker-link:hover{text-decoration:underline;color:#166534}
      
      #daymark-floating-shell .dm-foot button{border:0;background:none;color:#4f46e5;font-weight:700;padding:0}
      </style>
      <div class="dm-head"><span class="dm-brand"><span class="dm-dot"></span><span class="dm-titlebrand">QuickTick</span></span><button class="dm-close" type="button" aria-label="Close">×</button></div>
      <div class="dm-stats">
        <div class="dm-stat dm-open"><div class="dm-label">Open Action Items</div><div class="dm-num" data-k="open">0</div><div class="dm-sub">Unfinished, all dates</div></div>
        <div class="dm-stat dm-over"><div class="dm-label">Overdue</div><div class="dm-num" data-k="overdue">0</div><div class="dm-sub">Deadline passed</div></div>
        <div class="dm-stat dm-soon"><div class="dm-label">Due Soon</div><div class="dm-num" data-k="soon">0</div><div class="dm-sub">Today + 3 days</div></div>
        <div class="dm-stat dm-rate"><div class="dm-label">Completion Rate</div><div class="dm-num" data-k="rate">0%</div><div class="dm-sub" data-k="rateSub">0 of 0 completed</div></div>
      </div>
      <form class="dm-add"><input maxlength="120" placeholder="Add an action item…" required><button type="submit">+ Add</button></form>
      <div class="dm-list"><div class="dm-empty">Loading action items…</div></div>
      <div class="dm-foot"><span>QuickTick · Made by <a class="dm-maker-link" href="https://www.linkedin.com/in/rohan-aditya-thirumala-6b8228264?utm_source=share_via&utm_content=profile&utm_medium=member_android" target="_blank" rel="noopener noreferrer">Rohan Aditya</a></span><button type="button" class="dm-dashboard">Full dashboard ↗</button></div>`;
    document.documentElement.appendChild(shell);

    const head = shell.querySelector('.dm-head');
    shell.querySelector('.dm-close').addEventListener('click', () => { shell.remove(); shell = null; });
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      dragging = true; startX=e.clientX; startY=e.clientY;
      const r=shell.getBoundingClientRect(); originX=r.left; originY=r.top;
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!dragging || !shell) return;
      const x=Math.max(0,Math.min(innerWidth-shell.offsetWidth,originX+e.clientX-startX));
      const y=Math.max(0,Math.min(innerHeight-shell.offsetHeight,originY+e.clientY-startY));
      Object.assign(shell.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'});
    });
    head.addEventListener('pointerup',()=>dragging=false);
    head.addEventListener('pointercancel',()=>dragging=false);
    shell.querySelector('.dm-add').addEventListener('submit', async e => {
      e.preventDefault(); const input=shell.querySelector('.dm-add input'); const title=input.value.trim(); if(!title)return;
      const items=await load(); const d=today();
      items.push({id:'t_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),title,plannedDate:d,deadline:d,priority:'Medium',notes:'',done:false,createdAt:new Date().toISOString(),completedAt:''});
      await save(items); input.value='';
    });
    shell.querySelector('.dm-list').addEventListener('change', async e => {
      if(!e.target.matches('[data-action="toggle"]'))return;
      const id=String(e.target.closest('[data-id]').dataset.id), checked=e.target.checked, items=await load();
      await save(items.map(t=>String(t.id)===id?{...t,done:checked,completedAt:checked?new Date().toISOString():''}:t));
    });
    shell.querySelector('.dm-list').addEventListener('click', async e => {
      const b=e.target.closest('[data-action="delete"]');if(!b)return;
      const id=b.closest('[data-id]').dataset.id;if(!confirm('Delete this action item?'))return;
      await save((await load()).filter(t=>String(t.id)!==id));
    });
    shell.querySelector('.dm-dashboard').addEventListener('click',()=>chrome.runtime.sendMessage({type:'QuickTick_OPEN_DASHBOARD'}));
    render();
  }
  async function render() {
    if(!shell || !shell.isConnected)return;
    const items=await load(), done=items.filter(t=>t.done).length, open=items.length-done;
    const put=(key,value)=>{const el=shell?.querySelector(`[data-k="${key}"]`);if(el)el.textContent=value};
    put('open',open);put('overdue',items.filter(t=>state(t)==='overdue').length);put('soon',items.filter(t=>state(t)==='soon').length);
    put('rate',(items.length?Math.round(done/items.length*100):0)+'%');put('rateSub',`${done} of ${items.length} completed`);
    items.sort((a,b)=>Number(a.done)-Number(b.done)||(a.deadline||'').localeCompare(b.deadline||'')||(a.title||'').localeCompare(b.title||''));
    const list=shell?.querySelector('.dm-list');if(!list)return;
    list.innerHTML=items.length?items.map(t=>{const s=state(t);return `<div class="dm-item ${s}" data-id="${esc(t.id)}"><input type="checkbox" data-action="toggle" ${t.done?'checked':''} aria-label="Complete action"><div class="dm-body"><div class="dm-title">${esc(t.title)}</div><div class="dm-meta">${s==='done'?'Completed':s==='overdue'?'Overdue · ':s==='soon'?'Due soon · ':''}${dateLabel(t.deadline)}</div></div><button class="dm-del" data-action="delete" title="Delete" aria-label="Delete action">×</button></div>`}).join(''):'<div class="dm-empty">No action items yet.<br>Add one above to get started.</div>';
  }
  function state(t) {
    if(t.done)return 'done'; if(!t.deadline)return 'open';
    const diff=Math.round((new Date(t.deadline+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000);
    return diff<0?'overdue':diff<=3?'soon':'open';
  }
  chrome.runtime.onMessage.addListener(msg=>{if(msg?.type==='QuickTick_TOGGLE_MACRO')create();});
  chrome.storage.onChanged.addListener((changes, area)=>{if(area==='local'&&changes[KEY])render();});
})();