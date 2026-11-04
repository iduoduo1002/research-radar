'use strict';
// Fixed official origins. Credentials are never inferred from another provider.
const AI={
 openai:{label:'OpenAI',root:'https://api.openai.com/v1',protocol:'responses',model:'gpt-6-luna'},
 gemini:{label:'Google Gemini',root:'https://generativelanguage.googleapis.com/v1beta',protocol:'gemini',model:'gemini-4-argon'},
 claude:{label:'Anthropic Claude',root:'https://api.anthropic.com/v1',protocol:'claude',model:'claude-haiku-5-5'},
 qwen:{label:'通义千问 · 阿里云百炼',root:'https://dashscope.aliyuncs.com/compatible-mode/v1',protocol:'chat',model:'qwen-plus'},
 glm:{label:'智谱 GLM',root:'https://open.bigmodel.cn/api/paas/v4',protocol:'chat',model:''}
};
const FREE=['google','bing','mymemory'];
const LABELS={ollama:'本地 Ollama',google:'Google 网页翻译 · 免密钥/实验性',bing:'Bing 网页翻译 · 免密钥/实验性',mymemory:'MyMemory · 免密钥/有限额度',microsoft:'微软 Translator 官方 API · F0免费额度/需密钥',deepl:'DeepL 官方 API · 需密钥',deepseek:'DeepSeek AI · 需密钥',...Object.fromEntries(Object.entries(AI).map(([id,p])=>[id,`${p.label} · AI API/需密钥`])),compatible:'自定义兼容 AI API'};
const AI_DEFAULTS=Object.fromEntries(Object.entries(AI).flatMap(([id,p])=>[[id+'Model',p.model],[id+'SecretRef','']]));
function model(c){return AI[c.provider]?c[c.provider+'Model']:c.provider==='deepseek'?c.deepseekModel:c.provider==='compatible'?c.apiModel:c.provider==='ollama'?c.model:'';}
module.exports={AI,FREE,LABELS,AI_DEFAULTS,model};
