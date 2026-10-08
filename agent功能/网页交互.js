const $ = id => document.getElementById(id);
let current = null, selected = localStorage.getItem('siyu-share-selected'), editAction = 'rename', editTarget = null, keyConfigured = false;
const pending = new Map(), busy = new Set();
const SETUP_GREETING = '现在是什么情况？\n简单说说发生了什么、你们现在是什么关系，以及你准备和他聊什么。不想指定的部分也可以略过。';

function showError(message, retry=false) { $('error').hidden=false; $('error-text').textContent=message; $('retry').hidden=!retry; }
function clearError() { $('error').hidden=true; }
function label(c) { return `${c.audience === 'group' ? '女生' : '女朋友'} · ${c.mode === 'normal' ? '正常模式' : '特殊模式'}`; }
async function refreshList() {
  const result = await api('/conversations');
  $('conversation-count').textContent=result.conversations.length;
  $('conversation-list').replaceChildren();
  for (const c of result.conversations) {
    const row=document.createElement('div'); row.className='conversation-row'+(c.id===selected?' active':'');
    const button=document.createElement('button'), title=document.createElement('strong'), small=document.createElement('small');
    title.textContent=c.title; small.textContent=label(c)+(c.phase==='setup'?' · 待确认':'');
    button.className='conversation-open';button.append(title,small); button.onclick=()=>openConversation(c.id).catch(e=>showError(e.message));
    const actions=document.createElement('details');actions.className='conversation-actions';
    const toggle=document.createElement('summary');toggle.textContent='⋯';toggle.setAttribute('aria-label','管理对话：'+c.title);toggle.title='管理对话';
    const menu=document.createElement('div');menu.className='conversation-menu';
    for(const [action,text] of [['rename','重命名'],['delete','删除']]){
      const item=document.createElement('button');item.type='button';item.textContent=text;item.className=action==='delete'?'danger':'';item.setAttribute('aria-label',text+'：'+c.title);
      item.onclick=()=>{actions.open=false;editDialog(action,c);};menu.append(item);
    }
    actions.ontoggle=()=>{if(actions.open)for(const other of $('conversation-list').querySelectorAll('details'))if(other!==actions)other.open=false;};
    actions.append(toggle,menu);row.append(button,actions);$('conversation-list').append(row);
  }
}
function bubbleMessage(role, content, isPending=false, setup=false) {
  const row=document.createElement('div'); row.className='message '+role+(isPending?' pending':'');
  const avatar=document.createElement('div'); avatar.className='avatar'; avatar.textContent=role==='user'?'你':setup?'设':'回';
  const body=document.createElement('div'); body.className='message-body';
  const name=document.createElement('div'); name.className='message-label'; name.textContent=role==='user'?'你':setup?'背景设置助手':'风格模拟'; body.append(name);
  const parts=role==='assistant'&&!setup?content.split('\n').filter(t=>t.trim()):[content];
  for (const part of parts) {const bubble=document.createElement('div'); bubble.className='bubble'; bubble.textContent=part; body.append(bubble);}
  row.append(avatar,body); return row;
}
function controls() {
  const active=Boolean(current), working=active&&busy.has(current.id);
  const setup=active&&current.phase==='setup';
  $('composer').hidden=setup; $('composer-note').hidden=setup;
  $('message').disabled=!active||setup||working; $('send').disabled=!active||setup||working;
  $('setup-input').disabled=!setup||working; $('setup-send').disabled=!setup||working;
  $('confirm-background').disabled=working||(active&&pending.has(current.id))||!$('background-text').value.trim();
  $('message').placeholder=!active?'先新建一段对话…':current.phase==='setup'?'简单说说现在的情况，也可以说“不指定”…':'发一句话，接着聊…';
  $('composer-note').textContent=active&&current.phase==='setup'?'背景确认后才开始人物聊天 · 可以修改摘要或略过未指定项':'Enter 发送 · Shift + Enter 换行 · 每个对话独立记忆';
}
function render() {
  const setup=Boolean(current)&&current.phase==='setup';
  $('welcome').hidden=Boolean(current); $('conversation').hidden=!current||setup; $('setup-page').hidden=!setup;
  $('chat-title').textContent=setup?'准备聊天背景':current?.title||'你想以什么身份与他聊天？';
  $('chat-subtitle').textContent=current?label(current)+(current.phase==='setup'?' · 设置背景':' · 独立会话记忆'):'选择你的身份，开始一段对话';
  $('messages').replaceChildren(); $('setup-messages').replaceChildren(); clearError();
  if (!current) {controls(); return;}
  $('setup-identity').textContent=label(current)+' · 背景确认后进入正式聊天';
  $('background-pill').hidden=setup||!current.background;
  $('background-pill').textContent='开场背景 · '+current.background;
  $('setup-notes').hidden=setup||!current.setup_messages.length;
  $('setup-history').replaceChildren(...current.setup_messages.map(m=>bubbleMessage(m.role,m.content,false,true)));
  const target=setup?$('setup-messages'):$('messages');
  const messages=setup?current.setup_messages:current.messages;
  if(setup)target.append(bubbleMessage('assistant',SETUP_GREETING,false,true));
  if (!messages.length) {
    const empty=document.createElement('p'); empty.className='fine-print';
    empty.textContent=setup?'回答下面的问题，背景助手会帮你整理开场。':'从你想说的第一句话开始。'; target.append(empty);
  }
  for (const m of messages) target.append(bubbleMessage(m.role,m.content,false,setup));
  const p=pending.get(current.id);
  if (p) {
    target.append(bubbleMessage('user',p.message,true,setup));
    if (busy.has(current.id)) {const typing=bubbleMessage('assistant','•••',false,setup); typing.classList.add('typing'); target.append(typing);}
    else if(p.error) showError(p.error,true);
  }
  $('background-card').hidden=!setup||!current.draft;
  $('background-text').value=current.draft||'';
  $('setup-questions').textContent=(current.questions||[]).join('\n');
  controls(); $('scroll-area').scrollTop=$('scroll-area').scrollHeight;
}
async function openConversation(id) {
  selected=id; localStorage.setItem('siyu-share-selected',id);
  const data=await api('/conversations/'+id);
  if(selected!==id)return;
  current=data; $('message').value=''; $('setup-input').value=''; render(); await refreshList(); document.body.classList.remove('sidebar-open');
}
async function reloadSelected(id) { const data=await api('/conversations/'+id); if(selected===id){current=data;render();} await refreshList(); }
function newDialog(audience='group') {
  $('new-form').elements.audience.value=audience; $('new-form').elements.mode.value='normal'; $('new-dialog').showModal();
}
$('new-chat').onclick=()=>newDialog(); $('quick-group').onclick=()=>newDialog('group'); $('quick-girlfriend').onclick=()=>newDialog('girlfriend'); $('close-new').onclick=()=>$('new-dialog').close();
$('new-form').onsubmit=async event=>{
  event.preventDefault(); $('create').disabled=true;
  try { const f=event.currentTarget.elements,c=await api('/conversations','POST',{audience:f.audience.value,mode:f.mode.value}); $('new-dialog').close(); await openConversation(c.id); $(c.phase==='setup'?'setup-input':'message').focus(); }
  catch(e){$('new-dialog').close();showError(e.message);} finally{$('create').disabled=false;}
};
async function sendPending(id) {
  const p=pending.get(id); if(!p||busy.has(id))return;
  busy.add(id); p.error=null; if(current?.id===id)render();
  try {
    if(p.setup) await api(`/conversations/${id}/setup`,'POST',{message:p.message,request_id:p.requestId});
    else await api('/chat','POST',{session_id:id,message:p.message,request_id:p.requestId});
    pending.delete(id); await reloadSelected(id);
  } catch(e) {p.error=e.message;}
  finally {busy.delete(id); if(current?.id===id){render();if(pending.get(id)?.error)showError(pending.get(id).error,true);}}
}
function submitMessage(inputId,setup){
  if(!current||busy.has(current.id)||(current.phase==='setup')!==setup)return;
  const input=$(inputId),message=input.value.trim(); if(!message)return;
  if(pending.has(current.id)){showError('请先重试上一条消息，或切换对话。',true);return;}
  pending.set(current.id,{message,requestId:crypto.randomUUID(),setup}); input.value=''; input.style.height='auto'; sendPending(current.id);
}
$('composer').onsubmit=event=>{event.preventDefault();submitMessage('message',false);};
$('setup-composer').onsubmit=event=>{event.preventDefault();submitMessage('setup-input',true);};
$('retry').onclick=()=>current&&sendPending(current.id);
$('message').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('composer').requestSubmit();}};
$('setup-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('setup-composer').requestSubmit();}};
$('message').oninput=()=>{$('message').style.height='auto';$('message').style.height=Math.min($('message').scrollHeight,150)+'px';};
$('background-text').oninput=controls;
$('confirm-background').onclick=async()=>{
  if(!current||busy.has(current.id)||pending.has(current.id))return;
  const id=current.id,background=$('background-text').value.trim(); if(!background)return;
  busy.add(id); controls();
  try {await api(`/conversations/${id}/confirm`,'POST',{confirmed:true,background});await reloadSelected(id);if(current?.id===id)$('message').focus();}
  catch(e){showError(e.message);}finally{busy.delete(id);controls();}
};
async function config() {const c=await api('/config');keyConfigured=Boolean(c.configured);$('config-banner').hidden=c.configured;$('model-name').textContent=c.model;$('model-base').textContent=c.base_url;}
function settings() {$('api-key').value='';$('settings-status').textContent=keyConfigured?'已填写':'未填写';$('api-key').placeholder=keyConfigured?'输入另外的 API 密钥以替换当前密钥':'粘贴你的 DeepSeek 密钥';$('save-key').textContent=keyConfigured?'更换密钥':'保存设置';$('settings-dialog').showModal();}
$('settings').onclick=settings;$('configure').onclick=settings;$('close-settings').onclick=()=>$('settings-dialog').close();
$('settings-form').onsubmit=async event=>{
  event.preventDefault();$('save-key').disabled=true;
  try {const result=await api('/config','POST',{api_key:$('api-key').value.trim()});$('api-key').value='';await config();if(result.environment_override){$('settings-status').textContent='已保存；当前环境变量中的密钥优先生效。';}else $('settings-dialog').close();}
  catch(e){$('settings-status').textContent=e.message;}finally{$('save-key').disabled=false;}
};
function editDialog(action,target) {if(!target||busy.has(target.id))return;editAction=action;editTarget={id:target.id,title:target.title};$('edit-title').textContent=action==='rename'?'重命名对话':'删除「'+target.title+'」？';$('edit-name').hidden=action==='delete';$('edit-name').required=action==='rename';$('edit-name').value=target.title;$('delete-description').hidden=action!=='delete';$('edit-submit').textContent=action==='rename'?'保存':'删除对话';$('edit-dialog').showModal();}
$('close-edit').onclick=()=>$('edit-dialog').close();
$('edit-form').onsubmit=async event=>{
  event.preventDefault();if(!editTarget||busy.has(editTarget.id))return;const id=editTarget.id,action=editAction;$('edit-submit').disabled=true;
  try {if(action==='rename')await api('/conversations/'+id,'PATCH',{title:$('edit-name').value});else{await api('/conversations/'+id,'DELETE',{});pending.delete(id);if(selected===id){selected=null;current=null;localStorage.removeItem('siyu-share-selected');render();}}$('edit-dialog').close();if(action==='rename')await reloadSelected(id);else await refreshList();}
  catch(e){$('edit-dialog').close();showError(e.message);}finally{$('edit-submit').disabled=false;}
};
$('menu').onclick=()=>document.body.classList.toggle('sidebar-open');
$('open-guide').onclick=()=>$('guide-dialog').showModal();
$('close-guide').onclick=()=>$('guide-dialog').close();
$('guide-done').onclick=()=>$('guide-dialog').close();
async function start() {
  try {await config();await refreshList();if(selected){try{await openConversation(selected);}catch{selected=null;current=null;localStorage.removeItem('siyu-share-selected');}}render();}
  catch(e){showError('无法打开聊天：'+e.message);}
}
portableBindExport();
$('import-chats').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{
  try{await portableImport(event.target.files[0]);await refreshList();}
  catch(e){showError('导入失败：'+e.message);}finally{event.target.value='';}
};
start().then(()=>{if(!portableKey&&!portableStorageError)settings();});
