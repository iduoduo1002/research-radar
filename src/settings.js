'use strict';
const {PluginSettingTab,Setting,Modal,Notice,SecretComponent}=require('obsidian');
const {LABELS,AI}=require('./translation');
const {clone,normalizeSettings,pathInVault}=require('./config');
const {DEFAULT_TEMPLATE,DEFAULT_INTENT}=require('./handoff-prompt');
class ProfileModal extends Modal{
 constructor(plugin,mode){super(plugin.app);this.plugin=plugin;this.mode=mode;}
 onOpen(){const e=this.contentEl;e.createEl('h2',{text:this.mode==='export'?'导出可分享主题方案':'导入主题方案'});
 e.createEl('p',{text:'主题方案含检索式、关键词和种子信息，请在分享前检查。翻译地址、Zotero 设置、论文缓存和任务不包含在导出中。'});
 let text=this.mode==='export'?JSON.stringify(this.plugin.exportProfile(),null,2):'',preview=null;
 const area=e.createEl('textarea',{cls:'rr-config-json'});area.value=text;area.setAttribute('aria-label','主题方案 JSON');area.addEventListener('input',()=>{text=area.value;preview=null;});
 const status=e.createEl('pre',{cls:'rr-config-status'});
 if(this.mode==='export'){new Setting(e).addButton(b=>b.setButtonText('复制方案').onClick(async()=>{try{await navigator.clipboard.writeText(area.value);status.textContent='已复制。';}catch(err){status.textContent=err.message;}}));return;}
 let file='Research Radar/profile.json';new Setting(e).setName('从 Vault 文件读取').addText(t=>t.setValue(file).onChange(v=>file=v)).addButton(b=>b.setButtonText('读取').onClick(async()=>{try{text=await this.app.vault.adapter.read(pathInVault(file));area.value=text;preview=null;status.textContent='已读取，请预览。';}catch(err){status.textContent=err.message;}}));
 new Setting(e).addButton(b=>b.setButtonText('校验与预览').onClick(()=>{try{preview=this.plugin.previewProfile(text);status.textContent=JSON.stringify(preview.changes,null,2);}catch(err){preview=null;status.textContent=err.message;}})).addButton(b=>b.setButtonText('应用预览方案').setCta().onClick(async()=>{try{if(!preview)throw Error('请先校验与预览。');await this.plugin.applyProfile(preview.profile,{expectedRevision:preview.revision});new Notice('Research Radar 主题方案已应用');this.close();}catch(err){status.textContent=err.message;}}));
 }
 onClose(){this.contentEl.empty();}
}
class RadarSettingsTab extends PluginSettingTab{
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;this.topicIndex=0;this.sourceIndex=0;}
 display(){this.draft=clone(this.plugin.settings);this.baseRevision=this.plugin.revision;this.render();}
 render(){const e=this.containerEl;e.empty();const d=this.draft;
 e.createEl('h2',{text:'Research Radar'});e.createEl('p',{text:'独立论文工作台。修改暂存在此页，点击“保存设置”后统一生效。主题与来源可通过表单编辑，也可由 Agent 生成方案导入。'});
 const help=new Setting(e).setName('使用帮助');
 for(const [key,label] of [['guide','安装与使用说明'],['security','安全配置说明'],['agent','Agent 配置指南'],['status','验收记录']])help.addButton(b=>b.setButtonText(label).onClick(()=>this.plugin.openHelp(key)));
 const status=e.createEl('p',{cls:'rr-config-status'});
 new Setting(e).addButton(b=>b.setButtonText('打开雷达').onClick(()=>this.plugin.openRadar())).addButton(b=>b.setButtonText('保存设置').setCta().onClick(async()=>{try{await this.plugin.applySettings(d,this.baseRevision);this.display();new Notice('设置已保存');}catch(err){status.textContent=err.message;}})).addButton(b=>b.setButtonText('恢复上一版').onClick(async()=>{try{await this.plugin.rollbackSettings();this.display();new Notice('已恢复上一版设置');}catch(err){status.textContent=err.message;}}));
 const number=(name,key)=>new Setting(e).setName(name).addText(t=>t.setValue(String(d[key])).onChange(v=>d[key]=Number(v)));
 number('最新列表上限（1–100）','latestLimit');number('历史列表上限（1–100）','historyLimit');
 new Setting(e).setName('历史回溯年数（1–20）').addText(t=>t.setValue(String(d.radar.lookbackYears)).onChange(v=>d.radar.lookbackYears=Number(v)));
 new Setting(e).setName('默认浏览范围').addDropdown(t=>t.addOptions({latest:'最新',history:'历史精选'}).setValue(d.radar.defaultView).onChange(v=>d.radar.defaultView=v));
 new Setting(e).setName('自动刷新元数据').setDesc('关闭时仅打开列表或手动刷新时检索，不启动翻译。').addToggle(t=>t.setValue(d.autoRefresh).onChange(v=>d.autoRefresh=v));
 e.createEl('h3',{text:'主题与来源'});
 this.topicIndex=Math.min(this.topicIndex,d.radar.topics.length-1);const topic=d.radar.topics[this.topicIndex];
 new Setting(e).setName('编辑主题').addDropdown(t=>{d.radar.topics.forEach((x,i)=>t.addOption(String(i),x.label));t.setValue(String(this.topicIndex)).onChange(v=>{this.topicIndex=Number(v);this.sourceIndex=0;this.render();});}).addButton(b=>b.setButtonText('添加主题').onClick(()=>{const id=`topic-${Date.now()}`;d.radar.topics.push({id,label:'新主题',keywordFilters:[],sources:[{id:'source',name:'新来源',kind:'journal',provider:'pubmed',query:'metabolomics[Title/Abstract]',signals:[]}]});this.topicIndex=d.radar.topics.length-1;this.sourceIndex=0;this.render();})).addButton(b=>b.setButtonText('删除此主题').setDisabled(d.radar.topics.length===1).onClick(()=>{d.radar.topics.splice(this.topicIndex,1);if(d.radar.defaultTopic===topic.id)d.radar.defaultTopic=d.radar.topics[0].id;this.topicIndex=0;this.sourceIndex=0;this.render();}));
 new Setting(e).setName('主题名称').addText(t=>t.setValue(topic.label).onChange(v=>topic.label=v));
 new Setting(e).setName('设为默认主题').addToggle(t=>t.setValue(d.radar.defaultTopic===topic.id).onChange(v=>{if(v)d.radar.defaultTopic=topic.id;}));
 e.createEl('h4',{text:'可点击关键词'});
 for(const [i,f] of (topic.keywordFilters||[]).entries()){new Setting(e).setName(`关键词 ${i+1}`).addText(t=>t.setPlaceholder('标签').setValue(f.label).onChange(v=>f.label=v)).addText(t=>t.setPlaceholder(f.sourceId?'来源 ID':'英文词组，用 | 分隔').setValue(f.sourceId||f.pattern).onChange(v=>{if(f.sourceId)f.sourceId=v;else f.pattern=v;})).addButton(b=>b.setButtonText('删除').onClick(()=>{topic.keywordFilters.splice(i,1);this.render();}));}
 new Setting(e).addButton(b=>b.setButtonText('添加关键词').onClick(()=>{topic.keywordFilters??=[];topic.keywordFilters.push({label:'关键词',pattern:'keyword'});this.render();}));
 this.sourceIndex=Math.min(this.sourceIndex,topic.sources.length-1);const source=topic.sources[this.sourceIndex];
 new Setting(e).setName('编辑来源').addDropdown(t=>{topic.sources.forEach((x,i)=>t.addOption(String(i),x.name));t.setValue(String(this.sourceIndex)).onChange(v=>{this.sourceIndex=Number(v);this.render();});}).addButton(b=>b.setButtonText('添加来源').onClick(()=>{topic.sources.push({id:`source-${Date.now()}`,name:'新来源',kind:'journal',provider:'pubmed',query:'metabolomics[Title/Abstract]',signals:[]});this.sourceIndex=topic.sources.length-1;this.render();})).addButton(b=>b.setButtonText('删除来源').setDisabled(topic.sources.length===1).onClick(()=>{topic.sources.splice(this.sourceIndex,1);this.sourceIndex=0;this.render();}));
 const field=(label,key,large=false)=>{const s=new Setting(e).setName(label);const fn=t=>t.setValue(String(source[key]||'')).onChange(v=>source[key]=v);if(large)s.addTextArea(fn);else s.addText(fn);};
 field('来源名称','name');field('显示简称','shortName');
 new Setting(e).setName('检索方式').addDropdown(t=>t.addOptions({pubmed:'PubMed',crossref:'Crossref',rss:'RSS',aggregate:'多来源汇总',seed:'文献种子'}).setValue(source.provider||'rss').onChange(v=>{source.provider=v==='rss'?undefined:v;source.kind=['aggregate','seed'].includes(v)?'focus':'journal';this.render();}));
 if(source.provider==='pubmed')field('PubMed 检索式','query',true);
 else if(source.provider==='crossref'){field('期刊 ISSN','issn');field('检索词','crossrefQuery',true);}
 else if(source.provider==='aggregate'){new Setting(e).setName('汇总来源 ID（逗号分隔）').setDesc(topic.sources.filter(x=>x!==source).map(x=>`${x.id}: ${x.name}`).join('；')).addTextArea(t=>t.setValue((source.journalIds||[]).join(',')).onChange(v=>source.journalIds=v.split(',').map(x=>x.trim()).filter(Boolean)));}
 else if(source.provider==='seed'){new Setting(e).setName('种子 JSON').setDesc('数组，每篇包含 doi、pmid、title。需先核对标识。').addTextArea(t=>t.setValue(JSON.stringify(source.seeds||[],null,2)).onChange(v=>{try{source.seeds=JSON.parse(v);status.textContent='';}catch{status.textContent='种子 JSON 尚未有效，请修正后保存。';source.seeds=v;}}));}
 else field('HTTPS RSS 地址','url',true);
 new Setting(e).setName('相关性规则').setDesc('一行一组：权重 | 英文关键词正则，例如 3 | flavonoid|polyphenol。为空则不额外加权。').addTextArea(t=>t.setValue((source.signals||[]).map(s=>`${s.weight} | ${s.pattern}`).join('\n')).onChange(v=>{source.signals=v.split('\n').filter(x=>x.trim()).map(x=>{const i=x.indexOf('|');return{weight:Number(x.slice(0,i).trim()),pattern:x.slice(i+1).trim()};});}));
 e.createEl('h3',{text:'翻译服务（手动触发）'});
 new Setting(e).setName('启用手动翻译').setDesc('悬停与中文切换只读缓存。勾选论文后点翻译才请求服务；试译需手动点击。切换服务后请保存。').addToggle(t=>t.setValue(d.translation.enabled).onChange(v=>d.translation.enabled=v));
 new Setting(e).setName('翻译服务').addDropdown(t=>t.addOptions(LABELS).setValue(d.translation.provider).onChange(v=>{d.translation.provider=v;this.render();}));
 const tr=d.translation;
 const secret=(name,key)=>{
  const row=new Setting(e).setName(name).setDesc('在 Obsidian 密钥管理中选择或创建 API Key；这里只保存引用名称。不要将密钥填进模型名或地址。');
  if(SecretComponent&&row.addComponent&&this.app.secretStorage)row.addComponent(el=>new SecretComponent(this.app,el).setValue(tr[key]).onChange(v=>tr[key]=v));
  else row.setDesc('当前 Obsidian 缺少密钥选择界面，请升级 Obsidian；可先使用本地或免密钥服务。');
 };
 if(tr.provider==='ollama'){
  new Setting(e).setName('Ollama 地址').setDesc('本机根地址；请求空闲保留30秒，实际驻留由服务决定。').addText(t=>t.setValue(tr.endpoint).onChange(v=>tr.endpoint=v));
  new Setting(e).setName('模型名称').addText(t=>t.setValue(tr.model).onChange(v=>tr.model=v));
 }else{
  new Setting(e).setName('允许在线发送所选标题与摘要').setDesc('仅发送所选文献和手动试译文本，不上传整个 Vault/PDF。API 可能收费，服务方适用其数据政策；关闭后拒绝在线翻译与诊断请求。').addToggle(t=>t.setValue(tr.allowOnline).onChange(v=>tr.allowOnline=v));
  if(tr.provider==='google')e.createEl('p',{text:'Google 网页翻译免密钥，不加载本地大模型；这是实验性网页接口，可能限流、被阻断或变更。'});
  if(tr.provider==='microsoft'){
   e.createEl('p',{text:'微软官方Translator API：可自行申请Azure F0免费层，是否有额度以账户为准，其他层可能收费。与免密钥Bing网页服务不同。'});
   new Setting(e).setName('Azure 资源区域').setDesc('按控制台填写，例如 eastasia；全局资源可留空。').addText(t=>t.setValue(tr.microsoftRegion).onChange(v=>tr.microsoftRegion=v));
   secret('微软 Translator API Key','microsoftSecretRef');
  }
  if(tr.provider==='bing'){
   e.createEl('p',{text:'Bing免密钥网页接口，可能要求验证/返回401/失效，不承诺可用；不会绕过验证或自动改用其他服务。先检查短句，再试1篇。'});
   new Setting(e).setName('Bing 服务区域').addDropdown(t=>t.addOptions({global:'国际站 www.bing.com',cn:'中国站 cn.bing.com'}).setValue(tr.bingRegion).onChange(v=>tr.bingRegion=v));
  }
  if(tr.provider==='mymemory')e.createEl('p',{text:'MyMemory免密钥公开API，匿名额度通常为每日5,000字符（按共享公网IP）；只适合少量论文。不申请邮箱提额、不提交译文到公共记忆库；额度不足时暂停。英文→简体中文。'});
  if(AI[tr.provider]){
   const ai=AI[tr.provider];
   e.createEl('p',{text:`${ai.label}官方AI接口，需要个人API密钥和可用额度；网页聊天订阅不代表API可用。连接检查只读取模型元数据；请再手动试译验证。`});
   new Setting(e).setName(`${ai.label} 模型`).setDesc('填写账户支持的文本模型，或清空后点检查连接选择返回的模型；不自动替换你的选择。').addText(t=>t.setValue(tr[tr.provider+'Model']).onChange(v=>tr[tr.provider+'Model']=v));
   if(tr.provider==='qwen')new Setting(e).setName('百炼 API 区域').setDesc('密钥必须和区域对应；专属业务空间域名可通过自定义兼容API配置。').addDropdown(t=>t.addOptions({cn:'中国北京 · DashScope',intl:'国际 · 新加坡'}).setValue(tr.qwenRegion).onChange(v=>tr.qwenRegion=v));
   secret(`${ai.label} API Key`,tr.provider+'SecretRef');
  }
  if(tr.provider==='deepl'){
   new Setting(e).setName('DeepL API 方案').setDesc('API Free 与 API Pro 的密钥和域名对应；网页订阅不等于 API 订阅。').addDropdown(t=>t.addOptions({free:'API Free',pro:'API Pro'}).setValue(tr.deeplPlan).onChange(v=>tr.deeplPlan=v));secret('DeepL API Key', 'deeplSecretRef');
  }
  if(tr.provider==='deepseek'){
   new Setting(e).setName('DeepSeek 模型').setDesc('官方 API：api.deepseek.com。请以账户实际可用模型为准。').addText(t=>t.setValue(tr.deepseekModel).onChange(v=>tr.deepseekModel=v));secret('DeepSeek API Key','deepseekSecretRef');
  }
  if(tr.provider==='compatible'){
   new Setting(e).setName('兼容 API 基础地址').setDesc('例如 https://your-provider.example/v1；程序追加 /chat/completions。密钥将发送至此域名，请核实服务归属；不跟随重定向。').addText(t=>t.setValue(tr.apiEndpoint).onChange(v=>tr.apiEndpoint=v));
   new Setting(e).setName('在线模型名称').setDesc('需要支持 Chat Completions、非流式 JSON 输出及 finish_reason=stop。').addText(t=>t.setValue(tr.apiModel).onChange(v=>tr.apiModel=v));secret('此 API 的密钥','apiSecretRef');
  }
 }
 const connection=e.createEl('div',{cls:'rr-config-status'});
 connection.setAttribute('aria-live','polite');
 new Setting(e).setName('翻译连接诊断').setDesc('检查使用当前草稿：本地只读模型清单，免密钥/微软翻译发送固定短测试，DeepL读额度，AI服务只读模型元数据。在线诊断同样需授权；试译使用已保存设置，可能产生费用。').addButton(b=>b.setButtonText('检查连接与模型').onClick(async()=>{
  b.setDisabled(true);connection.textContent='正在检查所选翻译服务…';
  try{const result=await this.plugin.checkTranslationConnection(d);connection.textContent=result.message||(result.matched?'连接正常，所选模型可用。':'服务已连接，但未找到当前模型，请核对模型名称后保存。');
   for(const name of result.models){const button=connection.createEl('button',{text:name});button.type='button';button.onclick=()=>{d.translation[tr.provider==='ollama'?'model':AI[tr.provider]?tr.provider+'Model':tr.provider==='deepseek'?'deepseekModel':'apiModel']=name;this.render();};}
   if(tr.provider==='ollama'&&!result.models.length)connection.createEl('p',{text:'服务未安装模型，请先在 Ollama 安装可用聊天模型。'});
  }catch(err){connection.textContent=err.message;}finally{b.setDisabled(false);}
 })).addButton(b=>b.setButtonText('试译一句（需保存启用）').onClick(async()=>{
  b.setDisabled(true);connection.textContent='正在请求所选服务试译…';
  try{if(JSON.stringify(d.translation)!==JSON.stringify(this.plugin.settings.translation))throw Error('翻译配置尚未保存，请先点击保存设置。');
   if(this.plugin.translationQueue.pending.size||['queued','running'].includes(this.plugin.translationBatch?.state))throw Error('已有翻译任务，请先暂停并等待当前请求完成。');
   const t=await this.plugin.translate('Retention time prediction for metabolite annotation','The model distinguished 47 of 50 isomer pairs. Experimental validation is still required.');
   connection.textContent=`试译成功${t.cached?'（读取已保存译文）':''}：${t.titleZh}\n${t.abstractZh}\n现在可返回雷达勾选论文，再点击翻译。`;
  }catch(err){connection.textContent=err.message;}finally{b.setDisabled(false);}
 }));
 e.createEl('h3',{text:'本机 Zotero 与收件箱'});
 new Setting(e).setName('Zotero 本机收录标记').setDesc('只读个人库；红色为检测到本地 PDF，绿色为已收录但未发现本地 PDF。断线为待核，打开 Zotero 后可在列表点重试。需 Zotero 本机 API。').addToggle(t=>t.setValue(d.zotero.enabled).onChange(v=>d.zotero.enabled=v));
 new Setting(e).setName('Zotero 端口').addText(t=>t.setValue(String(d.zotero.port)).onChange(v=>d.zotero.port=Number(v)));
 new Setting(e).setName('Agent配置Zotero联动').setDesc('生成限定本库和本机端口的Prompt；只读核对，不下载或写库。使用已保存的端口，若修改请先保存。').addButton(b=>b.setButtonText('Zotero联动配置Prompt').onClick(()=>this.plugin.openZoteroSetup())).addButton(b=>b.setButtonText('手动配置与颜色说明').onClick(()=>this.plugin.openHelp('zotero')));
 new Setting(e).setName('论文任务收件箱').addText(t=>t.setValue(d.inboxFolder).onChange(v=>d.inboxFolder=v));
 e.createEl('h3',{text:'Agent 论文交接'});
 e.createEl('p',{text:'复用你已配置的Agent，无需重设模型或工具。默认要求和背景保存一次，交接时自动生成完整Prompt。这里不自动发送或启动进程。'});
 const handoffField=(name,key,description)=>{new Setting(e).setName(name).setDesc(description);const input=e.createEl('textarea',{cls:key==='promptTemplate'?'rr-handoff-template':'rr-handoff-field'});input.setAttribute('aria-label',name);input.value=d.handoff[key];input.addEventListener('input',()=>d.handoff[key]=input.value);};
 handoffField('默认论文处理要求','defaultIntent','单篇和批量交接通用；本次额外关注点可在交接窗口补充。');
 handoffField('研究背景与借鉴方向','projectContext','例如研究对象、当前课题及方法重点。只填可交给Agent的信息；留空则沿用接收对话背景。');
 const template=e.createEl('details');template.createEl('summary',{text:'编辑Prompt模板（高级）'});
 const area=template.createEl('textarea',{cls:'rr-handoff-template'});area.setAttribute('aria-label','Agent执行Prompt模板');area.value=d.handoff.promptTemplate;area.addEventListener('input',()=>d.handoff.promptTemplate=area.value);
 template.createEl('p',{text:'支持 {{papers}}（必填）、{{count}}、{{intent}}、{{context}}、{{inbox}}。替换文本，不执行代码。论文身份、摘要及主题会自动填入。'});
 new Setting(e).addButton(b=>b.setButtonText('恢复内置交接模板').onClick(()=>{d.handoff.promptTemplate=DEFAULT_TEMPLATE;d.handoff.defaultIntent=DEFAULT_INTENT;this.render();status.textContent='内置模板已填入草稿，研究背景保留；保存后生效。';}));
 e.createEl('h3',{text:'Agent 与分享'});
 e.createEl('p',{text:'让 Agent 按文档生成 research-radar-profile JSON，在此导入并预览后应用。高级配置 API 支持版本校验，避免覆盖他人的新改动。'});
 new Setting(e).addButton(b=>b.setButtonText('保存设置').setCta().onClick(async()=>{try{await this.plugin.applySettings(d,this.baseRevision);this.display();new Notice('设置已保存');}catch(err){status.textContent=err.message;new Notice(err.message,10000);}}));
 new Setting(e).addButton(b=>b.setButtonText('导入方案').onClick(()=>new ProfileModal(this.plugin,'import').open())).addButton(b=>b.setButtonText('导出已保存方案').onClick(()=>new ProfileModal(this.plugin,'export').open()));
 }
}
module.exports={RadarSettingsTab,ProfileModal};
