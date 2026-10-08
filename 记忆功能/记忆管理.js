const PORTABLE_STORAGE = 'siyu-share-v1';
let portableDB = {version:1, conversations:[]};
let portableStorageError = '';
try {
  const saved = localStorage.getItem(PORTABLE_STORAGE);
  if (saved) portableDB = validatePortable(JSON.parse(saved));
} catch { portableStorageError = '浏览器中的聊天数据无法读取。请先导出备份，或换一个允许本地存储的浏览器打开。'; }

function validatePortable(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.conversations) || value.conversations.length > 1000) throw new Error('不是有效的私语备份');
  const ids = new Set();
  const conversations = value.conversations.map(c => {
    if (!c || typeof c.id !== 'string' || !/^[\w-]{1,80}$/.test(c.id) || ids.has(c.id) || !['group','girlfriend'].includes(c.audience) || !['normal','special'].includes(c.mode) || !['setup','chat'].includes(c.phase)) throw new Error('备份中的对话格式无效');
    ids.add(c.id);
    const text = (field, limit) => { if(typeof c[field] !== 'string' || c[field].length > limit) throw new Error('备份中的文字格式无效'); return c[field]; };
    const messages = field => {
      if(!Array.isArray(c[field]) || c[field].length > 100000) throw new Error('备份中的消息格式无效');
      return c[field].map(m => {
        if(!m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 10000) throw new Error('备份中的消息内容无效');
        return {role:m.role,content:m.content};
      });
    };
    if(!Array.isArray(c.questions) || c.questions.length > 2 || c.questions.some(q => typeof q !== 'string' || q.length > 500)) throw new Error('备份中的背景问题无效');
    if(!Number.isInteger(c.summary_cursor) || c.summary_cursor < 0 || c.summary_cursor > c.messages.length || c.summary_cursor % 2) throw new Error('备份中的记忆位置无效');
    return {id:c.id,title:c.audience==='group' && c.title==='群友 · 新对话'?'女生 · 新对话':text('title',80),audience:c.audience,mode:c.mode,phase:c.phase,
      background:text('background',4000),draft:text('draft',4000),questions:[...c.questions],
      summary:text('summary',2500),summary_cursor:c.summary_cursor,
      messages:messages('messages'),setup_messages:messages('setup_messages'),
      updated_at:typeof c.updated_at==='string'?c.updated_at:new Date().toISOString(),requests:{}};
  });
  return {version:1,conversations};
}
function portableCommit(change) {
  const next = structuredClone(portableDB);
  change(next);
  try {localStorage.setItem(PORTABLE_STORAGE, JSON.stringify(next));}
  catch {throw new Error('浏览器未能保存聊天，可能是存储空间不足或禁用了本地存储。请先导出备份。');}
  portableDB = next;
}
function portableConversation(id) {
  const c = portableDB.conversations.find(c => c.id === id);
  if(!c)throw new Error('对话不存在');
  return c;
}
function portableStamp(c) {c.updated_at = new Date().toISOString();}
function portableText(text, name, max=4000) {
  if(typeof text !== 'string' || !text.trim() || text.length>max)throw new Error(`${name}需为1至${max}字`);
  return text.trim();
}
function portableBackup(ids) {
  const selectedIds=new Set(ids);
  const conversations=portableDB.conversations.filter(c=>selectedIds.has(c.id));
  if(!conversations.length)throw new Error('请至少选择一段聊天');
  return validatePortable({version:1,conversations});
}
function portableExport(ids) {
  const safe=portableBackup(ids), blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='私语备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function portableExportChoices() {return [...$('export-list').querySelectorAll('input[type=checkbox]')];}
function portableExportState() {
  const choices=portableExportChoices(), count=choices.filter(c=>c.checked).length;
  $('export-count').textContent=`已选择 ${count} / ${choices.length} 段聊天`;
  $('export-submit').disabled=count===0;
  $('export-all').disabled=!choices.length;
  $('export-all').checked=choices.length>0&&count===choices.length;
  $('export-all').indeterminate=count>0&&count<choices.length;
}
function portableOpenExport() {
  $('export-list').replaceChildren();$('export-error').textContent='';
  const conversations=[...portableDB.conversations].sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  for(const c of conversations){
    const row=document.createElement('label');row.className='export-option';
    const input=document.createElement('input');input.type='checkbox';input.value=c.id;input.checked=c.id===selected;input.onchange=portableExportState;
    const body=document.createElement('span'),title=document.createElement('strong'),info=document.createElement('small');
    title.textContent=c.title;info.textContent=`${c.audience==='group'?'女生':'女朋友'} · ${c.mode==='normal'?'正常':'特殊'} · ${c.messages.length} 条消息${c.phase==='setup'?' · 背景待确认':''}`;
    body.append(title,info);row.append(input,body);$('export-list').append(row);
  }
  $('export-empty').hidden=conversations.length>0;
  portableExportState();$('export-dialog').showModal();
}
function portableBindExport() {
  $('export-chats').onclick=portableOpenExport;
  $('close-export').onclick=()=>$('export-dialog').close();
  $('export-all').onchange=event=>{for(const choice of portableExportChoices())choice.checked=event.target.checked;portableExportState();};
  $('export-form').onsubmit=event=>{
    event.preventDefault();
    try{portableExport(portableExportChoices().filter(c=>c.checked).map(c=>c.value));$('export-dialog').close();}
    catch(e){$('export-error').textContent=e.message;}
  };
}
async function portableImport(file) {
  if(!file)return;
  if(file.size>20*1024*1024)throw new Error('备份文件不能超过20MB');
  const imported=validatePortable(JSON.parse(await file.text()));
  portableCommit(db=>{for(const c of imported.conversations){if(db.conversations.some(old=>old.id===c.id))c.id=crypto.randomUUID();db.conversations.push(c);}});
}

