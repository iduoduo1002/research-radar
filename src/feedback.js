// Modified 2026-11-04: user-reviewed issue drafts; no automatic submission or diagnostics upload.
'use strict';
const {Modal,apiVersion}=require('obsidian');
const REPOSITORY='https://github.com/iduoduo1002/research-radar';
const TYPES={bug:{label:'问题反馈',prefix:'Bug',template:'bug_report.md'},feature:{label:'功能建议',prefix:'Feature',template:'feature_request.md'},experience:{label:'体验意见',prefix:'Experience',template:'experience.md'}};
function environment(plugin){
 const version=v=>/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(v||'')?v:'未知';
 return {plugin:version(plugin.manifest?.version),obsidian:version(apiVersion),os:({darwin:'macOS',win32:'Windows',linux:'Linux'})[process.platform]||'其他桌面系统'};
}
function feedbackDraft(type,title,details,env){
 if(!TYPES[type])throw Error('请选择反馈类型。');
 const subject=String(title||'').trim(),content=String(details||'').trim();
 if(!subject||!content)throw Error('请填写简短标题和具体反馈内容。');
 if(subject.length>120||content.length>5000)throw Error('标题最多120字符，反馈内容最多5000字符。');
 const body=`## ${TYPES[type].label}\n\n${content}\n\n## 环境\n- Research Radar：${env.plugin}\n- Obsidian：${env.obsidian}\n- 系统：${env.os}\n\n请勿附上密钥、完整 data.json、私人文库或论文全文。`;
 const url=new URL(REPOSITORY+'/issues/new');
 url.searchParams.set('template',TYPES[type].template);url.searchParams.set('title',`[${TYPES[type].prefix}] ${subject}`);url.searchParams.set('body',body);
 return {title:`[${TYPES[type].prefix}] ${subject}`,body,url:url.href,urlTooLong:url.href.length>7000};
}
class FeedbackModal extends Modal{
 constructor(plugin){super(plugin.app);this.plugin=plugin;this.type='bug';this.env=environment(plugin);}
 openExternal(url){return require('electron').shell.openExternal(url);}
 async copyText(text){const nav=this.contentEl.ownerDocument.defaultView.navigator;await nav.clipboard.writeText(text);}
 onOpen(){
  const e=this.contentEl;e.empty();e.classList.add('rr-feedback-modal');this.modalEl?.classList.add('rr-feedback-container');
  e.createEl('h2',{text:'反馈与建议'});
  e.createEl('p',{text:'告诉我们哪里出错、需要什么功能，或哪些操作不顺手。提交后可在 GitHub 跟踪回复和修复。'});
  e.createEl('p',{cls:'rr-feedback-note',text:'这里只准备草稿；点击下方按钮后在浏览器登录 GitHub、检查并提交。不会自动上传日志、论文、设置或 Zotero 数据。版本与系统类型列在预览中；点击打开后，草稿通过链接发送到 GitHub，最后由你确认发布。'});
  const label=(text,input)=>{const row=e.createEl('label',{cls:'rr-feedback-label',text});row.append(input);return input;};
  const doc=e.ownerDocument;
  const select=doc.createElement('select');select.setAttribute('aria-label','反馈类型');
  for(const [key,value]of Object.entries(TYPES)){const o=doc.createElement('option');o.value=key;o.textContent=value.label;select.append(o);}label('反馈类型',select);this.typeSelect=select;
  const title=doc.createElement('input');title.type='text';title.maxLength=120;title.placeholder='一句话说明问题或建议';title.setAttribute('aria-label','反馈标题');label('简短标题',title);this.titleInput=title;
  const details=doc.createElement('textarea');details.maxLength=5000;details.rows=7;details.placeholder='描述操作步骤、实际表现和期望结果；也可以写下你希望增加的功能、使用场景或不顺手的地方。';details.setAttribute('aria-label','反馈内容');label('具体内容',details);this.detailsInput=details;
  const disclosure=e.createEl('details');disclosure.createEl('summary',{text:'检查将要发送的内容'});const preview=disclosure.createEl('pre',{cls:'rr-feedback-preview'});this.preview=preview;
  const status=e.createEl('p',{cls:'rr-config-status'});status.setAttribute('role','status');this.status=status;
  const buttons=e.createEl('div',{cls:'rr-feedback-actions'});
  const submit=buttons.createEl('button',{text:'在 GitHub 检查并提交',cls:'mod-cta'});submit.type='button';this.submitButton=submit;
  const copy=buttons.createEl('button',{text:'复制反馈草稿'});copy.type='button';this.copyButton=copy;
  const browse=buttons.createEl('button',{text:'已有反馈 / 查看进展'});browse.type='button';
  const prepare=()=>feedbackDraft(this.type,title.value,details.value,this.env);this.prepare=prepare;
  const update=()=>{this.type=select.value;try{const draft=prepare();preview.textContent=draft.title+'\n\n'+draft.body;submit.disabled=false;copy.disabled=false;status.textContent=draft.urlTooLong?'内容较长：请复制草稿后，在 GitHub 粘贴提交。':'';}catch(err){preview.textContent=`Research Radar ${this.env.plugin} · Obsidian ${this.env.obsidian} · ${this.env.os}`;submit.disabled=true;copy.disabled=true;status.textContent='';}};
  select.addEventListener('change',update);title.addEventListener('input',update);details.addEventListener('input',update);
  copy.addEventListener('click',async()=>{try{const draft=prepare();await this.copyText(draft.title+'\n\n'+draft.body);status.textContent='已复制。粘贴前请检查是否包含私人信息。';}catch(err){disclosure.open=true;status.textContent='复制失败；可从上方预览手动选择复制。';}});
  submit.addEventListener('click',async()=>{
   try{const draft=prepare();if(draft.urlTooLong){disclosure.open=true;status.textContent='草稿过长，尚未发送：先复制反馈，再点“已有反馈 / 查看进展”新建并粘贴。';return;}
    await this.openExternal(draft.url);status.textContent='已请求浏览器打开草稿；尚未提交，请在 GitHub 检查后点击提交。';
   }catch(err){disclosure.open=true;status.textContent='未能打开浏览器；请复制草稿，到 GitHub 仓库的 Issues 页面提交。';}
  });
  browse.addEventListener('click',async()=>{try{await this.openExternal(REPOSITORY+'/issues');status.textContent='已请求打开反馈列表。';}catch{status.textContent='请在浏览器打开 '+REPOSITORY+'/issues';}});
  update();
 }
 onClose(){this.contentEl.empty();}
}
module.exports={FeedbackModal,feedbackDraft,environment,TYPES,REPOSITORY};
