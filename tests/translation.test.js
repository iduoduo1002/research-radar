const {test}=require('node:test'),assert=require('node:assert/strict');
const t=require('../src/translation'),c=require('../src/config');
function config(provider,extra={}){return {...c.DEFAULT_SETTINGS.translation,provider,allowOnline:true,...extra};}
test('old local settings migrate without remote consent; profile excludes online settings',()=>{
 const old={...c.clone(c.DEFAULT_SETTINGS),translation:{enabled:true,model:'hy-mt2:latest',endpoint:'http://127.0.0.1:11434'}};
 const next=c.normalizeSettings(old);assert.equal(next.translation.provider,'ollama');assert.equal(next.translation.allowOnline,false);
 next.translation.deeplSecretRef='my-key-reference';assert.ok(!JSON.stringify(c.profile(next)).includes('my-key-reference'));
 for(const endpoint of ['http://unsafe.example/v1','https://user:password@api.example/v1','https://api.example/v1?key=secret'])assert.throws(()=>c.normalizeSettings({...next,translation:{...next.translation,apiEndpoint:endpoint}}));
 assert.throws(()=>c.normalizeSettings({...next,translation:{...next.translation,provider:'unknown'}}));
});
test('online consent and missing key reject before any request',async()=>{
 let count=0;const request=async()=>{count++;throw Error('not reached');};
 await assert.rejects(t.translateOnline(config('google',{allowOnline:false}),'title','abstract',{request}),/未授权/);
 await assert.rejects(t.checkOnline(config('google',{allowOnline:false}),{request}),/未授权/);
 await assert.rejects(t.translateOnline(config('deepl'),'title','abstract',{request}),/API Key/);
 assert.equal(count,0);
});
test('Google splits long source without dropping characters, preserves empty abstract; refuses incomplete responses',async()=>{
 const text=('A scientific sentence. ').repeat(150)+'😀';assert.equal(t.splitText(text).join(''),text);assert.ok(t.splitText(text).every(x=>Array.from(x).length<=1200));
 const calls=[],request=async o=>{calls.push(o);const q=new URL(o.url).searchParams.get('q');return {status:200,json:[[[q,q,null,null]]]};};
 const r=await t.translateOnline(config('google'),'title',text,{request,delay:async()=>{}});assert.equal(r.titleZh,'title');assert.equal(r.abstractZh.replace(/\n/g,''),text.trim());assert.ok(calls.length>2);assert.ok(calls.every(o=>!o.headers?.Authorization));
 calls.length=0;await t.translateOnline(config('google'),'title','',{request});assert.equal(calls.length,1);
 await assert.rejects(t.translateOnline(config('google'),'title','',{request:async()=>({status:200,json:[[]]})}),/不完整/);
});
test('DeepL uses official per-plan endpoint, key header, ordered title+abstract and rejects mismatched count',async()=>{
 let call;const opt={getSecret:async ref=>{assert.equal(ref,'deepl-reference');return 'FAKE_TEST_KEY';},request:async o=>{call=o;return {status:200,json:{translations:[{text:'标题'},{text:'摘要'}]}};}};
 const r=await t.translateOnline(config('deepl',{deeplSecretRef:'deepl-reference'}),'title','abstract',opt);
 assert.equal(r.abstractZh,'摘要');assert.equal(call.url,'https://api-free.deepl.com/v2/translate');assert.equal(call.headers.Authorization,'DeepL-Auth-Key FAKE_TEST_KEY');assert.deepEqual(JSON.parse(call.body).text,['title','abstract']);assert.ok(!call.body.includes('FAKE_TEST_KEY'));
 await assert.rejects(t.translateOnline(config('deepl',{deeplSecretRef:'ref'}),'title','abstract',{getSecret:async()=> 'fake',request:async()=>({status:200,json:{translations:[{text:'标题'}]}})}),/数量/);
});
test('chat-compatible services keep model and origin explicit, reject truncation and do not echo server errors',async()=>{
 let call;const base={getSecret:async()=> 'FAKE_SECRET',request:async o=>{call=o;return {status:200,json:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'标题',abstract:'摘要'})}}]}};}};
 const conf=config('compatible',{apiEndpoint:'https://example.org/v1',apiModel:'science-model',apiSecretRef:'ref'});
 await t.translateOnline(conf,'title','abstract',base);assert.equal(call.url,'https://example.org/v1/chat/completions');assert.equal(JSON.parse(call.body).model,'science-model');
 for(const finish of ['length','content_filter',undefined])await assert.rejects(t.translateOnline(conf,'title','abstract',{...base,request:async()=>({status:200,json:{choices:[{finish_reason:finish,message:{content:'{}'}}]}})}),/未完整/);
 for(const status of [301,401,429,456,500])await assert.rejects(t.translateOnline(conf,'title','abstract',{...base,request:async()=>({status,json:{error:'FAKE_SECRET'}})}),e=>e.message.includes(String(status))&&!e.message.includes('FAKE_SECRET'));
});
test('cache identity separates service, endpoint, model and plan; keys excluded',()=>{
 const a=config('compatible',{apiEndpoint:'https://a.example/v1',apiModel:'m'});
 assert.notEqual(t.identity(a),t.identity({...a,apiEndpoint:'https://b.example/v1'}));assert.notEqual(t.identity(a),t.identity({...a,apiModel:'n'}));assert.equal(t.identity(a),t.identity({...a,apiSecretRef:'different-reference'}));
 assert.notEqual(t.identity(config('deepl')),t.identity(config('deepl',{deeplPlan:'pro'})));assert.notEqual(t.identity(config('google')),t.identity(config('ollama')));
});
test('online diagnostics validate service-specific shape',async()=>{
 const c=config('deepl',{deeplSecretRef:'ref'});const opt={getSecret:async()=> 'fake',request:async()=>({status:200,json:{character_count:12,character_limit:500}})};assert.match((await t.checkOnline(c,opt)).message,/12 \/ 500/);
 await assert.rejects(t.checkOnline(c,{...opt,request:async()=>({status:200,json:{}})}),/额度/);
});

test('all added AI configs migrate, validate and remain outside shared profiles',()=>{
 for(const provider of Object.keys(t.AI)){
  const settings=c.normalizeSettings({...c.clone(c.DEFAULT_SETTINGS),translation:{...c.DEFAULT_SETTINGS.translation,provider,[provider+'SecretRef']:'private-reference'}});
  assert.equal(settings.translation.provider,provider);assert.equal(settings.translation[provider+'SecretRef'],'private-reference');assert.ok(!JSON.stringify(c.profile(settings)).includes('private-reference'));
  assert.throws(()=>c.normalizeSettings({...settings,translation:{...settings.translation,[provider+'SecretRef']:'bad\nreference'}}),/引用/);
  assert.notEqual(t.identity(settings.translation),t.identity({...settings.translation,[provider+'Model']:'another-model'}));
  assert.equal(t.identity(settings.translation),t.identity({...settings.translation,[provider+'SecretRef']:'other-ref'}));
 }
 assert.throws(()=>c.normalizeSettings({...c.clone(c.DEFAULT_SETTINGS),translation:{...c.DEFAULT_SETTINGS.translation,bingRegion:'malicious.example'}}),/区域/);
});

test('MyMemory chunks by UTF8 bytes, preserves input, decodes entities and stops on quota/missing output',async()=>{
 const inputs=[],text=('中文😀 scientific fragment ').repeat(80),request=async o=>{const q=new URL(o.url).searchParams.get('q');inputs.push(q);assert.ok(Buffer.byteLength(q)<=480);return {status:200,json:{responseStatus:200,responseData:{translatedText:q}}};};
 const result=await t.translateOnline(config('mymemory'),'title',text,{request,delay:async()=>{}});assert.equal(inputs.slice(1).join(''),text);assert.equal(result.abstractZh.replace(/\n/g,''),text.trim());
 assert.equal((await t.translateOnline(config('mymemory'),'title','',{request:async()=>({status:200,json:{responseStatus:200,responseData:{translatedText:'A &amp; B &#39;模型&#39;'}}})})).titleZh,"A & B '模型'");
 for(const json of [{responseStatus:200,quotaFinished:true},{responseStatus:429},{responseStatus:200,responseData:{}}])await assert.rejects(t.translateOnline(config('mymemory'),'title','',{request:async()=>({status:200,json})}),/额度|不完整/);
});

test('Bing public session is scoped to selected host, no global credentials and no retry on validation',async()=>{
 const calls=[];const request=async o=>{calls.push(o);return o.method==='POST'?{status:200,json:[{translations:[{to:'zh-Hans',text:'保留时间预测'}]}]}:{status:200,text:'IG:"EXAMPLE123"; params_AbusePreventionHelper = [123,"anonymous-session",10000]; <div data-iid="translator.5023">'};};
 const result=await t.translateOnline(config('bing',{bingRegion:'cn'}),'Retention time prediction','',{request,delay:async()=>{}});assert.equal(result.titleZh,'保留时间预测');assert.equal(calls.length,2);assert.ok(calls.every(o=>new URL(o.url).hostname==='cn.bing.com'));assert.equal(new URLSearchParams(calls[1].body).get('text'),'Retention time prediction');assert.ok(calls.every(o=>!o.headers?.Authorization));
 let requests=0;await assert.rejects(t.translateOnline(config('bing'),'x','',{request:async()=>{requests++;return {status:200,text:'Captcha'};}}),/验证/);assert.equal(requests,1);
 for(const response of [{status:401,json:{}},{status:200,text:''}])await assert.rejects(t.translateOnline(config('bing'),'x','',{request:async o=>o.method==='POST'?response:{status:200,text:'IG:"ABC";params_AbusePreventionHelper=[123,"test",10000]; data-iid="translator.5023"'}}),/会话|空响应/);
});

function aiResponse(protocol,stop=true){const text=JSON.stringify({titleZh:'保留时间',abstractZh:'47/50对异构体；仍需实验验证。'});return protocol==='responses'?{status:stop?'completed':'incomplete',output:[{type:'message',content:[{type:'output_text',text}]}]}:protocol==='gemini'?{candidates:[{finishReason:stop?'STOP':'MAX_TOKENS',content:{parts:[{text:'hidden reasoning',thought:true},{text}]}}]}:protocol==='claude'?{stop_reason:stop?'end_turn':'max_tokens',content:[{type:'text',text:'```json\n'+text+'\n```'}]}:{choices:[{finish_reason:stop?'stop':'length',message:{content:text}}]};}
test('native AI payloads, fixed origins, auth, clean JSON and refusal/truncation guards across all five providers',async()=>{
 for(const [provider,preset] of Object.entries(t.AI)){
  const conf=config(provider,{[provider+'Model']:'test-model',[provider+'SecretRef']:'reference'});let call,reads=0;
  const options={getSecret:async ref=>{reads++;assert.equal(ref,'reference');return 'FAKE_TEST_KEY';},request:async o=>{call=o;return {status:200,json:aiResponse(preset.protocol)};}};
  const result=await t.translateOnline(conf,'Title','Abstract',options);assert.match(result.abstractZh,/47\/50/);assert.equal(new URL(call.url).origin,new URL(preset.root).origin);assert.ok(!call.body.includes('FAKE_TEST_KEY'));const body=JSON.parse(call.body);
  if(preset.protocol==='responses'){assert.ok(call.url.endsWith('/responses'));assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');}
  if(preset.protocol==='gemini'){assert.ok(call.url.endsWith('/models/test-model:generateContent'));assert.equal(call.headers['x-goog-api-key'],'FAKE_TEST_KEY');assert.ok(!call.url.includes('FAKE_TEST_KEY'));assert.equal(body.generationConfig.responseMimeType,'application/json');}
  if(preset.protocol==='claude'){assert.equal(call.headers['x-api-key'],'FAKE_TEST_KEY');assert.equal(call.headers['anthropic-version'],'2023-06-01');assert.ok(body.max_tokens>1000);}
  if(provider==='qwen'){assert.equal(body.enable_thinking,false);await t.translateOnline({...conf,qwenRegion:'intl'},'Title','Abstract',options);assert.equal(new URL(call.url).hostname,'dashscope-intl.aliyuncs.com');}
  await assert.rejects(t.translateOnline(conf,'Title','Abstract',{...options,request:async()=>({status:200,json:aiResponse(preset.protocol,false)})}),/未完成|未完整|截断/);
  await assert.rejects(t.translateOnline({...conf,allowOnline:false},'Title','Abstract',options),/未授权/);
  const before=reads;await assert.rejects(t.translateOnline({...conf,[provider+'Model']:''},'Title','Abstract',options),/选择/);assert.equal(reads,before);
 }
});

test('AI diagnostics read model metadata only and bind model selection to current provider',async()=>{
 for(const [provider,preset] of Object.entries(t.AI)){
  const conf=config(provider,{[provider+'Model']:'test-model',[provider+'SecretRef']:'ref'});let call;
  const request=async o=>{call=o;return {status:200,json:preset.protocol==='chat'?{data:[{id:'test-model'}]}:{id:'test-model',name:'models/test-model'}};};
  assert.equal((await t.checkOnline(conf,{getSecret:async()=> 'FAKE',request})).matched,true);assert.ok(call.url.includes('/models'));assert.ok(!call.method||call.method==='GET');assert.equal(call.body,undefined);
  const list=await t.checkOnline({...conf,[provider+'Model']:''},{getSecret:async()=> 'FAKE',request:async()=>({status:200,json:preset.protocol==='gemini'?{models:[{name:'models/test-model',supportedGenerationMethods:['generateContent']},{name:'models/embedding',supportedGenerationMethods:['embedContent']}]}:{data:[{id:'test-model'}]}})});assert.deepEqual(list.models,['test-model']);
 }
});

test('Microsoft official API uses independent key and optional region, preserves ordering and refuses incomplete output',async()=>{
 let call;const conf=config('microsoft',{microsoftSecretRef:'microsoft-reference',microsoftRegion:'eastasia'});
 const opt={getSecret:async ref=>{assert.equal(ref,'microsoft-reference');return 'FAKE_MS_KEY';},request:async o=>{call=o;return {status:200,json:[{translations:[{to:'zh-Hans',text:'标题'}]},{translations:[{to:'zh-Hans',text:'摘要'}]}]};}};
 assert.equal((await t.translateOnline(conf,'Title','Abstract',opt)).abstractZh,'摘要');assert.equal(new URL(call.url).hostname,'api.cognitive.microsofttranslator.com');assert.equal(call.headers['Ocp-Apim-Subscription-Key'],'FAKE_MS_KEY');assert.equal(call.headers['Ocp-Apim-Subscription-Region'],'eastasia');assert.deepEqual(JSON.parse(call.body),[{Text:'Title'},{Text:'Abstract'}]);assert.ok(!call.url.includes('FAKE_MS_KEY'));
 const check=await t.checkOnline({...conf,microsoftRegion:''},{...opt,request:async o=>{call=o;return {status:200,json:[{translations:[{to:'zh-Hans',text:'连接测试'}]}]};}});assert.match(check.message,/少量字符/);assert.equal(call.headers['Ocp-Apim-Subscription-Region'],undefined);
 await assert.rejects(t.translateOnline(conf,'Title','Abstract',{...opt,request:async()=>({status:200,json:[{translations:[{to:'zh-Hans',text:'标题'}]}]})}),/数量/);
 await assert.rejects(t.translateOnline({...conf,microsoftSecretRef:''},'Title','',opt),/API Key/);
 assert.throws(()=>c.normalizeSettings({...c.clone(c.DEFAULT_SETTINGS),translation:{...conf,microsoftRegion:'bad\nregion'}}),/区域/);
 const normalized=c.normalizeSettings({...c.clone(c.DEFAULT_SETTINGS),translation:conf});assert.equal(normalized.translation.microsoftRegion,'eastasia');assert.ok(!JSON.stringify(c.profile(normalized)).includes('microsoft-reference'));
});
