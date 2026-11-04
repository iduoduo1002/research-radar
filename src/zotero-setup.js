'use strict';
const {Modal,Setting}=require('obsidian');
function normalizeZotero(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['enabled','port'].includes(k))||typeof input.enabled!=='boolean'||!Number.isInteger(input.port)||input.port<1024||input.port>65535)
  throw Error('Zotero 配置只接受 enabled 布尔值和 1024–65535 的整数 port。');
 return {enabled:input.enabled,port:input.port};
}
function setupPrompt(vaultName,port=23119){
 normalizeZotero({enabled:true,port});
 return [
 '请为当前 Obsidian 库配置 Research Radar 与 Zotero 的只读联动，并核验文献标题颜色。',
 `目标库名（必须精确核对）：${JSON.stringify(String(vaultName))}`,
 `本次授权范围：仅启用 Research Radar 的 Zotero 标记，使用本机端口 ${port}；不改其他设置。`,
 '先读取插件内置的“Zotero联动与Agent配置”帮助或 docs/ZOTERO.md。确认插件已加载；若无 CLI / eval，指导我按手动路径操作，不直接改 data.json。',
 '不要扫描全盘、读取 Zotero SQLite、环境密钥或网页凭据；不要启动服务、放开远程访问或修改 Zotero 偏好文件。先检查 Zotero 桌面应用与本机 API；如未启用，请提示我在 Zotero 设置中开启“允许此计算机上的其他应用程序与 Zotero 通信”，然后继续。',
 '在正确的 Obsidian 库中执行以下 JavaScript（CLI 调用时使用参数数组或正确 shell 引用，禁止拼接未转义的库名）：',
 'const p = app.plugins.plugins["research-radar"];',
 `if (app.vault.getName() !== ${JSON.stringify(String(vaultName))}) throw Error("目标库不匹配");`,
 'if (!p?.previewZoteroConfiguration || !p?.applyZoteroConfiguration) throw Error("请先升级 Research Radar 至 0.4.3 或更高版本");',
 'const before = p.getZoteroConfiguration();',
 `const preview = p.previewZoteroConfiguration({enabled:true,port:${port}});`,
 '核对 preview 仅涉及 Zotero 开关和端口；授权范围内再执行：',
 'await p.applyZoteroConfiguration(preview.configuration, {expectedRevision:preview.revision});',
 'const after = p.getZoteroConfiguration();',
 'await p.openRadar();',
 'const verification = await p.checkZoteroConnection();',
 '发生版本冲突则重新读取和核对；不要绕过 revision。翻译运行中则先报告并等待，不擅自中断或启动翻译。',
 '验收标题颜色：原色=成功核对后未匹配；红色=已收录且发现可读取的本地论文PDF；绿色=已收录但未发现本地论文PDF；琥珀/问号=连接、身份或附件仍待核。关闭联动时原色不代表未收录。',
 '仅核对现有条目，不下载全文、不写入/分类/删除 Zotero，不对论文执行代码。全文获取是另一个经授权任务：如另外授权，使用已配置工具查重、取得合法PDF后必须回读附件；完成后再点 Zotero ↻ 更新颜色。',
 '只报告 before/after 的 Zotero 字段、连接结果、当前列表红/绿/未匹配/待核数量；不要输出整库条目或其他配置。没有真实红/绿样例时如实说明；不能造假或修改文库来凑颜色。PDF可读不等于全文完整或已阅读全文。',
 '交付时分别说明“配置已保存”“条目核对完成”“附件核对结果”；失败保留具体原因与最小下一步。'
 ].join('\n');
}
class ZoteroSetupModal extends Modal{
 constructor(plugin){super(plugin.app);this.plugin=plugin;}
 onOpen(){const e=this.contentEl;e.createEl('h2',{text:'Zotero联动与Agent配置'});e.createEl('p',{text:'复制后粘贴给你已配置的Agent。此处仅生成提示词，不会开启联动、访问文库或启动Agent。'});
 const area=e.createEl('textarea',{cls:'rr-config-json'});area.setAttribute('aria-label','Zotero联动配置Prompt');area.readOnly=true;area.value=setupPrompt(this.app.vault.getName(),this.plugin.settings.zotero.port);
 const status=e.createEl('p',{cls:'rr-config-status'});new Setting(e).addButton(b=>b.setButtonText('复制Zotero配置Prompt').setCta().onClick(async()=>{try{await navigator.clipboard.writeText(area.value);status.textContent='已复制；尚未配置、尚未执行。';}catch{status.textContent='剪贴板不可用，请手动选择并复制上方提示词。';}})).addButton(b=>b.setButtonText('查看手动配置与颜色说明').onClick(()=>{this.close();this.plugin.openHelp('zotero');}));
 }
 onClose(){this.contentEl.empty();}
}
module.exports={normalizeZotero,setupPrompt,ZoteroSetupModal};
