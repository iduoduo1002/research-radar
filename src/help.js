'use strict';
const {Modal,MarkdownRenderer,Component}=require('obsidian');
const pages={
 zotero:{title:'Zotero联动与Agent配置',text:require('../docs/ZOTERO.md')},
 guide:{title:'安装与使用说明',text:require('../docs/USER-GUIDE.md')},
 security:{title:'安全配置说明',text:require('../docs/SECURITY.md')},
 agent:{title:'Agent 配置指南',text:require('../AGENT.md')},
 status:{title:'验收记录',text:require('../docs/STATUS.md')}
};
class HelpModal extends Modal{
 constructor(plugin,key='guide'){super(plugin.app);this.plugin=plugin;this.key=key;this.renderComponent=new Component();}
 async onOpen(){const page=pages[this.key]||pages.guide;this.contentEl.empty();this.contentEl.createEl('h2',{text:page.title});const body=this.contentEl.createEl('div',{cls:'rr-help-body'});this.renderComponent.load();this.renderComponent.registerDomEvent(body,'click',event=>{const a=event.target.closest?.('a');if(!a)return;const key={'AGENT.md':'agent','USER-GUIDE.md':'guide','SECURITY.md':'security','STATUS.md':'status','ZOTERO.md':'zotero'}[(a.getAttribute('href')||'').split('/').pop()];if(key){event.preventDefault();event.stopPropagation();this.close();this.plugin.openHelp(key);}});try{await MarkdownRenderer.render(this.app,page.text.replace(/^# .*\r?\n/,''),body,'',this.renderComponent);}catch(e){body.textContent=page.text;}}
 onClose(){this.renderComponent.unload();this.contentEl.empty();}
}
module.exports={HelpModal,pages};
