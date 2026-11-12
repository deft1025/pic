// State and playback regression tests; no browser or third-party packages required.
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const book = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/books/moon-rabbit.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8').replace(/render\(\);\s*$/, '') + '\nglobalThis.flow={loadStore,booksByIDs,reader,home,catalogPage,shelf,policyPage,render,get local(){return local},set local(x){local=x},setMeta(x){meta=x}};';

class Element {
 constructor() { this.hidden=false; this.checked=false; this.value=''; this.dataset={}; this.events={}; this.attributes={}; this.style={setProperty:(k,v)=>{this.style[k]=v;}}; this.classes=new Set(); this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x),toggle:(x,on)=>{on=on===undefined?!this.classes.has(x):on; on?this.classes.add(x):this.classes.delete(x);return on;}}; }
 setAttribute(k,v) { this.attributes[k]=v; }
 removeAttribute(k) { delete this.attributes[k]; }
 addEventListener(k,fn) { this.events[k]=fn; }
 scrollIntoView() {}
}
function setup(saved, fetcher, speechVoices) {
 const elements=new Map(),listeners=new Map(),audioInstances=[],requests=[];
 const element = selector => {if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector);};
 const document={querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),body:new Element()};
 const storage=new Map(saved===undefined?[]:[['pic-library-v1',typeof saved==='string'?saved:JSON.stringify(saved)]]);
 let address=new URL('http://pic.local/read/moon-rabbit');
 const location={get pathname(){return address.pathname},get search(){return address.search},get href(){return address.href},get origin(){return address.origin}};
 class Audio {
  constructor(){this.src='';this.currentTime=0;this.paused=true;audioInstances.push(this);}
  pause(){this.paused=true;} load(){} removeAttribute(){this.src='';this.currentTime=0;}
  async play(){this.paused=false;this.onplaying?.();}
  end(){this.paused=true;this.onended?.();}
 }
 const context={document,location,window:{scrollTo(){} ,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Audio,Image:class{},URL,URLSearchParams,CSS:{escape:x=>x},console,setTimeout:()=>1,clearTimeout(){},fetch:async endpoint=>{
  requests.push(endpoint);
  let data;
  if(fetcher) data=await fetcher(new URL(endpoint,address));
  else if(endpoint.endsWith('/pages'))data={items:book.pages.map(p=>({...p,audio_zh:`/assets/test/zh-${p.page_number}.mp3`,audio_original:`/assets/test/en-${p.page_number}.mp3`}))};
  else if(endpoint==='/api/books/moon-rabbit')data=structuredClone(book);
  else data={items:[],total:0};
  return {ok:true,json:async()=>data};
 }};
 let speech;
 if(speechVoices){
  const events=new Map();
  speech={voices:speechVoices,utterances:[],paused:false,getVoices(){return this.voices;},speak(u){this.utterances.push(u);this.paused=false;},cancel(){this.paused=false;},pause(){this.paused=true;},resume(){this.paused=false;},addEventListener(k,fn){events.set(k,fn);},removeEventListener(k,fn){if(events.get(k)===fn)events.delete(k);},changeVoices(voices){this.voices=voices;events.get('voiceschanged')?.();},get listeners(){return events.size;}};
  context.window.speechSynthesis=speech;
  context.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 }
 vm.createContext(context);vm.runInContext(source,context);
 const flow=context.flow;
 flow.setMeta({ages:[{id:'0-2',name:'0–2 岁'}],categories:[{id:'animals',name:'动物朋友'}],languages:[{id:'zh',name:'中文'},{id:'en',name:'英文'}]});
 const click=(action,value)=>{const target={closest(selector){if(selector==='[data-reader]'&&action==='reader')return {dataset:{reader:value}};if(selector==='[data-page]'&&action==='page')return {dataset:{page:String(value)}};if(selector==='[data-lang]'&&action==='lang')return {dataset:{lang:value}};return null;}};for(const fn of listeners.get('click')||[])fn({target,preventDefault(){}});};
 return {flow,element,click,audioInstances,requests,storage,speech,go:href=>address=new URL(href,address),start:async()=>{const reader=await flow.reader('moon-rabbit',0);reader.initialize();return reader;}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('reader keeps the first image frame ratio when following pages use different sizes',async()=>{
 const h=setup(),r=await h.start(),img=h.element('.reader-image'),stage=h.element('.reader-stage');
 img.naturalWidth=1600;img.naturalHeight=800;img.events.load();
 assert.equal(stage.style['--reader-ratio'],'1600 / 800');
 h.click('reader','next');img.naturalWidth=800;img.naturalHeight=1200;img.events.load();
 assert.equal(stage.style['--reader-ratio'],'1600 / 800');
 r.dispose();
});

test('invalid local records do not break the shelf; valid settings survive',()=>{
 const h=setup({favorites:['moon-rabbit',null,'moon-rabbit',7],progress:{bad:null,wrong:{page:-1},good:{page:2,updated_at:'2026-11-04',completed:true}},preferences:{volume:0,rate:1.25,rateVersion:2,language:'en',auto:false,night:true}});
 assert.deepEqual(Array.from(h.flow.local.favorites),['moon-rabbit']);
 assert.deepEqual(Object.keys(h.flow.local.progress),['good']);
 assert.equal(h.flow.local.preferences.volume,0);
 assert.equal(h.flow.local.preferences.auto,false);
 assert.equal(h.flow.local.preferences.rate,1.25);
 assert.equal(h.flow.local.preferences.showText,true);
 assert.equal(setup('null').flow.local.favorites.length,0);
 assert.equal(setup('{broken').flow.local.favorites.length,0);
});

test('more than 100 saved books are fetched in bounded batches and keep local order',async()=>{
 const ids=Array.from({length:125},(_,i)=>'book-'+i);
 const h=setup(undefined,url=>{const batch=url.searchParams.get('ids').split(',');assert.ok(batch.length<=40);return {items:batch.filter(id=>id!=='book-5').reverse().map(id=>({id})),total:batch.length};});
 const books=await h.flow.booksByIDs(ids);
 assert.equal(books.length,124);assert.equal(h.requests.length,4);
 assert.deepEqual(Array.from(books,b=>b.id),ids.filter(id=>id!=='book-5'));
});

test('shelf pagination keeps the history tab and reaches books beyond 100',async()=>{
 const progress=Object.fromEntries(Array.from({length:125},(_,i)=>['book-'+i,{page:1,updated_at:String(i).padStart(3,'0')}]));
 const h=setup({progress},url=>({items:url.searchParams.get('ids').split(',').map(id=>({...book,id})),total:40}));
 h.go('/shelf?tab=history&offset=120');
 const html=await h.flow.shelf();
 assert.equal((html.match(/class="book-card"/g)||[]).length,5);
 assert.match(html,/第 9 \/ 9 页/);
 assert.match(html,/最近读过 · 125/);
 assert.match(html,/book-0/);
});

test('home continues an unfinished published story and empty search offers recommendations',async()=>{
 const h=setup({progress:{'moon-rabbit':{page:2,updated_at:'2026-11-04'}}},url=>{
  if(url.searchParams.get('q'))return {items:[],total:0};
  return {items:[structuredClone(book)],total:1};
 });
 h.go('/');const home=await h.flow.home();assert.match(home,/aria-label="继续上次阅读"/);assert.match(home,/上次读到第 3 页/);
 h.go('/books?q=不存在');const catalog=await h.flow.catalogPage();assert.match(catalog,/这个故事，还在路上/);assert.match(catalog,/也许会喜欢这些故事/);assert.match(catalog,/suggested-themes/);
});

test('stale catalog offset recovers to the last available page',async()=>{
 const h=setup(undefined,url=>({items:Number(url.searchParams.get('offset'))>=20?[]:[book],total:20}));
 h.go('/books?offset=90');const html=await h.flow.catalogPage();
 assert.match(h.requests[1],/offset=15/);assert.match(html,/第 2 \/ 2 页/);assert.doesNotMatch(html,/这个故事，还在路上/);
});

test('pause preserves playback position; turning away and back restarts the page',async()=>{
 const h=setup(),r=await h.start(),audio=h.audioInstances[0];
 h.click('reader','play');await settle();audio.currentTime=8;
 h.click('reader','play');assert.equal(audio.currentTime,8);assert.equal(audio.paused,true);
 h.click('reader','play');await settle();assert.equal(audio.currentTime,8);
 const staleEnd=audio.onended;
 h.click('reader','next');assert.equal(audio.currentTime,0);assert.equal(audio.paused,true);
 staleEnd();assert.match(h.element('#page-number').textContent,/第 2 页/,'obsolete audio callback must not turn the new page');
 h.click('reader','prev');h.click('reader','play');await settle();assert.equal(audio.currentTime,0);
 r.dispose();assert.equal(audio.paused,true);
});

test('audio end holds the page with auto off, then replay starts at the beginning',async()=>{
 const h=setup({preferences:{auto:false}}),r=await h.start(),audio=h.audioInstances[0];
 h.click('reader','play');await settle();audio.currentTime=12;audio.end();await settle();
 assert.match(h.element('#page-number').textContent,/第 1 页/);assert.equal(audio.currentTime,0);
 h.click('reader','play');await settle();assert.equal(audio.paused,false);assert.equal(audio.currentTime,0);
 r.dispose();
});

test('manual completion works without playing audio and restart clears completion',async()=>{
 const h=setup(),r=await h.start();
 assert.equal(h.element('[data-reader=finish]').hidden,true);
 h.click('page',book.pages.length-1);assert.equal(h.element('[data-reader=finish]').hidden,false);
 h.click('reader','finish');assert.equal(h.flow.local.progress[book.id].completed,true);assert.equal(h.element('.reader-finished').hidden,false);
 h.click('reader','restart');assert.equal(h.flow.local.progress[book.id].completed,false);assert.match(h.element('#page-number').textContent,/第 1 页/);
 r.dispose();
});

test('language, night mode, text, auto turn, rate and volume restore on the next visit',async()=>{
 const h=setup();let r=await h.start();
 h.click('lang','en');h.click('reader','night');h.click('reader','text');
 h.element('#reader-auto').onchange({target:{checked:false}});
 h.element('#reader-volume').oninput({target:{value:'0.3'}});
 h.element('#reader-rate').onchange({target:{value:'1.25'}});
 r.dispose();r=await h.start();
 assert.equal(h.element('.reader-text').hidden,true);assert.equal(h.element('#reader-show-text').checked,false);assert.equal(h.element('#reader-auto').checked,false);
 assert.equal(h.element('#reader-volume').value,'0.3');assert.equal(h.element('#reader-rate').value,'1.25');assert.equal(h.element('.reader-page').classList.contains('reader-night'),true);
 h.click('reader','play');await settle();assert.match(h.audioInstances.at(-1).src,/en-1/);
 r.dispose();
});

test('start from beginning bypasses saved progress; English-only book picks English',async()=>{
 const h=setup({progress:{'moon-rabbit':{page:3}}},url=>url.pathname.endsWith('/pages')?{items:book.pages}:({...book,languages:['en']}));
 h.go('/read/moon-rabbit?start=1');const r=await h.start();assert.match(h.element('#page-number').textContent,/第 1 页/);assert.equal(h.element('.reader-text').textContent,book.pages[0].text_original);r.dispose();
});

test('a failed image exposes retry without blocking manual page turns',async()=>{
 const h=setup(),r=await h.start(),img=h.element('.reader-image');
 img.events.error();assert.equal(h.element('.reader-image-error').hidden,false);
 h.click('reader','image-retry');assert.equal(h.element('.reader-image-error').hidden,true);assert.equal(new URL(img.src,'http://pic.local').pathname,book.pages[0].image);assert.equal(new URL(img.src,'http://pic.local').searchParams.get('v'),book.content_version);
 img.events.error();h.click('reader','next');assert.match(h.element('#page-number').textContent,/第 2 页/);assert.equal(h.element('.reader-image-error').hidden,true);
 r.dispose();
});

test('empty page data produces a recoverable error before creating audio',async()=>{
 const h=setup(undefined,url=>url.pathname.endsWith('/pages')?{items:[]}:book);
 await assert.rejects(h.start(),/页面还没有准备好/);assert.equal(h.audioInstances.length,0);
});

test('privacy and copyright pages remain available during a database outage',async()=>{
 const h=setup(undefined,()=>{throw Error('database unavailable');});
 h.flow.setMeta({ages:[],categories:[]});
 h.go('/privacy');await h.flow.render();
 assert.match(h.element('#app').innerHTML,/让阅读，简单而安心/);
 h.go('/copyright');await h.flow.render();
 assert.match(h.element('#app').innerHTML,/每一个故事，都有自己的来处/);
 assert.equal(h.requests.length,0);
});

const deviceVoices=[
 {voiceURI:'zh-one',name:'中文声音一',lang:'zh-CN'},
 {voiceURI:'zh-two',name:'中文声音二',lang:'zh-CN'},
 {voiceURI:'en-one',name:'English voice',lang:'en-US'}
];
const withoutAudio=url=>url.pathname.endsWith('/pages')?{items:book.pages.map(({audio_zh,audio_original,...page})=>page)}:{...structuredClone(book),voices:{}};

test('approved narration plays at 1x; old speed settings reset once and new choices persist',async()=>{
 assert.equal(setup().flow.local.preferences.rate,1);
 assert.equal(setup({preferences:{rate:1}}).flow.local.preferences.rate,1);
 assert.equal(setup({preferences:{rate:0.75,rateVersion:1}}).flow.local.preferences.rate,1);
 assert.equal(setup({preferences:{rate:0.5,rateVersion:2}}).flow.local.preferences.rate,0.5);
 const h=setup({preferences:{rate:0.75,rateVersion:1}}),r=await h.start();
 h.click('reader','play');await settle();
 assert.equal(h.audioInstances[0].playbackRate,1,'pre-generated slow narration must not be slowed again');
 assert.equal(h.audioInstances[0].preservesPitch,true);
 h.element('#reader-rate').onchange({target:{value:'0.75'}});
 assert.equal(setup(h.storage.get('pic-library-v1')).flow.local.preferences.rate,0.75);
 h.element('#reader-rate').onchange({target:{value:'0.5'}});
 h.click('reader','play');
 h.click('reader','play');await settle();assert.equal(h.audioInstances[0].playbackRate,0.5);
 r.dispose();
});

test('device voices filter by language, switch during reading and persist per language',async()=>{
 const h=setup(undefined,withoutAudio,deviceVoices);let r=await h.start();
 assert.match(h.element('#reader-voice').innerHTML,/中文声音二/);
 assert.doesNotMatch(h.element('#reader-voice').innerHTML,/English voice/);
 h.click('reader','play');assert.equal(h.speech.utterances.at(-1).rate,0.8);
 const stale=h.speech.utterances.at(-1).onend;
 h.element('#reader-voice').onchange({target:{value:'zh-two'}});
 assert.equal(h.speech.utterances.at(-1).voice.voiceURI,'zh-two');
 stale();assert.match(h.element('#page-number').textContent,/第 1 页/);
 h.click('lang','en');assert.doesNotMatch(h.element('#reader-voice').innerHTML,/中文声音二/);
 h.element('#reader-voice').onchange({target:{value:'en-one'}});
 h.click('reader','play');assert.equal(h.speech.utterances.at(-1).voice.voiceURI,'en-one');
 h.click('lang','zh');assert.equal(h.element('#reader-voice').value,'zh-two');
 r.dispose();r=await h.start();assert.equal(h.element('#reader-voice').value,'zh-two');
 assert.equal(setup(h.storage.get('pic-library-v1')).flow.local.preferences.voices.en,'en-one');
 r.dispose();assert.equal(h.speech.listeners,0);
});

test('changing paused device speech updates settings without starting playback',async()=>{
 const h=setup(undefined,withoutAudio,deviceVoices),r=await h.start();
 h.click('reader','play');h.click('reader','play');
 h.element('#reader-voice').onchange({target:{value:'zh-two'}});
 assert.equal(h.speech.utterances.length,1);
 h.element('#reader-rate').onchange({target:{value:'0.5'}});
 h.click('reader','play');
 assert.equal(h.speech.utterances.at(-1).voice.voiceURI,'zh-two');
 assert.equal(h.speech.utterances.at(-1).rate,0.4);
 h.click('reader','play');
 h.element('#reader-rate').onchange({target:{value:'0.65'}});
 h.click('reader','play');assert.ok(Math.abs(h.speech.utterances.at(-1).rate-0.52)<1e-9);
 r.dispose();
});

test('late device voices restore a saved choice; missing voices fall back within the language',async()=>{
 const h=setup({preferences:{voices:{zh:'zh-two'}}},withoutAudio,[]),r=await h.start();
 assert.equal(h.element('#reader-voice').disabled,true);
 h.speech.changeVoices(deviceVoices);assert.equal(h.element('#reader-voice').value,'zh-two');
 assert.equal(h.element('#reader-voice').disabled,false);
 h.speech.changeVoices([deviceVoices[0],deviceVoices[2]]);
 assert.equal(h.element('#reader-voice').value,'');
 h.click('reader','play');assert.equal(h.speech.utterances.at(-1).voice.voiceURI,'zh-one');
 r.dispose();h.speech.changeVoices([]);assert.equal(h.speech.listeners,0);
});

test('recorded audio keeps its voice and has no available device voice control',async()=>{
 const h=setup(undefined,undefined,deviceVoices),r=await h.start();
 assert.equal(h.element('#reader-voice').disabled,true);
 assert.match(h.element('#reader-voice').innerHTML,/故事原配音/);
 h.element('#reader-voice').onchange({target:{value:'zh-two'}});
 assert.equal(h.flow.local.preferences.voices.zh,'');
 h.click('reader','play');await settle();assert.equal(h.speech.utterances.length,0);
 r.dispose();
});

test('every published replacement story reaches its actual final page in both languages',async()=>{
 const stories=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/library.json'),'utf8')).books.filter(item=>item.publish_status==='published');
 for(const story of stories){
  const h=setup(undefined,url=>url.pathname.endsWith('/pages')?{items:story.pages}:story);
  h.go(`/read/${story.id}`);
  const r=await h.flow.reader(story.id,0);r.initialize();
  for(let i=0;i<story.pages.length;i++){
   if(i)h.click('reader','next');
   assert.match(h.element('#page-number').textContent,new RegExp(`第 ${i+1} 页`),story.id);
   assert.equal(new URL(h.element('.reader-image').src,'http://pic.local').pathname,story.pages[i].image);
   h.click('lang','zh');assert.equal(h.element('.reader-text').textContent,story.pages[i].text_zh);
   h.click('lang','en');assert.equal(h.element('.reader-text').textContent,story.pages[i].text_original);
  }
  h.click('reader','finish');assert.equal(h.flow.local.progress[story.id].completed,true);
  r.dispose();
 }
});
