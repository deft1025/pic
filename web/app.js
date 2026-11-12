const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const icons = {
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',chevron:'<path d="m9 5 7 7-7 7"/>',left:'<path d="m15 5-7 7 7 7"/>',back:'<path d="M19 12H5m7-7-7 7 7 7"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',book:'<path d="M12 5Q7 2 3 5v15q4-3 9 0 5-3 9 0V5q-4-3-9 0Zm0 0v15"/>',star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',headphones:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13H3v7h4v-7Zm16 0h1v7h-4v-7Z"/>',play:'<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke-width="0"/>',pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',volume:'<path d="M11 4 6 8H2v8h4l5 4ZM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',shield:'<path d="m12 3 8 3v6q-1 6-8 9-7-3-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',heart:'<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 2 11 8 16 6-5 13-11 8-16Z"/>',home:'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',moon:'<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',settings:'<path d="m10 3-1 3-3 1-3 3 2 3v4l4 1 3 3 3-3 4-1v-4l2-3-3-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',check:'<path d="m5 12 4 4L19 6"/>',text:'<path d="M4 5h16M12 5v15M8 20h8"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',leaf:'<path d="M20 3Q2 1 3 13q0 8 9 6 10-3 8-16ZM5 19l10-11"/>',restart:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/>',sparkles:'<path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2Zm7 0v4m-2-2h4"/>'
};
const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${icons[name] || icons.book}</svg>`;
let meta = {ages:[],categories:[]};
let renderToken = 0, disposePage = () => {}, storageAvailable = true;
const storeKey = 'pic-library-v1';
const readingRates = [0.5,0.65,0.75,1,1.25,1.5];
const deviceSpeechBaseRate = 0.8;
const defaultPreferences = {language:'zh',auto:true,showText:true,night:false,rate:1,rateVersion:2,volume:1,readingLayout:'dialogue',voices:{zh:'',en:''}};
function loadStore() {
 try {
  const raw = JSON.parse(localStorage.getItem(storeKey) || '{}');
  const x = raw && typeof raw === 'object' ? raw : {};
  const favorites = [...new Set((Array.isArray(x.favorites) ? x.favorites : []).filter(v => typeof v === 'string' && v.length > 0))];
  const progress = Object.create(null);
  for (const [id,p] of Object.entries(x.progress && typeof x.progress === 'object' ? x.progress : {})) {
   if (p && Number.isInteger(p.page) && p.page >= 0) progress[id] = {page:p.page,completed:p.completed === true,updated_at:typeof p.updated_at === 'string' ? p.updated_at : ''};
  }
  const saved = x.preferences || {}, preferences = {...defaultPreferences,voices:{...defaultPreferences.voices}};
  for (const key of ['auto','showText','night']) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
  if (['zh','en'].includes(saved.language)) preferences.language = saved.language;
  if (['dialogue','standard'].includes(saved.readingLayout)) preferences.readingLayout = saved.readingLayout;
  // The approved pre-generated narration is now 1x. Reset earlier speed settings once.
  if (readingRates.includes(saved.rate) && saved.rateVersion === 2) preferences.rate = saved.rate;
  for (const language of ['zh','en']) if (typeof saved.voices?.[language] === 'string' && saved.voices[language].length <= 512) preferences.voices[language] = saved.voices[language];
  if (typeof saved.volume === 'number' && saved.volume >= 0 && saved.volume <= 1) preferences.volume = saved.volume;
  return {favorites,progress,preferences};
 } catch { storageAvailable = false; return {favorites:[],progress:Object.create(null),preferences:{...defaultPreferences,voices:{...defaultPreferences.voices}}}; }
}
function recentIDs() { return Object.keys(local.progress).sort((a,b)=>local.progress[b].updated_at.localeCompare(local.progress[a].updated_at)); }
async function booksByIDs(ids) {
 if (!ids.length) return [];
 const batches = [];
 for (let i=0;i<ids.length;i+=40) batches.push(ids.slice(i,i+40));
 const responses = await Promise.all(batches.map(batch=>api('/api/books?ids='+encodeURIComponent(batch.join(','))+'&limit=100')));
 const byID = new Map(responses.flatMap(r=>r.items).map(b=>[b.id,b]));
 return ids.map(id=>byID.get(id)).filter(Boolean);
}
function pager(offset,total,size=15) {
 if (total<=size) return '';
 return `<nav class="pager" aria-label="结果分页"><button data-offset="${Math.max(0,offset-size)}" ${offset===0?'disabled':''} aria-label="上一页">${icon('left')}</button><span>第 ${Math.floor(offset/size)+1} / ${Math.ceil(total/size)} 页</span><button data-offset="${offset+size}" ${offset+size>=total?'disabled':''} aria-label="下一页">${icon('chevron')}</button></nav>`;
}
let local = loadStore();
function persist() { try { localStorage.setItem(storeKey,JSON.stringify(local)); } catch { storageAvailable = false; } }
let toastTimer;
function toast(text) { const el = $('#toast'); el.textContent = text; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true,3000); }
function toggleFavorite(id) { const saved = local.favorites.includes(id); local.favorites = saved ? local.favorites.filter(x => x !== id) : [...local.favorites,id]; persist(); $$(`[data-save="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('saved',!saved); b.setAttribute('aria-pressed',String(!saved)); b.setAttribute('aria-label',saved?'收藏绘本':'取消收藏'); if(b.dataset.label) b.innerHTML = `${icon('star')}${saved?'收藏绘本':'已收藏'}`; }); toast(storageAvailable ? saved?'已取消收藏':'已放进我的小书架' : '浏览器暂时无法保存，收藏仅在本次访问有效'); }
function progressFor(book) { const p=local.progress[book.id]; return p && Number.isInteger(p.page) && p.page>=0 ? {...p,page:Math.min(p.page,book.page_count-1)} : null; }
async function api(path, signal) { const response = await fetch(path,{signal}); let body; try { body=await response.json(); } catch { throw Error('服务返回了异常数据，请稍后重试'); } if(!response.ok) throw Error(body.error || '暂时无法打开，请稍后重试'); return body; }
const assetURL = (path,version) => path + (version?'?v='+encodeURIComponent(version):'');
const categoryName = id => meta.categories.find(c => c.id===id)?.name || id;
const ageLabel = ages => ages.length===3 ? '0–6 岁' : ages.map(x => x.replace('-', '–')).join(' / ')+' 岁';
function bookCard(b, history=false) { const saved=local.favorites.includes(b.id),p=progressFor(b); const audio=b.voices?.zh ? '中文有声' : b.voices?.en ? '英文有声' : b.languages.length>1 ? '中英双语' : b.languages.includes('zh') ? '中文绘本' : '英文绘本'; return `<article class="book-card"><a class="book-cover" href="/book/${esc(b.id)}" aria-label="打开${esc(b.title_zh)}"><img src="${esc(assetURL(b.cover,b.content_version))}" alt="${esc(b.title_zh)}封面" loading="lazy" width="600" height="760"><span class="audio-badge">${icon(b.voices?.zh||b.voices?.en?'headphones':'book')}${audio}</span></a><button class="save-button ${saved?'saved':''}" data-save="${esc(b.id)}" aria-label="${saved?'取消收藏':'收藏绘本'}" aria-pressed="${saved}">${icon('star')}</button><div class="book-info"><a href="/book/${esc(b.id)}"><h3>${esc(b.title_zh)}</h3></a><p class="book-original">${esc(b.title_original)}</p><div class="book-tags"><span class="tag tag-age">${esc(ageLabel(b.age_ranges))}</span><span class="tag">${esc(categoryName(b.categories[0]))}</span></div>${history && p ? `<a href="/read/${esc(b.id)}"><div class="progress-label"><span>${p.completed?'已读完 · 再读一遍':'继续阅读'}</span><span>${p.page+1} / ${b.page_count}</span></div><div class="reading-progress"><progress max="${b.page_count}" value="${p.completed?b.page_count:p.page+1}" aria-label="阅读进度"></progress></div></a>`:''}</div></article>`; }
function header() {
 const p=location.pathname, inLibrary=p==='/books'||p.startsWith('/book/');
 return `<header class="site-header"><div class="container header-inner"><a class="brand" href="/"><img src="/favicon.svg" alt="" width="47" height="47"><div class="brand-name">小小绘本馆<small>LITTLE STORIES, BIG WORLD</small></div></a><nav class="main-nav" aria-label="主要导航"><a href="/" ${p==='/'?'class="active" aria-current="page"':''}>首页</a><a href="/books" ${inLibrary?'class="active" aria-current="page"':''}>全部绘本</a></nav>${p==='/books'?'':`<form class="header-search" role="search" data-search>${icon('search')}<input name="q" aria-label="搜索绘本" placeholder="找一本喜欢的绘本…" maxlength="100"></form>`}<a class="shelf-link" href="/shelf" ${p==='/shelf'?'aria-current="page"':''}>${icon('star')}<span>我的书架</span></a></div></header>`;
}
function footer() { return `<footer class="site-footer"><div class="container"><div class="footer-inner"><div><div class="footer-brand">小小绘本馆</div><p class="footer-sub">让每一段小小的阅读，都成为大大的陪伴。</p></div><nav class="footer-links" aria-label="网站说明"><a href="/about">关于我们</a><a href="/copyright">内容与版权</a><a href="/privacy">隐私保护</a></nav></div><p class="footer-end">用故事陪伴成长，用阅读发现世界 · 为 0–6 岁的你和家人</p></div></footer>${mobileNav()}`; }
function mobileNav() {
 const p=location.pathname;
 return `<nav class="mobile-nav" aria-label="移动导航">${[['/','home','首页'],['/books','grid','全部绘本'],['/shelf','star','我的书架']].map(([href,ico,label])=>{const active=href==='/books'?(p==='/books'||p.startsWith('/book/')):p===href;return `<a href="${href}" ${active?'class="active" aria-current="page"':''}>${icon(ico)}${label}</a>`;}).join('')}</nav>`;
}
function pageShell(content) { return `${header()}<main class="container" id="main">${content}</main>${footer()}`; }
function sectionHeading(ico,title,subtitle,href,label='查看全部') { return `<div class="section-heading"><div class="section-title">${icon(ico)}<h2>${title}</h2>${subtitle?`<small>${subtitle}</small>`:''}</div>${href?`<a class="text-link" href="${href}">${label}${icon('chevron')}</a>`:''}</div>`; }
function empty(title,description,href='/books',label='去绘本馆看看') { return `<div class="empty">${icon('book')}<h2>${esc(title)}</h2><p>${esc(description)}</p><a class="btn" href="${href}">${label}${icon('arrow')}</a></div>`; }
function breadcrumb(label) { return `<div class="breadcrumb"><a href="/">首页</a>${icon('chevron')}<a href="/books">绘本馆</a>${label?`${icon('chevron')}<span>${esc(label)}</span>`:''}</div>`; }

async function home() {
 const [featured,latest,recent]=await Promise.all([api('/api/books?featured=true&limit=4'),api('/api/books?sort=newest&limit=10'),booksByIDs(recentIDs().filter(id=>!local.progress[id].completed).slice(0,8)).catch(()=>[])]);
 const continuing=recent[0], progress=continuing&&progressFor(continuing);
 const featuredIDs=new Set(featured.items.map(b=>b.id));
 const newBooks=latest.items.filter(b=>!featuredIDs.has(b.id)).slice(0,4);
 return pageShell(`
 <div class="hero-wrap"><section class="hero" aria-label="欢迎来到小小绘本馆">
  <div class="hero-copy"><span class="eyebrow"><span class="sun-dot"></span>给孩子，也给陪伴的你</span><h1>挨着坐，<br>一起<em>读个小故事。</em></h1><p>翻开一本绘本，留一点时间给彼此。<br>从今天的小小好奇，读到明天的大大世界。</p><div class="hero-actions"><a class="btn" href="/books">挑一本绘本${icon('arrow')}</a><a class="text-link" href="/shelf">我的小书架${icon('chevron')}</a></div><div class="hero-note"><span>免费阅读</span><span>中英双语</span><span>适合 0–6 岁</span></div></div>
  <div class="hero-art"><img src="/assets/hero.svg?v=reading-corner-1" alt="暖暖的窗边，大人和孩子挨着坐在软垫上，一起翻看绘本，身旁放着小书架和绿植" width="720" height="560" fetchpriority="high"></div>
 </section></div>
 ${continuing?`<section class="continue-reading" aria-label="继续上次阅读"><img src="${esc(assetURL(continuing.cover,continuing.content_version))}" alt="" width="72" height="90"><div><span class="eyebrow">故事，等你继续</span><h2>${esc(continuing.title_zh)}</h2><p>上次读到第 ${progress.page+1} 页，共 ${continuing.page_count} 页</p></div><a class="btn" href="/read/${esc(continuing.id)}">继续阅读${icon('arrow')}</a></section>`:''}
 <section class="age-grid" aria-label="按年龄选绘本">${meta.ages.map((a,i)=>`<a class="age-card" href="/books?age=${a.id}"><span class="age-art" aria-hidden="true">${icon(['heart','leaf','sparkles'][i])}</span><div><h3>${a.name}</h3><p>${a.description}</p></div>${icon('arrow')}</a>`).join('')}</section>
 <section class="section home-featured">${sectionHeading('star','今天读什么','从一个喜欢的故事开始','/books')}<div class="book-grid">${featured.items.map(b=>bookCard(b)).join('')}</div></section>
 <section class="section home-themes">${sectionHeading('leaf','跟着好奇心，找故事','','/books','全部绘本')}<div class="theme-grid">${meta.categories.map((c,i)=>`<a class="theme-card" href="/books?category=${c.id}"><span aria-hidden="true">${icon(['book','check','heart','moon','leaf','sparkles'][i])}</span><div><h3>${c.name}</h3><small>${['和动物做朋友','每天进步一点点','接住每一种心情','藏在枕边的温柔','发现自然的美好','小脑袋，大世界'][i]}</small></div></a>`).join('')}</div></section>
 ${newBooks.length?`<section class="section home-new">${sectionHeading('sparkles','还有这些新朋友','下一本，也许就喜欢','/books?sort=newest','按最新上架浏览')}<div class="book-grid">${newBooks.map(b=>bookCard(b)).join('')}</div></section>`:''}
 <section class="promise-row" aria-label="我们的心意">${[['book','好故事，免费读','把阅读的美好带给每个孩子'],['shield','安心的小天地','无需注册，没有打扰'],['heart','陪伴，让爱发生','每天十分钟，一起读世界']].map(([ico,title,copy])=>`<div class="promise">${icon(ico)}<div><strong>${title}</strong><p>${copy}</p></div></div>`).join('')}</section>`);
}

async function catalogPage() {
 const params=new URLSearchParams(location.search), query=new URLSearchParams();
 if(params.has('language')){params.delete('language');history.replaceState(null,'','/books'+(params.size?'?'+params:''));}
 for(const k of ['q','age','category','sort','offset']) if(params.get(k)) query.set(k,params.get(k)); query.set('limit','15');
 let data=await api('/api/books?'+query);
 if(data.total>0 && Number(query.get('offset'))>=data.total){query.set('offset',String(Math.floor((data.total-1)/15)*15));data=await api('/api/books?'+query);}
 const recommendations=data.items.length?null:await api('/api/books?featured=true&limit=5');
 const q=params.get('q')||'', cat=params.get('category');
 const title='全部绘本';
 document.title=`${title} · 小小绘本馆`;
 const filters=(key,label,options)=>`<div class="filter-row filter-row-${key}"><span class="filter-label">${label}</span><button class="chip ${!params.get(key)?'active':''}" data-filter="${key}" data-value="" aria-pressed="${!params.get(key)}">全部</button>${options.map(o=>`<button class="chip ${params.get(key)===o.id?'active':''}" data-filter="${key}" data-value="${o.id}" aria-pressed="${params.get(key)===o.id}">${o.name}</button>`).join('')}</div>`;
 const offset=Number(query.get('offset'))||0;
 return pageShell(`<div class="page-top catalog-top"><div><h1>${title}</h1><p>按年龄和主题，挑一本今天想读的故事。</p></div><span class="catalog-note">${icon('book')}中英文，在阅读时自由切换</span></div><section class="filter-panel" aria-label="筛选绘本"><form class="catalog-search" role="search" data-search>${icon('search')}<input name="q" placeholder="搜索书名、作者或一个关键词…" value="${esc(q)}" aria-label="搜索书名、作者或关键词" maxlength="100"><button aria-label="搜索">${icon('arrow')}</button></form>${filters('age','年龄',meta.ages)}${filters('category','主题',meta.categories)}</section><div class="results-bar"><span>找到 <strong>${data.total}</strong> 本${q?'相关':''}绘本${q||params.get('age')||cat?'<button class="inline-retry" data-reset>清除筛选</button>':''}</span><label>排序 <select id="sort" aria-label="绘本排序">${[['featured','精选推荐'],['newest','最新上架'],['title','书名排序']].map(([v,n])=>`<option value="${v}" ${params.get('sort')===v?'selected':''}>${n}</option>`).join('')}</select></label></div><section class="book-grid catalog-grid" aria-label="绘本列表">${data.items.length?data.items.map(b=>bookCard(b)).join(''):empty('这个故事，还在路上','试试换一个关键词，或者看看其他主题。也许下一本喜欢的绘本就在这里。','/books','看看全部绘本')}</section>${pager(offset,data.total)}${recommendations?`<section class="section empty-recommendations">${sectionHeading('star','也许会喜欢这些故事','换一个故事，继续探索','/books')}<div class="suggested-themes">${meta.categories.map(c=>`<a class="chip" href="/books?category=${esc(c.id)}">${esc(c.name)}</a>`).join('')}</div><div class="book-grid">${recommendations.items.map(b=>bookCard(b)).join('')}</div></section>`:''}`);
}

async function detail(id) {
 const b=await api('/api/books/'+encodeURIComponent(id)),similar=await api('/api/books?category='+encodeURIComponent(b.categories[0])+'&limit=6'),p=progressFor(b),saved=local.favorites.includes(id);
 document.title=`${b.title_zh} · 小小绘本馆`;
 return pageShell(`<div class="page-top">${breadcrumb(b.title_zh)}</div><article class="detail-layout"><img class="detail-cover" src="${esc(assetURL(b.cover,b.content_version))}" alt="${esc(b.title_zh)}封面" width="600" height="760"><div class="detail-meta"><div class="book-tags">${b.categories.map(c=>`<a class="tag" href="/books?category=${c}">${categoryName(c)}</a>`).join('')}${b.languages.includes('en')?`<span class="tag tag-age">${b.languages.length>1?'中英双语':'英文绘本'}</span>`:''}</div><h1>${esc(b.title_zh)}</h1><p class="detail-en">${esc(b.title_original)}</p><p class="detail-byline">文 / ${esc(b.author)}<br>图 / ${esc(b.illustrator)}</p><p class="detail-description">${esc(b.description_zh)}</p><div class="detail-facts"><div><strong>${esc(ageLabel(b.age_ranges))}</strong><small>适读年龄</small></div><div><strong>${b.page_count} 页</strong><small>故事长度</small></div><div><strong>约 ${b.reading_minutes} 分钟</strong><small>阅读时光</small></div><div><strong>${b.languages.length>1?'双语阅读':b.languages.includes('zh')?'中文阅读':'英文阅读'}</strong><small>${b.languages.map(l=>l==='zh'?'中文':'English').join(' / ')}</small></div></div><div class="audio-availability" aria-label="朗读能力">${b.languages.map(l=>`<span class="tag">${icon(b.voices?.[l]?'headphones':'book')}${l==='zh'?'中文':'英文'}：${b.voices?.[l]?'已配逐页音频':'暂未配音'}</span>`).join('')}</div><div class="detail-actions"><a class="btn btn-blue" href="/read/${esc(id)}">${icon('play')}${p&&!p.completed?`继续阅读 · 第 ${p.page+1} 页`:'开始阅读'}</a><button class="btn btn-white ${saved?'saved':''}" data-save="${esc(id)}" data-label="true" aria-label="${saved?'取消收藏':'收藏绘本'}" aria-pressed="${saved}">${icon('star')}${saved?'已收藏':'收藏绘本'}</button>${p&&p.page>0?`<a class="text-link" href="/read/${esc(id)}?start=1">从头阅读${icon('restart')}</a>`:''}</div>${b.is_demo?'<p class="demo-note">原创演示故事 · 为初版阅读体验创作</p>':''}<details class="license"><summary>${icon('info')}故事的创作与来源${icon('chevron')}</summary><p>${esc(b.license.attribution)}</p><p>内容类型：${esc(b.license.type)} · 授权信息${b.license.review_status==='approved'?'已核验':'待完善'}<br>内容版本：${esc(b.content_version)}</p>${[b.license.source_url,b.license.license_url].filter(u=>/^https?:\/\//.test(u)).map((u,i)=>`<p><a target="_blank" rel="noopener noreferrer" href="${esc(u)}">${i===0?'查看原始来源':'查看授权说明'} ↗</a></p>`).join('')}</details></div></article><section class="section detail-suggestions">${sectionHeading('heart','还想读一个故事吗？','',`/books?category=${b.categories[0]}`)}<div class="book-grid">${similar.items.filter(x=>x.id!==id).slice(0,5).map(x=>bookCard(x)).join('')}</div></section>`);
}

async function shelf() {
 const tab=new URLSearchParams(location.search).get('tab')==='history'?'history':'favorites';
 const ids=tab==='history'?recentIDs():local.favorites;
 const books=await booksByIDs(ids),requested=Number(new URLSearchParams(location.search).get('offset'))||0;
 const offset=Math.min(Math.max(0,Math.floor(requested/15)*15),Math.max(0,Math.floor((books.length-1)/15)*15));
 const data={items:books.slice(offset,offset+15)};
 document.title='我的小书架 · 小小绘本馆';
 return pageShell(`<div class="page-top">${breadcrumb('我的书架')}<h1>我的小书架</h1><p>喜欢的故事和读到的那一页，都帮你记在这里。</p></div><div class="shelf-tabs"><a class="chip ${tab==='favorites'?'active':''}" href="/shelf">${icon('star')} 我的收藏 · ${tab==='favorites'?books.length:local.favorites.length}</a><a class="chip ${tab==='history'?'active':''}" href="/shelf?tab=history">${icon('clock')} 最近读过 · ${tab==='history'?books.length:Object.keys(local.progress).length}</a></div><section class="book-grid catalog-grid">${data.items.length?data.items.map(b=>bookCard(b,tab==='history')).join(''):empty(tab==='favorites'?'把喜欢的故事，放进小书架':'第一段阅读时光，从这里开始',tab==='favorites'?'点击绘本右上角的小星星，下次就能在这里找到它。':'打开一本绘本，读到的页码会自动保存在这台设备上。')}</section>${pager(offset,books.length)}${books.length<ids.length?'<p class="shelf-unavailable">部分绘本暂未上架，重新上架后会回到书架。</p>':''}<div class="shelf-bottom"><span>仅保存在当前浏览器，无需登录${storageAvailable?'':' · 当前无法持久保存'}</span>${Object.keys(local.progress).length?'<button data-clear-history>清除阅读记录</button>':''}</div>`);
}

function policyPage(path) {
 const content={
 '/about':['给孩子一个小小的故事世界','我们相信，一本绘本的时间，就是家人靠近彼此的时间。','<h2>你好，这里是小小绘本馆</h2><p>这是为 0–6 岁孩子和家长准备的免费绘本阅读空间。用图画认识世界，用语言表达感受，用故事陪伴成长。</p><h2>从一个故事开始</h2><p>可以按年龄和主题找书；在阅读器里逐页看图、切换中英文阅读，也可以收藏喜欢的故事。我们把阅读进度记在当前浏览器里，方便下一次继续。</p><h2>关于初版内容</h2><p>绘本按年龄与主题整理，包含开放许可作品的双语翻译与新版插画。每本书的作者、来源、许可及改编说明可在详情页查看，具体在架书目以书库为准。</p><h2>关于有声阅读</h2><p>有声功能优先播放逐页预生成音频。尚未配音的故事，可选择设备提供的朗读声音；声音可用性取决于浏览器和系统。我们会明确区分这两种方式。</p>'],
 '/privacy':['让阅读，简单而安心','不需要注册，不询问孩子的姓名、照片或生日。','<h2>我们保存什么</h2><p>收藏的绘本 ID、最近阅读的页码、阅读完成状态、更新时间及语言、音量等阅读设置，保存在当前浏览器的本地存储中。没有账号，不会在设备之间同步。清除浏览器数据后，这些记录也会被移除。</p><h2>我们不做什么</h2><p>当前版本没有评论、私信、开放聊天、第三方分析脚本或广告。不会建立儿童个人画像，不采集姓名、照片、精确生日、学校和位置。</p><h2>你可以如何管理</h2><p>可以逐本取消收藏，也可以在“我的书架”中清除阅读记录。通过浏览器的网站数据设置，可以清除全部本地数据。</p><h2>网络与语音</h2><p>绘本内容和预生成音频由本站提供。服务运行时可能产生用于故障排查的基础访问日志。设备朗读由浏览器和系统实现，部分系统可能使用其语音服务；如不希望使用，可以只看图和阅读文字。</p>'],
 '/copyright':['每一个故事，都有自己的来处','我们为每本绘本保留作者、插画师、来源和授权信息。','<h2>绘本与新版插画</h2><p>书库包含开放许可作品的翻译与重绘版。原作文字、中文翻译和新版插画会分别注明来源及制作方式，不将新版插画称为原版图片。详细署名和许可链接可在每本绘本详情页的“故事的创作与来源”中查看。</p><h2>来源与授权信息</h2><p>内容记录保留来源链接、授权类型、署名、商业使用、自托管、翻译、有声制作权限及审核状态。初版按内容配置展示已发布作品，授权记录待完善时会如实标注。</p><h2>内容反馈</h2><p>若发现图文错误或权利问题，请记录绘本名称和具体页码，向站点运营者反馈。运营者可通过内容脚本修订作品或将其设为下架，重新加载后前台即停止展示。</p>']
 }[path];
 document.title=content[0]+' · 小小绘本馆';
 return pageShell(`<article class="policy">${breadcrumb('网站说明')}<h1>${content[0]}</h1><p class="lead">${content[1]}</p><div class="policy-box">${content[2]}</div><p class="demo-note">更新日期：2026 年 11 月 6 日</p><a class="btn" href="/books">找一本故事${icon('arrow')}</a></article>`);
}

async function reader(id, token) {
 const [book,res]=await Promise.all([api('/api/books/'+encodeURIComponent(id)),api('/api/books/'+encodeURIComponent(id)+'/pages')]);
 if(token!==renderToken)return null;
 document.title=book.title_zh+' · 正在阅读';
 const pages=res.items, remembered=progressFor(book);
 if(!pages.length)throw Error('这本绘本的页面还没有准备好，请稍后重试');
 const requestedLayout=new URLSearchParams(location.search).get('layout');
 let dialogueLayout=null,dialogueModule=null,dialogueView=null,dialogueEnabled=(['dialogue','standard'].includes(requestedLayout)?requestedLayout:local.preferences.readingLayout)==='dialogue';
 if(pages.some(p=>p.dialogue?.parts?.length)){
  try{
   dialogueModule=await import('/assets/reader-dialogue.js');dialogueLayout=true;
  }catch{/* Optional typography must never prevent reading a story. */}
  if(token!==renderToken)return null;
 }
 const preferences=local.preferences;
 let page=new URLSearchParams(location.search).get('start')!=='1'&&remembered&&!remembered.completed?Math.min(remembered.page,pages.length-1):0,lang=book.languages.includes(preferences.language)?preferences.language:book.languages[0],playing=false,auto=preferences.auto,showText=preferences.showText,finished=false,rate=preferences.rate,volume=preferences.volume,epoch=0,disposed=false,sleepTimer=null,utterance=null;
 if(dialogueLayout){const requested=Number(new URLSearchParams(location.search).get('page'));if(Number.isInteger(requested)&&requested>=1&&requested<=pages.length)page=requested-1;}
 const audio=new Audio();audio.preload='metadata';audio.preservesPitch=true;
 const speechAvailable='speechSynthesis' in window;
 const html=`<div class="reader-page"><header class="reader-header"><a href="/book/${esc(id)}">${icon('back')}返回绘本</a><div class="reader-title">${esc(book.title_zh)}<small>一页一页，读进故事里</small></div><div class="reader-toolset"><button class="icon-btn" data-reader="night" aria-label="切换夜间模式" aria-pressed="false">${icon('moon')}</button><button class="icon-btn" data-reader="settings" aria-label="阅读设置" aria-expanded="false">${icon('settings')}</button></div></header><div class="reader-settings" hidden><h3>舒适地读一个故事</h3><label class="setting-row">音量<input type="range" id="reader-volume" min="0" max="1" step="0.1" value="1" aria-label="朗读音量"></label><label class="setting-row setting-voice">朗读声音<select id="reader-voice" aria-label="朗读声音" aria-describedby="reader-voice-hint"><option value="">自动选择</option></select></label><p class="setting-hint" id="reader-voice-hint"></p><label class="setting-row">语速<select id="reader-rate" aria-label="朗读语速">${readingRates.map(r=>`<option value="${r}" ${r===rate?'selected':''}>${r} 倍${r===1?' · 标准节奏':''}</option>`).join('')}</select></label><label class="setting-row">定时停止<select id="reader-sleep" aria-label="定时停止"><option value="0">不定时</option><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="15">15 分钟</option></select></label><label class="setting-row">显示故事文字<input id="reader-show-text" type="checkbox" checked></label></div><main class="reader-stage" id="main"><div class="reader-progress"><span id="page-number"></span><div class="progress-dots" aria-label="选择绘本页码"></div><button class="text-link" data-reader="fullscreen" aria-label="全屏阅读">${icon('expand')}全屏</button></div><div class="reader-image-wrap"><img class="reader-image" width="1200" height="800" alt=""><div class="reader-image-error" role="status" hidden><p>这一页的插画暂时加载失败，可以重试，或继续读文字。</p><button class="btn btn-white" data-reader="image-retry">${icon('restart')}重试插画</button></div><button class="page-arrow prev" data-reader="prev" aria-label="上一页">${icon('left')}</button><button class="page-arrow next" data-reader="next" aria-label="下一页">${icon('chevron')}</button></div><p class="reader-text" aria-live="polite"></p><div class="reader-controls"><div class="language-switch" aria-label="故事语言">${book.languages.map(l=>`<button data-lang="${l}" aria-pressed="${l==='zh'}" class="${l==='zh'?'active':''}">${l==='zh'?'中文':'English'}</button>`).join('')}</div><div class="transport"><button class="icon-btn" data-reader="prev" aria-label="上一页">${icon('left')}</button><button class="play-button" data-reader="play" aria-label="播放当前页">${icon('play')}</button><button class="icon-btn" data-reader="next" aria-label="下一页">${icon('chevron')}</button></div><label class="auto-control"><input id="reader-auto" type="checkbox" checked>自动翻页</label></div><p class="reader-audio-status" role="status"></p><div class="reader-bottom"><button data-reader="restart">${icon('restart')} 从头阅读</button><button data-reader="text">${icon('text')} <span id="text-label">隐藏文字</span></button><span>左右滑动或按方向键翻页</span></div><button class="btn finish-reading" data-reader="finish" hidden>${icon('check')}我们读完啦</button><section class="reader-finished" hidden aria-live="polite"><h2>又读完了一个小小的世界 ✨</h2><p>和孩子聊聊，今天最喜欢故事里的哪一页？</p><button class="btn btn-white" data-reader="restart">${icon('restart')}再读一遍</button><a class="btn" href="/books">寻找下一个故事${icon('arrow')}</a></section></main></div>`;
 function save(completed=false){local.progress[id]={page,updated_at:new Date().toISOString(),completed};persist();}
 function setPlaying(on){playing=on;const b=$('[data-reader=play]');if(b){b.innerHTML=icon(on?'pause':'play');b.setAttribute('aria-label',on?'暂停朗读':'播放当前页');}}
 function status(message,retry=false){const el=$('.reader-audio-status');if(el)el.innerHTML=esc(message)+(retry?'<button data-reader="retry">重新播放</button>':'');}
 function stop(){epoch++;audio.pause();audio.currentTime=0;audio.onended=null;audio.onerror=null;audio.onplaying=null;audio.onwaiting=null;if(speechAvailable)window.speechSynthesis.cancel();utterance=null;setPlaying(false);}
 function currentAudio(){const path=lang==='zh'?pages[page].audio_zh:pages[page].audio_original;return path?assetURL(path,res.content_version||book.content_version):'';}
 function complete(){stop();finished=true;save(true);$('.reader-finished').hidden=false;$('[data-reader=finish]').hidden=true;status('这个故事读完啦。');$('.reader-finished').scrollIntoView?.({behavior:'smooth',block:'nearest'});}
 function onEnd(expected){if(disposed||expected!==epoch)return;setPlaying(false);audio.currentTime=0;utterance=null;if(page===pages.length-1){complete();return;}if(auto){changePage(page+1);play();}}
 const voiceKey=voice=>voice.voiceURI||`${voice.name}|${voice.lang}`;
 function deviceVoices(){return speechAvailable?window.speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().replace(/_/g,'-').split('-')[0]===lang):[];}
 function deviceVoice(){const voices=deviceVoices();return voices.find(v=>voiceKey(v)===preferences.voices[lang])||voices.find(v=>v.lang.toLowerCase()===(lang==='zh'?'zh-cn':'en-us'))||voices.find(v=>v.default)||voices[0];}
 function refreshVoices(){
  if(disposed)return;
  const select=$('#reader-voice'),hint=$('#reader-voice-hint'),voices=deviceVoices();
  const recorded=Boolean(currentAudio());
  select.disabled=recorded||!voices.length;
  if(recorded){select.innerHTML='<option value="">故事原配音</option>';hint.textContent='本页使用故事配音，可以调整语速。';return;}
  if(!voices.length){select.innerHTML='<option value="">'+(speechAvailable?'暂无可用声音':'设备不支持朗读')+'</option>';hint.textContent='声音由设备提供，可用声音因浏览器和系统而异。';return;}
  select.innerHTML='<option value="">自动选择</option>'+voices.map(v=>`<option value="${esc(voiceKey(v))}">${esc(v.name)} · ${esc(v.lang)}</option>`).join('');
  select.value=voices.some(v=>voiceKey(v)===preferences.voices[lang])?preferences.voices[lang]:'';
  hint.textContent='选择当前语言的设备声音，切换后从本页开头朗读。';
 }
 function restartDeviceReading(){if(!currentAudio()&&(playing||utterance)){const resume=playing;stop();if(resume)play();}}
 async function play(){
  if(disposed)return;const src=currentAudio();if(finished)save(false);finished=false;$('.reader-finished').hidden=true;$('[data-reader=finish]').hidden=page!==pages.length-1;
  if(src){
   if(!audio.src.endsWith(src)){audio.src=src;audio.load();}audio.volume=volume;audio.playbackRate=rate;
   const expected=++epoch;audio.onended=()=>onEnd(expected);audio.onerror=()=>{if(expected===epoch){setPlaying(false);status('音频暂时加载失败，可以重试或手动翻页。',true);}};
   audio.onwaiting=()=>{if(expected===epoch)status('正在加载这一页的声音…');};audio.onplaying=()=>{if(expected===epoch)status('正在播放逐页故事音频');};
   setPlaying(true);try{await audio.play();}catch{if(expected===epoch){setPlaying(false);status('声音未能播放，请再点一次播放。',true);}}return;
  }
  if(!speechAvailable){status('这本故事暂未配音，当前浏览器也不支持设备朗读。可以继续看图和阅读。');return;}
  const voice=deviceVoice();if(!voice){status('设备尚未提供'+(lang==='zh'?'中文':'英文')+'声音。这本故事仍可手动阅读。',true);return;}
  if(utterance&&window.speechSynthesis.paused){window.speechSynthesis.resume();setPlaying(true);status('设备朗读（非预生成配音） · '+voice.name);return;}
  const expected=++epoch;window.speechSynthesis.cancel();utterance=new SpeechSynthesisUtterance(lang==='zh'?pages[page].text_zh:pages[page].text_original);utterance.lang=voice.lang;utterance.voice=voice;utterance.rate=deviceSpeechBaseRate*rate;utterance.volume=volume;
  utterance.onend=()=>onEnd(expected);utterance.onerror=e=>{if(expected===epoch&&e.error!=='interrupted'&&e.error!=='canceled'){setPlaying(false);status('设备朗读暂时不可用，可以重试或手动翻页。',true);}};
  setPlaying(true);status('设备朗读（非预生成配音） · '+voice.name);window.speechSynthesis.speak(utterance);
 }
 function pause(){if(currentAudio())audio.pause();else if(speechAvailable)window.speechSynthesis.pause();setPlaying(false);status('已暂停，点击播放继续。');}
 function updateDialogue(){
  const p=pages[page];dialogueView?.render({config:p.dialogue,text:lang==='zh'?p.text_zh:p.text_original,language:lang,visible:showText,enabled:dialogueEnabled});
  $$('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.layout==='dialogue')===dialogueEnabled)));
 }
 function update(){
  const p=pages[page];$('.reader-image-wrap').classList.remove('image-failed');const img=$('.reader-image');$('.reader-image-error').hidden=true;img.src=assetURL(p.image,res.content_version||book.content_version);img.alt=p.image_alt;
  $('[data-reader=finish]').hidden=page!==pages.length-1||finished;
  $('#page-number').textContent=`第 ${page+1} 页 / 共 ${pages.length} 页`;$('.progress-dots').innerHTML=pages.map((_,i)=>`<button class="progress-dot ${i===page?'active':''}" data-page="${i}" aria-label="前往第 ${i+1} 页" ${i===page?'aria-current="step"':''}></button>`).join('');
  const text=$('.reader-text');text.textContent=lang==='zh'?p.text_zh:p.text_original;text.classList.toggle('english',lang==='en');text.hidden=!showText;
  updateDialogue();
  $$('[data-reader=prev]').forEach(b=>b.disabled=page===0);$$('[data-reader=next]').forEach(b=>b.disabled=page===pages.length-1);
  $$('.language-switch button').forEach(b=>{b.classList.toggle('active',b.dataset.lang===lang);b.setAttribute('aria-pressed',String(b.dataset.lang===lang));});
  $('.reader-finished').hidden=!finished;refreshVoices();status(currentAudio()?'点击播放，听听这一页的故事':'此故事暂未配音 · 可尝试设备朗读');
  if(pages[page+1]){const next=new Image();next.src=assetURL(pages[page+1].image,res.content_version||book.content_version);}
 }
 function rememberSettings(){Object.assign(preferences,{language:lang,auto,showText,rate,volume,night:$('.reader-page').classList.contains('reader-night')});persist();}
 function changePage(n){if(n<0||n>=pages.length)return;stop();page=n;finished=false;save();update();}
 function toggleText(){showText=!showText;$('.reader-text').hidden=!showText;updateDialogue();$('#text-label').textContent=showText?'隐藏文字':'显示文字';$('#reader-show-text').checked=showText;rememberSettings();}
 function click(e){const layoutEl=e.target.closest('[data-layout]');if(layoutEl&&dialogueView){dialogueEnabled=layoutEl.dataset.layout==='dialogue';preferences.readingLayout=dialogueEnabled?'dialogue':'standard';persist();updateDialogue();return;}const langEl=e.target.closest('[data-lang]');if(langEl){stop();audio.removeAttribute('src');audio.load();lang=langEl.dataset.lang;rememberSettings();update();return;}const dot=e.target.closest('[data-page]');if(dot){changePage(Number(dot.dataset.page));return;}const action=e.target.closest('[data-reader]')?.dataset.reader;if(!action)return;
  if(action==='finish'&&page===pages.length-1)complete();
  if(action==='image-retry'){const img=$('.reader-image');$('.reader-image-error').hidden=true;$('.reader-image-wrap').classList.remove('image-failed');img.removeAttribute('src');img.src=assetURL(pages[page].image,res.content_version||book.content_version);}
  if(action==='prev')changePage(page-1);if(action==='next')changePage(page+1);if(action==='play')playing?pause():play();if(action==='retry'){stop();audio.removeAttribute('src');audio.load();play();}if(action==='restart')changePage(0);if(action==='text')toggleText();
  if(action==='settings'){const p=$('.reader-settings');p.hidden=!p.hidden;$('[data-reader=settings]').setAttribute('aria-expanded',String(!p.hidden));}
  if(action==='night'){const on=$('.reader-page').classList.toggle('reader-night');$('[data-reader=night]').setAttribute('aria-pressed',String(on));rememberSettings();}
  if(action==='fullscreen'){if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}else{const stage=$('.reader-stage');if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>toast('浏览器未开启全屏，可继续当前模式阅读'));else toast('当前浏览器暂不支持全屏，请横屏阅读');}}
 }
 function key(e){if(e.key==='Escape'){$('.reader-settings').hidden=true;$('[data-reader=settings]').setAttribute('aria-expanded','false');}if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();changePage(page+1);}if(e.key==='ArrowLeft'){e.preventDefault();changePage(page-1);}if(e.code==='Space'){e.preventDefault();playing?pause():play();}}
 function initialize(){
  if(dialogueLayout){
   const stage=$('.reader-stage'),switcher=document.createElement('div');switcher.className='reader-layout-switch';
   switcher.innerHTML='<span>阅读排版</span><div role="group" aria-label="阅读排版"><button data-layout="dialogue" aria-pressed="true">角色对白</button><button data-layout="standard" aria-pressed="false">图下文字</button></div>';
   stage.prepend(switcher);dialogueView=dialogueModule.mountDialogue(stage);
  }
  document.addEventListener('click',click);document.addEventListener('keydown',key);
  const img=$('.reader-image');img.addEventListener('error',()=>{if(disposed)return;$('.reader-image-wrap').classList.add('image-failed');$('.reader-image-error').hidden=false;updateDialogue();});
  img.addEventListener('load',()=>{if(disposed)return;$('.reader-image-wrap').classList.remove('image-failed');$('.reader-image-error').hidden=true;updateDialogue();});
  $('.reader-page').classList.toggle('reader-night',preferences.night);$('[data-reader=night]').setAttribute('aria-pressed',String(preferences.night));
  $('#reader-auto').checked=auto;$('#reader-show-text').checked=showText;$('#reader-volume').value=String(volume);$('#reader-rate').value=String(rate);$('#text-label').textContent=showText?'隐藏文字':'显示文字';
  $('#reader-auto').onchange=e=>{auto=e.target.checked;rememberSettings();};
  $('#reader-volume').oninput=e=>{volume=Number(e.target.value);audio.volume=volume;rememberSettings();restartDeviceReading();};
  $('#reader-rate').onchange=e=>{const next=Number(e.target.value);if(!readingRates.includes(next))return;rate=next;audio.playbackRate=rate;rememberSettings();restartDeviceReading();};
  $('#reader-voice').onchange=e=>{const selected=e.target.value;if(currentAudio()||selected&&!deviceVoices().some(v=>voiceKey(v)===selected))return;preferences.voices[lang]=selected;rememberSettings();restartDeviceReading();};
  if(speechAvailable)window.speechSynthesis.addEventListener('voiceschanged',refreshVoices);
  $('#reader-show-text').onchange=()=>toggleText();
  $('#reader-sleep').onchange=e=>{clearTimeout(sleepTimer);const n=Number(e.target.value);if(n){sleepTimer=setTimeout(()=>{stop();toast('休息时间到了，晚安。');},n*60000);toast(`将在 ${n} 分钟后停止朗读`);}};
  let touchStart=null;const wrap=$('.reader-image-wrap');wrap.addEventListener('touchstart',e=>{touchStart={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};},{passive:true});wrap.addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)changePage(page+(dx<0?1:-1));touchStart=null;},{passive:true});
  update();save();if(new URLSearchParams(location.search).get('start')!=='1'&&remembered&&!remembered.completed&&remembered.page>0)toast(`已回到上次读到的第 ${page+1} 页`);
 }
 return {html,initialize,dispose:()=>{disposed=true;dialogueView?.dispose();stop();clearTimeout(sleepTimer);if(speechAvailable)window.speechSynthesis.removeEventListener('voiceschanged',refreshVoices);document.removeEventListener('click',click);document.removeEventListener('keydown',key);audio.removeAttribute('src');audio.load();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});}};
}

function navigate(href,replace=false) { if(replace)history.replaceState(null,'',href);else history.pushState(null,'',href);render(); }
async function render() {
 const token=++renderToken;disposePage();disposePage=()=>{};document.body.classList.remove('reading');$('#toast').hidden=true;
 $('#app').innerHTML='<main class="boot" id="main"><div class="loading-orbit"></div><p>正在翻开新的故事…</p></main>';
 window.scrollTo(0,0);
 try{
  if(!meta.ages.length&&!['/about','/privacy','/copyright'].includes(location.pathname))meta=await api('/api/categories');if(token!==renderToken)return;
  const path=location.pathname.replace(/\/$/,'')||'/';let html;
  if(path==='/'){document.title='小小绘本馆 · 把世界读给你听';html=await home();}
  else if(path==='/books')html=await catalogPage();
  else if(path==='/shelf')html=await shelf();
  else if(path.startsWith('/book/'))html=await detail(decodeURIComponent(path.slice(6)));
  else if(path.startsWith('/read/')){const r=await reader(decodeURIComponent(path.slice(6)),token);if(token!==renderToken||!r)return;$('#app').innerHTML=r.html;document.body.classList.add('reading');disposePage=r.dispose;r.initialize();return;}
  else if(['/about','/privacy','/copyright'].includes(path))html=policyPage(path);
  else html=pageShell(`<div class="error-view">${empty('这一页，躲起来了','沿着小路回到绘本馆，重新找一本喜欢的故事吧。')}</div>`);
  if(token!==renderToken)return;$('#app').innerHTML=html;
  $$('img').forEach(img=>img.addEventListener('error',()=>{img.classList.add('broken-cover');img.alt='插画暂时无法显示';},{once:true}));
  const sort=$('#sort');if(sort)sort.onchange=()=>filter('sort',sort.value);
 }catch(error){if(token!==renderToken)return;$('#app').innerHTML=pageShell(`<div class="error-view"><div class="empty">${icon('book')}<h2>故事稍稍等一等</h2><p>${esc(error.message)}</p><button class="btn" data-page-retry>再试一次${icon('restart')}</button><a class="text-link" href="/books">回到绘本馆</a></div></div>`);}
}
function filter(key,value){const p=new URLSearchParams(location.search);p.delete('offset');if(value)p.set(key,value);else p.delete(key);navigate('/books'+(p.size?'?'+p:''));}
document.addEventListener('click',e=>{
 const save=e.target.closest('[data-save]');if(save){e.preventDefault();toggleFavorite(save.dataset.save);if(location.pathname==='/shelf'&&!location.search.includes('history'))render();return;}
 const f=e.target.closest('[data-filter]');if(f){filter(f.dataset.filter,f.dataset.value);return;}
 const offset=e.target.closest('[data-offset]');if(offset){const params=new URLSearchParams(location.search);params.set('offset',offset.dataset.offset);navigate(location.pathname+'?'+params);return;}
 if(e.target.closest('[data-reset]')){navigate('/books');return;}
 if(e.target.closest('[data-page-retry]')){render();return;}
 if(e.target.closest('[data-clear-history]')){if(window.confirm('清除当前浏览器的全部阅读记录？收藏会保留。')){local.progress={};persist();render();toast('阅读记录已清除');}return;}
 const a=e.target.closest('a');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0||a.target||a.hasAttribute('download'))return;
 const url=new URL(a.href,location.href);if(url.origin===location.origin&&!url.hash&&!url.pathname.startsWith('/assets/')){e.preventDefault();navigate(url.pathname+url.search);}
});
document.addEventListener('submit',e=>{if(!e.target.matches('[data-search]'))return;e.preventDefault();const q=new FormData(e.target).get('q')?.trim()||'';if(e.target.classList.contains('catalog-search'))filter('q',q);else navigate('/books'+(q?'?q='+encodeURIComponent(q):''));});
window.addEventListener('popstate',render);
window.addEventListener('storage',e=>{if(e.key===storeKey||e.key===null){local=loadStore();if(location.pathname==='/shelf')render();}});
render();
