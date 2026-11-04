"use strict";
const { validateConfig } = require('./core');
const {AI,AI_DEFAULTS,LABELS}=require('./providers');
const {normalizeHandoff}=require('./handoff-prompt');
const safeRegex = require('safe-regex2');
const { createHash } = require('node:crypto');
const clone = x => JSON.parse(JSON.stringify(x));
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const DEFAULT_RADAR = {
  version:1, defaultTopic:'metabolomics', lookbackYears:5, defaultView:'latest',
  topics:[{id:'metabolomics',label:'质谱与代谢组学',description:'质谱注释、保留时间',
    keywordFilters:[{label:'质谱注释',pattern:'annotat|identif|mass spectr'},{label:'保留时间',pattern:'retention time|QSRR|DeepLC'}],
    sources:[{id:'ac',name:'Analytical Chemistry',shortName:'Anal. Chem.',kind:'journal',provider:'pubmed',query:'"Anal Chem"[Journal] AND (mass spectrometry[Title/Abstract] OR metabolomics[Title/Abstract])',signals:[{pattern:'annotat|identif|metabol|mass spectr',weight:3}]}]}]
};
const DEFAULT_SETTINGS = {
  schemaVersion:1, radar:DEFAULT_RADAR, latestLimit:20, historyLimit:100, autoRefresh:false,
  translation:{...AI_DEFAULTS,microsoftSecretRef:'',microsoftRegion:'',bingRegion:'global',qwenRegion:'cn',enabled:false,provider:'ollama',allowOnline:false,endpoint:'http://127.0.0.1:11434',model:'hy-mt2:latest',deeplPlan:'free',deeplSecretRef:'',deepseekModel:'deepseek-flash',deepseekSecretRef:'',apiEndpoint:'https://api.example.com/v1',apiModel:'',apiSecretRef:''},
  zotero:{enabled:false,port:23119}, handoff:normalizeHandoff(), inboxFolder:'Research Radar/Inbox'
};
function pathInVault(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('/') || /[\\:\x00-\x1f]/.test(value) || value.split('/').some(p=>!p || p==='..' || p==='.' || p.startsWith('.'))) throw Error('目录必须是普通的 Vault 相对路径，不能包含隐藏目录、绝对路径或上级路径。');
  return value.trim();
}
function parse(input) {
  const text = typeof input==='string' ? input : JSON.stringify(input);
  if (text.length>512000) throw Error('配置超过 500 KB。');
  const value=JSON.parse(text);
  const walk=x=>{if(x && typeof x==='object') for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k)) throw Error('配置含禁止的字段。');walk(x[k]);}};
  walk(value);return value;
}
function integer(n,min,max,label){if(!Number.isInteger(n)||n<min||n>max)throw Error(`${label}需要 ${min}–${max} 的整数。`);return n;}
function pattern(value){if(typeof value!=='string'||!value||value.length>512||!safeRegex(value))throw Error('关键词正则无效或复杂度过高，请使用简单词组与 | 分隔。');new RegExp(value,'i');return value;}
function normalizeRadar(input) {
  const r=parse(input);
  if(!Array.isArray(r.topics)||!r.topics.length||r.topics.length>20)throw Error('请配置 1–20 个研究主题。');
  const out={version:1,defaultTopic:r.defaultTopic||r.topics[0].id,lookbackYears:r.lookbackYears??5,defaultView:r.defaultView||'latest',topics:[]};
  if(r.version!==1)throw Error('不支持的主题配置版本。');
  for(const t of r.topics){
    if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(t.id||''))throw Error('主题 ID 只能包含小写字母、数字、下划线和短横线。');
    if(typeof t.label!=='string'||!t.label.trim()||t.label.length>100)throw Error('主题名称为空或过长。');
    if(!Array.isArray(t.sources)||t.sources.length<1||t.sources.length>32)throw Error('每个主题需要 1–32 个来源。');
    const filters=(t.keywordFilters||[]).map(f=>f.sourceId?{label:String(f.label),sourceId:String(f.sourceId)}:{label:String(f.label),pattern:pattern(f.pattern),...(f.field==='source'?{field:'source'}:{})});
    const topic={id:t.id,label:t.label.trim(),description:filters.map(f=>f.label).join('、'),keywordFilters:filters,sources:[]};
    for(const x of t.sources){
      if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(x.id||''))throw Error('来源 ID 格式错误。');
      if(typeof x.name!=='string'||!x.name.trim()||x.name.length>180)throw Error('来源名称为空或过长。');
      const s={id:x.id,name:x.name,kind:x.kind||'journal'};
      if(x.shortName)s.shortName=String(x.shortName).slice(0,50);
      if(x.provider)s.provider=x.provider;
      if(x.provider==='pubmed'){
        if(typeof x.query!=='string'||!x.query.trim()||x.query.length>12000)throw Error('请输入有效 PubMed 检索式。');
        s.query=x.query;s.url='https://pubmed.ncbi.nlm.nih.gov/?'+new URLSearchParams({term:x.query,rr:`${t.id}:${x.id}`});
      }else if(x.provider==='crossref'){
        s.issn=x.issn;s.crossrefQuery=String(x.crossrefQuery||'');
        s.url=`https://api.crossref.org/journals/${s.issn}/works?`+new URLSearchParams({query:s.crossrefQuery,rr:`${t.id}:${x.id}`});
      }else if(x.provider==='aggregate'||x.provider==='seed'){
        s.url='https://pubmed.ncbi.nlm.nih.gov/?'+new URLSearchParams({term:t.label,rr:`${t.id}:${x.id}`});
        if(x.provider==='aggregate'){s.journalIds=clone(x.journalIds||[]);if(x.rankMode==='project')s.rankMode='project';}
        else {
          if(x.seeds){
            if(!Array.isArray(x.seeds)||!x.seeds.length||x.seeds.length>30)throw Error('种子需为 1–30 篇。');
            s.seeds=x.seeds.map((v,i)=>{if(!/^\d{1,12}$/.test(String(v.pmid||''))||!/^10\.\d{4,9}\/\S+$/i.test(v.doi||''))throw Error('种子需要已核对的 DOI 和 PMID。');return {pmid:String(v.pmid),doi:v.doi,title:String(v.title||''),referenceId:String(v.referenceId||`seed-${i+1}`)};});
          }else{s.seedPath=pathInVault(x.seedPath);if(!s.seedPath.endsWith('.json'))throw Error('种子清单必须为 JSON。');}
        }
      }else{s.url=x.url;}
      s.signals=(x.signals||[]).map(v=>({pattern:pattern(v.pattern),weight:integer(v.weight,1,100,'相关性权重')}));
      if(x.coverageNote)s.coverageNote=String(x.coverageNote).slice(0,1000);
      topic.sources.push(s);
    }
    out.topics.push(topic);
  }
  if(!out.topics.some(t=>t.id===out.defaultTopic))throw Error('默认主题不存在。');
  validateConfig(out);return out;
}
function normalizeSettings(input){
  const s=parse(input);
  if(s.schemaVersion!==1)throw Error('不支持的设置版本。');
  const endpoint=new URL(s.translation?.endpoint||DEFAULT_SETTINGS.translation.endpoint);
  if(!['http:','https:'].includes(endpoint.protocol)||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error('本地翻译地址须为 loopback HTTP(S) 服务地址。');
  const model=String(s.translation?.model||'').trim();
  if(!model||model.length>200)throw Error('请填写本地翻译模型名称。');
  const tr={...DEFAULT_SETTINGS.translation,...s.translation};
  if(!Object.hasOwn(LABELS,tr.provider))throw Error('不支持的翻译服务。');
  if(!['free','pro'].includes(tr.deeplPlan))throw Error('DeepL 方案需选择 free 或 pro。');
  const api=new URL(tr.apiEndpoint);
  if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||['localhost','127.0.0.1','[::1]'].includes(api.hostname))throw Error('自定义在线 API 必须为无密钥、无查询参数的 HTTPS 基础地址。');
  for(const k of ['deeplSecretRef','deepseekSecretRef','apiSecretRef','microsoftSecretRef',...Object.keys(AI).map(id=>id+'SecretRef')])if(typeof tr[k]!=='string'||tr[k].length>200||/[\x00-\x1f]/.test(tr[k]))throw Error('密钥引用名称无效。');
  for(const k of ['deepseekModel','apiModel',...Object.keys(AI).map(id=>id+'Model')])if(typeof tr[k]!=='string'||tr[k].length>200)throw Error('在线模型名称无效。');
  if(typeof tr.microsoftRegion!=='string'||!/^([a-z0-9-]{1,60})?$/.test(tr.microsoftRegion))throw Error('微软翻译区域需为服务控制台区域代号或留空。');
  if(!['global','cn'].includes(tr.bingRegion)||!['cn','intl'].includes(tr.qwenRegion))throw Error('翻译服务区域无效。');
  if(tr.provider==='compatible'&&!tr.apiModel.trim())throw Error('请填写自定义在线模型名称。');
  if(tr.provider==='deepseek'&&!tr.deepseekModel.trim())throw Error('请填写 DeepSeek 模型名称。');
  return {schemaVersion:1,radar:normalizeRadar(s.radar),handoff:normalizeHandoff(s.handoff), latestLimit:integer(s.latestLimit??20,1,100,'最新篇数'),historyLimit:integer(s.historyLimit??100,1,100,'历史篇数'),autoRefresh:s.autoRefresh===true,
    translation:{...Object.fromEntries(Object.keys(AI_DEFAULTS).map(k=>[k,k.endsWith('Model')?tr[k].trim():tr[k]])),microsoftSecretRef:tr.microsoftSecretRef,microsoftRegion:tr.microsoftRegion,bingRegion:tr.bingRegion,qwenRegion:tr.qwenRegion,enabled:tr.enabled===true,provider:tr.provider,allowOnline:tr.allowOnline===true,endpoint:endpoint.origin,model,deeplPlan:tr.deeplPlan,deeplSecretRef:tr.deeplSecretRef,deepseekModel:tr.deepseekModel.trim(),deepseekSecretRef:tr.deepseekSecretRef,apiEndpoint:api.href.replace(/\/$/,''),apiModel:tr.apiModel.trim(),apiSecretRef:tr.apiSecretRef},zotero:{enabled:s.zotero?.enabled===true,port:integer(s.zotero?.port??23119,1024,65535,'Zotero 端口')},inboxFolder:pathInVault(s.inboxFolder||DEFAULT_SETTINGS.inboxFolder)};
}
function profile(settings){return {format:'research-radar-profile',version:1,radar:normalizeRadar(settings.radar),latestLimit:settings.latestLimit,historyLimit:settings.historyLimit};}
function mergeProfile(input,current){const p=parse(input);if(p.format!=='research-radar-profile'||p.version!==1)throw Error('需要 Research Radar v1 主题方案。');return normalizeSettings({...clone(current),radar:p.radar,latestLimit:p.latestLimit??current.latestLimit,historyLimit:p.historyLimit??current.historyLimit});}
function describeChange(a,b){return {before:{topics:a.radar.topics.map(t=>t.label),sources:a.radar.topics.reduce((n,t)=>n+t.sources.length,0)},after:{topics:b.radar.topics.map(t=>t.label),sources:b.radar.topics.reduce((n,t)=>n+t.sources.length,0)},latestLimit:b.latestLimit,historyLimit:b.historyLimit};}
module.exports={DEFAULT_SETTINGS,DEFAULT_RADAR,normalizeSettings,normalizeRadar,mergeProfile,profile,describeChange,pathInVault,clone,digest,parse};
