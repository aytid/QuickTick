(() => {
 const KEY='daymark_action_items_v1';
 const $=id=>document.getElementById(id);
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=s=>{if(!s)return 'No deadline';const d=new Date(s+'T12:00:00');return isNaN(d)?'No deadline':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})};
 let tasks=[];
 async function load(){const d=await chrome.storage.local.get(KEY);const x=d[KEY];tasks=Array.isArray(x)?x:(x&&Array.isArray(x.tasks)?x.tasks:[]);render()}
 async function save(){await chrome.storage.local.set({[KEY]:tasks});render()}
 function render(){const list=$('list');list.innerHTML='';if(!tasks.length){list.innerHTML='<div class="empty">No action items yet. Add one above.</div>'}
 tasks.forEach(t=>{const el=document.createElement('div');el.className='item'+(t.done?' done':'');el.innerHTML=`<input type="checkbox" aria-label="Complete task" ${t.done?'checked':''}><div class="body"><div class="title">${esc(t.title)}</div><div class="meta">${t.deadline?'Due '+label(t.deadline)+' · ':''}${esc(t.priority||'Medium')}</div></div><button class="del" title="Delete task">×</button>`;el.querySelector('input').addEventListener('change',e=>{t.done=e.target.checked;t.completedAt=t.done?new Date().toISOString():'';save()});el.querySelector('.del').addEventListener('click',()=>{tasks=tasks.filter(x=>x.id!==t.id);save()});list.appendChild(el)});
 $('count').textContent=`${tasks.filter(t=>!t.done).length} open · synced with your dashboard`}
 $('add').addEventListener('submit',e=>{e.preventDefault();const title=$('title').value.trim();if(!title)return;tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title,plannedDate:today(),deadline:today(),priority:'Medium',notes:'',done:false,createdAt:new Date().toISOString(),completedAt:''});$('title').value='';save()});
 $('close').addEventListener('click',()=>window.close());
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY]){const x=changes[KEY].newValue;tasks=Array.isArray(x)?x:(x&&Array.isArray(x.tasks)?x.tasks:[]);render()}});
 load();
})();