// Browser geometry regression. Default: offline API fixture + generated test art.
// PIC_BASE_URL=http://127.0.0.1:8198 uses the real API/assets instead.
// PIC_ASSET_FALLBACK=https://asset-host/pic reads missing local art remotely.
// PIC_BROWSER=webkit|firefox; PIC_BROWSER_EXECUTABLE=/path/to/chrome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require(process.env.PIC_BROWSER_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const books = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/library.json'))).books;
const output = process.env.PIC_LAYOUT_OUTPUT;
const sizes = [[320,568],[375,667],[390,844],[430,932],[600,800],[601,800],[700,900],[701,900],[768,1024],[900,900],[901,900],[1024,600],[1366,768],[1920,1080],[2560,1440],[568,320],[844,390],[1024,500]];
const ids = ['bd-come-stay-with-me','bd-the-best-nest','bd-i-can-do-it','bd-grumpy-cloud','bd-a-beautiful-day','bd-a-house-for-mouse'];
let server, browser, checks=0;
function localServer() {
 return new Promise(resolve => {
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://localhost'), id=url.pathname.split('/')[3], book=books.find(b=>b.id===id);
   const json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
   if(url.pathname==='/api/categories')return json({ages:[],categories:[],languages:[]});
   if(url.pathname.endsWith('/pages')&&book)return json({items:book.pages,content_version:book.content_version});
   if(url.pathname.startsWith('/api/books/')&&book)return json({...book,page_count:book.pages.length});
   if(url.pathname==='/api/books')return json({items:books,total:books.length});
   if(url.pathname.startsWith('/assets/books/')){
    // This is only a layout fixture, not a substitute for actual art acceptance.
    if(/\.mp3$/.test(url.pathname)){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#edf5ff"/><circle cx="600" cy="400" r="160" fill="#ffce53"/></svg>');
   }
   const file=path.join(root,'web',url.pathname==='/'||!path.extname(url.pathname)?'index.html':url.pathname);
   if(!file.startsWith(path.join(root,'web')+path.sep)){res.writeHead(404);return res.end();}
   try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file));}
   catch{res.writeHead(404);res.end();}
  }).listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port));
 });
}
async function settle(p) { await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); }
async function verify(p,label) {
 const failures=await p.evaluate(()=>{
  const errors=[],$=s=>document.querySelector(s),rect=e=>e.getBoundingClientRect(),tol=2;
  const stage=$('.reader-stage'),content=$('.reader-content'),art=$('.reader-image-wrap'),copy=$('.reader-copy'),scene=$('.reader-scene'),player=$('.reader-player');
  const s=rect(stage),c=rect(content),a=rect(art),pl=rect(player),sc=rect(scene);
  const check=(ok,msg)=>{if(!ok)errors.push(msg);};
  check(document.documentElement.scrollWidth<=innerWidth+tol,'document horizontal overflow');
  check(s.bottom<=innerHeight+tol,'stage exceeds viewport');
  check(pl.top>=c.bottom-tol&&pl.bottom<=innerHeight+tol,'player covers content or leaves viewport');
  check(c.height>=70,'story viewport collapsed');
  for(const selector of ['.reader-progress','.reader-layout-switch','.reader-player','.reader-controls','.reader-bottom']){
   const el=$(selector);if(!el)continue;
   check(el.scrollWidth<=el.clientWidth+tol,selector+' horizontal overflow');
  }
  const controls=[...document.querySelectorAll('.reader-controls button,.auto-control')].map(rect);
  controls.forEach((r,i)=>{
   check(r.left>=pl.left-tol&&r.right<=pl.right+tol&&r.top>=pl.top-tol&&r.bottom<=pl.bottom+tol,'control outside player');
   controls.slice(i+1).forEach(b=>check(!(r.left<b.right-1&&r.right>b.left+1&&r.top<b.bottom-1&&r.bottom>b.top+1),'controls overlap'));
  });
  const columns=getComputedStyle(scene).display==='grid';
  if(columns){
   const t=rect(copy);check(Math.abs(t.left-a.right-(matchMedia('(max-height:500px) and (orientation:landscape)').matches?12:20))<=tol,'excessive art/text gap');
   check(a.top+content.scrollTop>=c.top-tol&&a.bottom+content.scrollTop<=c.bottom+tol,'art clipped in columns');
   check(copy.scrollWidth<=copy.clientWidth+tol,'copy horizontal overflow');
   check(t.top+content.scrollTop>=c.top-tol&&t.bottom+content.scrollTop<=c.bottom+tol,'copy exceeds story viewport');
  }
  const dialogue=$('.reader-dialogue');
  if(dialogue&&!dialogue.hidden&&!columns){
   const d=rect(dialogue);check(d.bottom<=a.top+tol,'dialogue covers art');
   check(sc.height<=c.height+tol||content.scrollHeight>content.clientHeight,'long scene cannot scroll');
  }
  if(art.querySelector('.reader-dialogue'))errors.push('dialogue moved into artwork');
  const dots=$('.progress-dots');if(getComputedStyle(dots).display!=='none')check(dots.scrollWidth<=dots.clientWidth+tol,'page dots overflow');
  return errors;
 });
 assert.deepEqual(failures,[],label+': '+failures.join('; '));checks++;
}
async function open(p,base,id,layout='dialogue',imageExpected=true) {
 await p.goto(`${base}/read/${id}?start=1&layout=${layout}`);
 await p.waitForSelector('.reader-player');
 await p.waitForFunction(()=>document.querySelector('.reader-image')?.complete);
 if(imageExpected)assert.ok(await p.locator('.reader-image').evaluate(e=>e.naturalWidth>0),'expected artwork did not load');
 await settle(p);
}
(async()=>{
 const base=process.env.PIC_BASE_URL||await localServer();
 const kind=process.env.PIC_BROWSER||'chromium';
 const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 const executable=process.env.PIC_BROWSER_EXECUTABLE||(kind==='chromium'&&fs.existsSync(systemChrome)?systemChrome:undefined);
 browser=await playwright[kind].launch({headless:true,...(executable?{executablePath:executable}:{}),...(kind==='chromium'?{args:['--no-sandbox']}: {})});
 const p=await browser.newPage();
 if(process.env.PIC_BASE_URL&&process.env.PIC_ASSET_FALLBACK){
  await p.route('**/assets/books/**',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===new URL(base).origin&&!fs.existsSync(path.join(root,'web',url.pathname))){
    const response=await p.request.get(process.env.PIC_ASSET_FALLBACK.replace(/\/$/,'')+url.pathname+url.search);
    assert.ok(response.ok(),'remote asset failed: '+url.pathname);await route.fulfill({response});
   }else await route.continue();
  });
 }
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of sizes){
  await p.setViewportSize({width,height});
  for(const id of ids){
   const book=books.find(b=>b.id===id);assert.ok(book,id+' exists');
   await open(p,base,id);
   const longest=book.pages.reduce((best,page,i)=>page.text_original.length>book.pages[best].text_original.length?i:best,0);
   const pages=[...new Set([0,longest,book.pages.length-1])];
   for(const mode of ['dialogue','standard']){
    const toggle=p.locator(`[data-layout="${mode}"]`);if(await toggle.count())await toggle.click();
    for(const lang of ['zh','en']){
     await p.locator(`[data-lang="${lang}"]`).click();
     for(const page of pages){
      await p.selectOption('.reader-page-select',String(page),{force:true});await settle(p);
      await verify(p,`${id} ${width}x${height} ${mode}/${lang} page ${page+1}`);
     }
    }
   }
  }
  console.log(`PASS ${width}x${height}`);
 }
 // Resize the same reader across every breakpoint; no observer/DOM race is allowed.
 await p.setViewportSize({width:1366,height:768});await open(p,base,ids[0]);
 for(const [width,height] of sizes){await p.setViewportSize({width,height});await settle(p);await verify(p,`live resize ${width}x${height}`);}
 // Stable artwork frame through pages with/without dialogue; native page jump works.
 for(const [width,height] of [[430,932],[1366,768],[844,390]]){
  await p.setViewportSize({width,height});await open(p,base,ids[0]);
  let frame;
  for(let i=0;i<books.find(b=>b.id===ids[0]).pages.length;i++){
   await p.selectOption('.reader-page-select',String(i),{force:true});await settle(p);
   const b=await p.locator('.reader-image-wrap').boundingBox();
   if(frame){assert.ok(Math.abs(b.width-frame.width)<2&&Math.abs(b.height-frame.height)<2,'art frame shifts on turn');}frame=b;
  }
  await p.locator('[data-reader=finish]').click();await p.locator('.reader-finished').waitFor({state:'visible'});
  await verify(p,'finished');await p.locator('.reader-finished [data-reader=restart]').click();
  await p.locator('[data-reader=night]').click();await verify(p,'night');
  await p.locator('[data-reader=text]').click();await verify(p,'hidden text');
  await p.locator('[data-reader=text]').click();await p.locator('[data-reader=settings]').click();
  const settings=await p.locator('.reader-settings').boundingBox();assert.ok(settings.x>=0&&settings.x+settings.width<=width+2&&settings.y+settings.height<=height+2,'settings outside viewport');
  await p.keyboard.press('Escape');
 }
 // Failure/retry must preserve accessible text and independent controls.
 const failArt=route=>route.abort();await p.route('**/assets/books/**',failArt);
 await p.setViewportSize({width:430,height:932});await open(p,base,ids[0],'dialogue',false);
 await p.locator('.reader-image-error').waitFor({state:'visible'});await verify(p,'image failure');
 assert.equal(await p.locator('.reader-text').evaluate(e=>e.classList.contains('dialogue-transcript')),false);
 await p.unroute('**/assets/books/**',failArt);await p.locator('[data-reader=image-retry]').click();
 await p.waitForFunction(()=>document.querySelector('.reader-image')?.naturalWidth>0);await verify(p,'image retry');
 // Native fullscreen runs in Chromium/Firefox; unsupported engines retain normal mode.
 await p.setViewportSize({width:1366,height:768});
 if(await p.evaluate(()=>Boolean(document.querySelector('.reader-stage').requestFullscreen))){
  await p.locator('[data-reader=fullscreen]').click();await p.waitForFunction(()=>Boolean(document.fullscreenElement));await settle(p);await verify(p,'fullscreen');
  await p.evaluate(()=>document.exitFullscreen());await settle(p);await verify(p,'exit fullscreen');
 }
 // The recommendation is real API content on home/catalog/detail/favorites.
 for(const [width,height] of [[320,568],[430,932],[768,1024],[1366,768]]){
  await p.setViewportSize({width,height});
  for(const route of ['/','/books','/book/bd-amazing-daisy','/shelf']){
   await p.evaluate(ids=>localStorage.setItem('pic-library-v1',JSON.stringify({favorites:ids})),books.map(b=>b.id));
   await p.goto(base+route);await p.waitForSelector(route.startsWith('/book/')?'.detail-reading-value':'.book-reading-value');
   const result=await p.evaluate(()=>{
    const cards=[...document.querySelectorAll('.book-card')].map(card=>({id:card.querySelector('.book-cover').getAttribute('href').split('/').pop(),value:card.querySelector('.book-reading-value')?.textContent}));
    const value=document.querySelector('.detail-reading-value span')?.textContent;
    const overflow=[...document.querySelectorAll('.book-reading-value,.detail-reading-value')].some(e=>e.scrollWidth>e.clientWidth+2);
    return {cards,value,overflow,bodyOverflow:document.documentElement.scrollWidth>innerWidth+2};
   });
   assert.equal(result.overflow,false,'recommendation overflows '+route);assert.equal(result.bodyOverflow,false,'page overflows '+route);
   for(const card of result.cards)assert.equal(card.value,books.find(b=>b.id===card.id)?.reading_value,'card recommendation differs from database snapshot');
   if(result.value)assert.equal(result.value,books.find(b=>b.id==='bd-amazing-daisy').reading_value);
   checks++;
  }
 }
 if(output){fs.mkdirSync(output,{recursive:true});await p.evaluate(()=>localStorage.clear());for(const [width,height] of [[430,932],[1366,768],[844,390]]){await p.setViewportSize({width,height});await open(p,base,ids[0]);await p.selectOption('.reader-page-select','2',{force:true});await settle(p);await p.screenshot({path:path.join(output,`reader-${width}.png`)});}}
 assert.deepEqual(errors,[],'browser JS errors');
 console.log(`PASS ${checks} layout cases (${process.env.PIC_BASE_URL?'real API/assets':'offline fixtures/test art'}, ${kind}); resize, frame stability, completion, night, text, settings, failure/retry and fullscreen.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
