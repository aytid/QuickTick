(() => {
 const KEY='QuickTick_action_items_v1', LEGACY_KEY='daymark_action_items_v1';
 const $=id=>document.getElementById(id);
 const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const today=()=>fmt(new Date());
 const shift=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return fmt(d)};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=s=>{if(!s)return 'No deadline';const d=new Date(s+'T12:00:00');return isNaN(d)?'No deadline':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
 const longDate=s=>new Date(s+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const newId=()=>crypto.randomUUID?crypto.randomUUID():'t_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
 const asList=x=>Array.isArray(x)?x:(x&&Array.isArray(x.tasks)?x.tasks:null);
 const status=t=>{if(t.done)return 'done';if(t.pending)return 'pending';if(!t.deadline)return 'open';const diff=Math.round((new Date(t.deadline+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000);return diff<0?'overdue':diff<=3?'soon':'open'};
 let tasks=[], selected=today(), lastToday=today();
 const moved=t=>t.movedTo&&tasks.find(x=>x.id===t.movedTo);
 async function load(){const d=await chrome.storage.local.get([KEY,LEGACY_KEY]);tasks=asList(d[KEY])||asList(d[LEGACY_KEY])||[];render()}
 async function save(){await chrome.storage.local.set({[KEY]:tasks});render()}
 function render(){
  lastToday=today();
  $('date').textContent=longDate(selected)+(selected===today()?' · Today':'');
  $('goToday').hidden=selected===today();
  const list=$('list');list.innerHTML='';
  const day=tasks.filter(t=>t.plannedDate===selected).sort((a,b)=>Number(a.done)-Number(b.done)||(a.deadline||'').localeCompare(b.deadline||'')||(a.title||'').localeCompare(b.title||''));
  if(!day.length)list.innerHTML='<div class="empty">No action items for this day. Add one above.</div>';
  day.forEach(t=>{
   const s=status(t),m=moved(t),el=document.createElement('div');el.className='item '+s;
   const prefix=s==='pending'?'Pending · ':s==='overdue'?'Overdue · ':s==='soon'?'Due soon · ':'';
   el.innerHTML=`<input type="checkbox" aria-label="Complete task" ${t.done?'checked':''}><div class="body"><div class="title">${esc(t.title)}</div><div class="meta">${prefix}${t.deadline?'Due '+label(t.deadline):'No deadline'} · ${esc(t.priority||'Medium')}</div><div class="actions">${t.done?'':(t.pending?'<button class="mini" data-a="unpend">Unmark pending</button>':'<button class="mini" data-a="pend">Mark pending</button>')}${m?`<span class="moved">Moved to ${esc(label(m.plannedDate))}</span>`:'<button class="mini" data-a="next">Move to next day</button>'}</div></div><button class="del" title="Delete task" aria-label="Delete task">×</button>`;
   el.querySelector('input').addEventListener('change',e=>{t.done=e.target.checked;t.pending=false;t.movedTo='';t.completedAt=t.done?new Date().toISOString():'';save()});
   el.querySelector('.del').addEventListener('click',()=>{if(!confirm('Delete this action item?'))return;tasks=tasks.filter(x=>x.id!==t.id);save()});
   el.querySelectorAll('[data-a]').forEach(b=>b.addEventListener('click',()=>{
    const a=b.dataset.a;
    if(a==='pend')t.pending=true;
    else if(a==='unpend'){t.pending=false;t.movedTo=''}
    else if(a==='next'){if(moved(t))return;const d=shift(t.plannedDate||selected,1),id=newId();tasks.push({...t,id,plannedDate:d,deadline:t.deadline===t.plannedDate?d:(t.deadline||d),done:false,pending:false,movedTo:'',createdAt:new Date().toISOString(),completedAt:''});t.pending=true;t.movedTo=id;selected=d}
    save();
   }));
   list.appendChild(el);
  });
  $('count').textContent=`${tasks.filter(t=>!t.done).length} open (all dates) · synced with your dashboard`;
 }
 $('add').addEventListener('submit',e=>{e.preventDefault();const title=$('title').value.trim();if(!title)return;tasks.push({id:newId(),title,plannedDate:selected,deadline:selected,priority:'Medium',notes:'',done:false,pending:false,movedTo:'',createdAt:new Date().toISOString(),completedAt:''});$('title').value='';save()});
 $('prev').addEventListener('click',()=>{selected=shift(selected,-1);render()});
 $('next').addEventListener('click',()=>{selected=shift(selected,1);render()});
 $('goToday').addEventListener('click',()=>{selected=today();render()});
 $('close').addEventListener('click',()=>window.close());
 setInterval(()=>{if(today()!==lastToday)render()},30000);
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes[KEY]||changes[LEGACY_KEY])){const x=changes[KEY]?changes[KEY].newValue:changes[LEGACY_KEY].newValue;tasks=asList(x)||[];render()}});
 load();
})();
