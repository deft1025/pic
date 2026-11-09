// DOM integration checks for real app.js with deterministic audio events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseHTML} = require(process.env.PIC_DOM_MODULE || 'linkedom');
const root=path.resolve(__dirname,'..');
const stories=fs.readdirSync(path.join(root,'tests/fixtures/books')).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/books',x),'utf8')));
const b=stories.find(b=>b.id==='moon-rabbit');
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
(async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div><div id="toast" hidden></div></body></html>');
 let url=new URL('http://pic.local/read/moon-rabbit');
 const location={get pathname(){return url.pathname},get search(){return url.search},get href(){return url.href},get origin(){return url.origin}};
 const storage=new Map();
 const audioInstances=[];
 class MockAudio{
  constructor(){this.src='';this.paused=true;this.currentTime=0;audioInstances.push(this);}
  pause(){this.paused=true;} load(){} removeAttribute(){this.src='';this.currentTime=0;} async play(){this.paused=false;this.onplaying?.();} end(){this.paused=true;this.onended?.();} fail(){this.onerror?.();}
 }
 const categoryIDs=['animals','habits','emotions','bedtime','nature','cognition'];
 const categoryNames=['动物朋友','生活习惯','情绪表达','睡前故事','自然探索','认知启蒙'];
 async function fetchMock(endpoint){
  const request=new URL(endpoint,url);let data;
  if(request.pathname==='/api/categories')data={ages:[{id:'0-2',name:'0–2 岁'},{id:'3-4',name:'3–4 岁'},{id:'5-6',name:'5–6 岁'}],categories:categoryIDs.map((id,i)=>({id,name:categoryNames[i]})),languages:[{id:'zh',name:'中文'},{id:'en',name:'英文'}]};
  else if(request.pathname==='/api/books/moon-rabbit/pages')data={items:b.pages.map(p=>({...p,audio_zh:`/assets/test/zh-${p.page_number}.mp3`,audio_original:`/assets/test/en-${p.page_number}.mp3`}))};
  else if(request.pathname==='/api/books/moon-rabbit')data=b;
  else if(request.pathname==='/api/books')data={items:stories,total:stories.length};
  else throw Error('unexpected endpoint '+endpoint);
  return {ok:true,json:async()=>structuredClone(data)};
 }
 window.scrollTo=()=>{};window.confirm=()=>true;
 const context={window,document,location,history:{pushState(_a,_b,href){url=new URL(href,url)},replaceState(_a,_b,href){url=new URL(href,url)}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:fetchMock,Audio:MockAudio,Image:class{},URL,URLSearchParams,CSS:{escape:x=>x},console,setTimeout,clearTimeout,FormData:global.FormData};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'web/app.js'),'utf8')+'\nglobalThis.testApi={navigate,render,local};',context);
 const $=s=>document.querySelector(s);const click=s=>{const el=$(s);assert.ok(el,'element exists '+s);el.dispatchEvent(new window.Event('click',{bubbles:true}));};
 await tick();assert.match($('#page-number').textContent,/第 1 页/);
 click('[data-reader=play]');await tick();let audio=audioInstances.at(-1);assert.equal(audio.paused,false);assert.equal(new URL(audio.src,'http://pic.local').pathname,'/assets/test/zh-1.mp3');
 click('[data-reader=play]');assert.equal(audio.paused,true);click('[data-reader=play]');await tick();assert.equal(audio.paused,false);
 audio.currentTime=8;click('[data-reader=next]');assert.equal(audio.currentTime,0,'turn resets audio position');assert.equal(audio.paused,true,'manual turn stops previous audio');assert.match($('#page-number').textContent,/第 2 页/);
 click('[data-reader=play]');await tick();click('[data-lang=en]');assert.equal(audio.paused,true,'switching language stops audio');assert.match($('.reader-text').textContent,/bird/i);
 click('[data-reader=play]');await tick();assert.equal(new URL(audio.src,'http://pic.local').pathname,'/assets/test/en-2.mp3');audio.end();await tick();assert.match($('#page-number').textContent,/第 3 页/);assert.equal(new URL(audio.src,'http://pic.local').pathname,'/assets/test/en-3.mp3');assert.equal(audio.paused,false,'auto turn resumes on next page');
 $('#reader-auto').checked=false;$('#reader-auto').onchange({target:$('#reader-auto')});audio.end();await tick();assert.match($('#page-number').textContent,/第 3 页/,'turning auto off holds page');
 click('[data-reader=play]');await tick();audio.fail();assert.match($('.reader-audio-status').textContent,/加载失败/);assert.ok($('[data-reader=retry]'));
 click('[data-reader=next]');assert.match($('#page-number').textContent,/第 4 页/,'audio errors do not block manual reading');
 click('[data-reader=text]');assert.equal($('.reader-text').hidden,true);click('[data-reader=text]');assert.equal($('.reader-text').hidden,false);
 click('[data-page="5"]');click('[data-reader=play]');await tick();audio.end();await tick();assert.equal($('.reader-finished').hidden,false);assert.equal(context.testApi.local.progress[b.id].completed,true);
 click('[data-reader=restart]');assert.match($('#page-number').textContent,/第 1 页/);
 click('[data-page="5"]');click('[data-reader=finish]');assert.equal(context.testApi.local.progress[b.id].completed,true,'silent reading can complete');click('[data-reader=restart]');
 click('[data-reader=next]');click('[data-reader=next]');
 context.testApi.navigate('/book/moon-rabbit');await tick();assert.ok($('.detail-layout'));assert.equal(audio.paused,true,'leaving reader stops audio');
 context.testApi.navigate('/read/moon-rabbit');await tick();assert.match($('#page-number').textContent,/第 3 页/,'progress restores');
 context.testApi.navigate('/book/moon-rabbit');await tick();click('[data-save]');assert.equal(context.testApi.local.favorites.includes(b.id),true);assert.match(storage.get('pic-library-v1'),/moon-rabbit/);
 context.testApi.navigate('/');await tick();assert.ok($('.hero'));assert.ok($('.continue-reading'));assert.equal(document.querySelectorAll('.theme-card').length,6);
 context.testApi.navigate('/books');await tick();assert.equal(document.querySelectorAll('.book-card').length,10);
 console.log('PASS: audio play/pause, old audio cancellation, language switch, automatic turn on/off, audio failure, text toggle, completion, restart, progress restore, favorites, home and catalog rendering.');
 // Stop pending toast timers so the suite exits immediately.
 vm.runInContext('clearTimeout(toastTimer)',context);
})().catch(e=>{console.error(e);process.exitCode=1});
