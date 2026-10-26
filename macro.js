(() => {
'use strict';
const KEY='daymark_action_items_v1';
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateLabel=s=>{if(!s)return 'No deadline';const d=new Date(s+'T12:00:00');return isNaN(d)?'No deadline':d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){return new Promise(resolve=>{try{chrome.storage.local.get([KEY],data=>{if(chrome.runtime.lastError){resolve([]);return;}const raw=data[KEY];resolve(Array.isArray(raw)?raw:(raw&&Array.isArray(raw.tasks)?raw.tasks:[]));});}catch(e){resolve([])}})}
function save(items){return new Promise(resolve=>{try{chrome.storage.local.set({[KEY]:items},()=>{render();resolve(!chrome.runtime.lastError)});}catch(e){resolve(false)}})}
function status(t){if(t.done)return 'done';if(!t.deadline)return 'open';const diff=Math.round((new Date(t.deadline+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000);return diff<0?'overdue':diff<=3?'soon':'open'}
async function render(){const items=await load(),done=items.filter(t=>t.done).length,open=items.length-done;
 $('open').textContent=open;$('overdue').textContent=items.filter(t=>status(t)==='overdue').length;$('soon').textContent=items.filter(t=>status(t)==='soon').length;
 $('rate').textContent=(items.length?Math.round(done/items.length*100):0)+'%';$('rateSub').textContent=`${done} of ${items.length} completed`;
 items.sort((a,b)=>Number(a.done)-Number(b.done)||(a.deadline||'').localeCompare(b.deadline||'')||(a.title||'').localeCompare(b.title||''));
 $('list').innerHTML=items.length?items.map(t=>{const s=status(t);return `<div class="item ${s}" data-id="${esc(t.id)}"><input type="checkbox" data-action="toggle" ${t.done?'checked':''} aria-label="Complete action"><div class="body"><div class="title">${esc(t.title)}</div><div class="meta">${s==='done'?'Completed':s==='overdue'?'Overdue · ':s==='soon'?'Due soon · ':''}${dateLabel(t.deadline)}${t.priority?' · '+esc(t.priority):''}</div></div><button class="del" data-action="delete" title="Delete" aria-label="Delete action">×</button></div>`}).join(''):'<div class="empty">No action items yet.<br>Add one above to get started.</div>';
}
$('addForm').addEventListener('submit',async e=>{e.preventDefault();const title=$('newTitle').value.trim();if(!title)return;const d=today(),items=await load();items.push({id:'t_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),title,plannedDate:d,deadline:d,priority:'Medium',notes:'',done:false,createdAt:new Date().toISOString(),completedAt:''});await save(items);$('newTitle').value='';});
$('list').addEventListener('change',async e=>{if(!e.target.matches('[data-action="toggle"]'))return;const id=e.target.closest('[data-id]').dataset.id;await save((await load()).map(t=>t.id===id?{...t,done:e.target.checked,completedAt:e.target.checked?new Date().toISOString():''}:t));});
$('list').addEventListener('click',async e=>{const b=e.target.closest('[data-action="delete"]');if(!b)return;const id=b.closest('[data-id]').dataset.id;if(confirm('Delete this action item?'))await save((await load()).filter(t=>t.id!==id));});
$('openDashboard').addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
if(chrome.storage&&chrome.storage.onChanged)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY])render()});
render();
})();