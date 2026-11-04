'use strict';
const {ItemView,Notice}=require('obsidian');
const {RadarEngine,RadarBlock}=require('./engine');
const {DEFAULT_SETTINGS,normalizeSettings,normalizeRadar,profile,mergeProfile,describeChange,pathInVault,clone,digest}=require('./config');
const {RadarSettingsTab,ProfileModal}=require('./settings');
const {saveTask}=require('./handoff');
const {HelpModal}=require('./help');
const VIEW='research-radar-view';
class RadarView extends ItemView{
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;}
 getViewType(){return VIEW;} getDisplayText(){return 'Research Radar';} getIcon(){return 'radar';}
 async onOpen(){this.contentEl.empty();this.contentEl.classList.add('rr-workspace');this.block=new RadarBlock(this.contentEl,this.plugin,'@settings');this.addChild(this.block);}
 async onClose(){if(this.block)this.removeChild(this.block);this.contentEl.empty();}
}
class ResearchRadar extends RadarEngine{
 async onload(){
  const data=await this.loadData();
  try{this.settings=normalizeSettings(data?.settings||DEFAULT_SETTINGS);}catch(e){new Notice(`Research Radar 配置无效，原文件保留：${e.message}`,12000);throw e;}
  this.revision=Number.isInteger(data?.revision)?data.revision:0;this.previousSettings=data?.previousSettings||null;this.handoffTail=Promise.resolve();
  await super.onload();
  this.registerView(VIEW,leaf=>new RadarView(leaf,this));
  this.addRibbonIcon('radar','打开 Research Radar',()=>this.openRadar());
  this.addCommand({id:'open-radar',name:'打开论文雷达',callback:()=>this.openRadar()});
  this.addCommand({id:'import-profile',name:'导入 Agent / 共享主题方案',callback:()=>new ProfileModal(this,'import').open()});
  this.addCommand({id:'export-profile',name:'导出主题方案',callback:()=>new ProfileModal(this,'export').open()});
  this.addSettingTab(new RadarSettingsTab(this.app,this));
  this.addCommand({id:'help',name:'安装与使用说明',callback:()=>this.openHelp()});
  this.registerMarkdownCodeBlockProcessor('research-radar-view',(_source,el,ctx)=>{ctx.addChild(new RadarBlock(el,this,'@settings'));});
 }
 openHelp(key='guide'){const modal=new HelpModal(this,key);modal.open();return modal;}
 async openRadar(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}await this.app.workspace.revealLeaf(leaf);}
 getConfiguration(){return {revision:this.revision,settings:clone(this.settings)};}
 exportProfile(){return profile(this.settings);}
 previewProfile(input){const next=mergeProfile(input,this.settings);return {revision:this.revision,changes:describeChange(this.settings,next),profile:profile(next)};}
 applyProfile(input,{expectedRevision}={}){return this.applySettings(mergeProfile(input,this.settings),expectedRevision);}
 async readRadarConfig(p='@settings'){
  const r=p==='@settings'?clone(this.settings.radar):normalizeRadar(JSON.parse(await this.app.vault.adapter.read(pathInVault(p))));
  for(const t of r.topics)for(const s of t.sources){s.latestLimit=this.settings.latestLimit;s.historyLimit=this.settings.historyLimit;if(!s.provider)continue;const u=new URL(s.url);u.searchParams.set('rrConfig',digest({s,years:r.lookbackYears}).slice(0,16));s.url=u.href;}
  return r;
 }
 snapshot(){return {version:1,settings:this.settings,revision:this.revision,previousSettings:this.previousSettings,feeds:this.feedCache,translations:this.translations,savedTranslations:this.savedTranslations,translationBatch:this.translationBatch};}
 applySettings(input,expectedRevision){
  const next=normalizeSettings(input);
  const operation=this.saveTail.then(async()=>{
   if(!this.alive)throw Error('插件已停止。');
   if(expectedRevision===undefined||expectedRevision!==this.revision)throw Error('配置已变化或缺少版本号，请重新预览。');
   if(this.translationQueue.pending.size||['running','queued'].includes(this.translationBatch?.state))throw Error('请先暂停翻译，并等待当前一篇结束后再修改设置。');
   const old=this.snapshot();
   this.settings=next;this.previousSettings=clone(old.settings);this.revision++;this.feedPending.clear();this.catalogPending.clear();this.zoteroIndex=null;this.zoteroIndexAt=0;this.zoteroPdfCache.clear();
   try{await this.saveData(this.snapshot());}catch(e){this.settings=old.settings;this.previousSettings=old.previousSettings;this.revision=old.revision;this.feedCache=old.feeds;throw e;}
   return {revision:this.revision,changes:describeChange(old.settings,next)};
  });
  this.saveTail=operation.catch(()=>{});
  return operation.then(async result=>{for(const b of this.blocks)if(b.alive)await b.loadConfiguration();return result;});
 }
 rollbackSettings(){if(!this.previousSettings)throw Error('尚无可恢复设置。');return this.applySettings(this.previousSettings,this.revision);}
 async pauseTranslationBatch(){if(this.translationBatch&&['queued','running'].includes(this.translationBatch.state)){this.translationBatch.state='paused';await this.persist();this.notifyTranslations();}}
 enqueueHandoff(entry,intent){const p=this.handoffTail.then(()=>saveTask(this,entry,intent));this.handoffTail=p.catch(()=>{});return p;}
}
module.exports=ResearchRadar;
