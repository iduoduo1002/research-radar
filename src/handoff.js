'use strict';
const {Modal}=require('obsidian');
const {paperIdentity}=require('./core');
const {digest,pathInVault}=require('./config');
const {DEFAULT_INTENT,normalizeHandoff,fillTemplate}=require('./handoff-prompt');
function buildPrompt(entries,intent,settings={}){
 const h=normalizeHandoff(settings.handoff),papers=entries.map(entry=>{
  const item=entry.item||entry,p=paperIdentity(item),abstract=String(item.abstract||'');
  return {...p,...(entry.taskNote?{taskNote:pathInVault(entry.taskNote)}:{}),topic:String(entry.topic||''),journal:String(entry.journal||item.journal||''),abstractLabel:String(item.abstractLabel||'来源摘要'),abstract:abstract.slice(0,12000),abstractTruncated:abstract.length>12000};
 });
 if(!papers.length)throw Error('请先选择论文。');
 return fillTemplate(h.promptTemplate,{papers:JSON.stringify(papers,null,2),count:papers.length,intent:intent?.trim()||h.defaultIntent||DEFAULT_INTENT,context:h.projectContext.trim()||'沿用当前Agent对话中已明确的研究背景；未提供时只做通用评估，不猜测我的项目。',inbox:pathInVault(settings.inboxFolder||'Research Radar/Inbox')});
}
function taskText(entry,intent,settings){return buildPrompt([entry],intent,settings);}
async function ensureFolder(adapter,folder){let p='';for(const part of pathInVault(folder).split('/')){p=p?`${p}/${part}`:part;if(!await adapter.exists(p))await adapter.mkdir(p);}}
async function saveTask(plugin,entry,intent){
 const p=paperIdentity(entry.item||entry),settings=plugin.settings,folder=settings.inboxFolder,prompt=taskText(entry,intent,settings);
 const actualIntent=intent?.trim()||normalizeHandoff(settings.handoff).defaultIntent||DEFAULT_INTENT;
 await ensureFolder(plugin.app.vault.adapter,folder);
 // Template/context changes are meaningful new tasks; old tasks stay untouched.
 const key=digest({paper:p.doi?.toLowerCase()||p.url,intent:actualIntent,prompt}).slice(0,16),indexPath=`${folder}/task-${key}.json`,a=plugin.app.vault.adapter;
 if(await a.exists(indexPath)){const old=JSON.parse(await a.read(indexPath));if(typeof old.note==='string'&&old.note.startsWith(folder+'/')&&await a.exists(pathInVault(old.note)))return {...old,reused:true};}
 const title=p.title.replace(/[\\/:*?"<>|#\[\]\x00-\x1f]/g,' ').trim().slice(0,75),date=new Date().toISOString().slice(0,10);
 const note=`${folder}/${date} ${title} ${key.slice(0,5)}.md`;
 const task={version:2,id:key,status:'saved',createdAt:new Date().toISOString(),paper:p,intent:actualIntent,prompt,promptDigest:digest(prompt),note};
 await a.write(note,`---\ntype: research-radar-task\nstatus: saved\n---\n\n> 已保存待交接；尚未发送给智能体，尚未下载或归档。\n\n${prompt}`);
 await a.write(indexPath,JSON.stringify(task,null,2));return task;
}
class BatchPaperHandoffModal extends Modal{
 constructor(plugin,entries,done){super(plugin.app);this.plugin=plugin;this.entries=entries;this.done=done;this.revision=plugin.revision;this.receipts=[];this.settings={handoff:normalizeHandoff(plugin.settings.handoff),inboxFolder:plugin.settings.inboxFolder};}
 currentPrompt(){if(this.plugin.revision!==this.revision)throw Error('交接设置已变化，请关闭后重新打开，避免使用旧模板。');const base=this.settings.handoff.defaultIntent||DEFAULT_INTENT;return {intent:this.extra?.trim()?`${base}\n\n本次补充：${this.extra.trim()}`:base,prompt:buildPrompt(this.entries.map((entry,i)=>this.receipts[i]?{...entry,taskNote:this.receipts[i].note}:entry),this.extra?.trim()?`${base}\n\n本次补充：${this.extra.trim()}`:base,this.settings)};}
 onOpen(){
  this.modalEl?.classList.add('rr-handoff-container');
  const e=this.contentEl;e.classList.add('rr-handoff-modal');e.createEl('h2',{text:`交给智能体 · ${this.entries.length} 篇`});
  e.createEl('p',{text:'已套用交接模板。复制到你已配置的 Agent 即可执行；无需在这里重新配置模型或工具。'});
  e.createEl('p',{cls:'rr-handoff-target',text:`结果位置：${this.settings.inboxFolder} · 当前未发送、未执行`});
  const options=e.createEl('details');options.createEl('summary',{text:'本次补充要求（可选）'});
  const extra=options.createEl('textarea',{cls:'rr-handoff-extra'});extra.setAttribute('aria-label','本次补充要求');extra.placeholder='默认要求已保存；仅填写这一次额外关注的问题。';
  const details=e.createEl('details');details.createEl('summary',{text:'查看执行 Prompt'});
  const preview=details.createEl('textarea',{cls:'rr-handoff-prompt'});preview.readOnly=true;preview.setAttribute('aria-label','完整执行Prompt');preview.value=this.currentPrompt().prompt;
  extra.addEventListener('input',()=>{this.extra=extra.value;try{preview.value=this.currentPrompt().prompt;}catch(err){state.textContent=err.message;}});
  const state=e.createEl('p',{cls:'rr-config-status'});state.setAttribute('aria-live','polite');
  const buttons=e.createEl('div',{cls:'rr-handoff-actions'});
  const copy=async()=>{const {prompt}=this.currentPrompt();preview.value=prompt;await navigator.clipboard.writeText(prompt);};
  const copyButton=buttons.createEl('button',{cls:'mod-cta',text:'复制执行 Prompt'});copyButton.type='button';copyButton.onclick=async()=>{try{await copy();state.textContent='完整Prompt已复制；请粘贴到现有Agent并发送。当前尚未执行。';}catch(err){state.textContent=err.message;}};
  const saveButton=buttons.createEl('button',{text:'保存并复制 Prompt'});saveButton.type='button';saveButton.onclick=async()=>{
   saveButton.disabled=true;const completed=[];try{
    const {intent}=this.currentPrompt();for(const [i,entry] of this.entries.entries()){this.receipts[i]=await this.plugin.enqueueHandoff(entry,intent);completed.push(entry);}
    this.done?.(completed);try{await copy();state.textContent=`已保存 ${completed.length} 篇并复制完整Prompt；粘贴到Agent发送后执行。`;}catch(err){state.textContent=`已保存 ${completed.length} 篇；复制未完成：${err.message}。可再次点击复制。`;}
   }catch(err){state.textContent=`已保存 ${completed.length} 篇，失败：${err.message}`;}finally{saveButton.disabled=false;}
  };
  const link=e.createEl('button',{cls:'rr-handoff-settings',text:'修改默认要求 / Prompt模板'});link.type='button';link.onclick=()=>{this.close();window.setTimeout(()=>{this.app.setting?.open();this.app.setting?.openTabById('research-radar');},0);};
 }
 onClose(){this.contentEl.empty();}
}
class PaperHandoffModal extends BatchPaperHandoffModal{constructor(plugin,item,topic,journal){super(plugin,[{item,topic,journal}]);}}
module.exports={PaperHandoffModal,BatchPaperHandoffModal,saveTask,taskText,buildPrompt};
