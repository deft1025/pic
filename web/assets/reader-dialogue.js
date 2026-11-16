// Speech ranges and illustration anchors come only from the book API.
export function mountDialogue(stage) {
 const picture=stage.querySelector('.reader-image-wrap'),image=picture.querySelector('.reader-image');
 const transcript=stage.querySelector('.reader-text'),scene=stage.querySelector('.reader-scene'),copy=stage.querySelector('.reader-copy');
 const overlay=document.createElement('div'),panel=document.createElement('div');
 overlay.className='reader-dialogue';overlay.setAttribute('aria-hidden','true');overlay.hidden=true;picture.append(overlay);
 panel.className='dialogue-panel';panel.hidden=true;copy.prepend(panel);
 let disposed=false,state=null,selected=0,frame=0,entries=[];
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 function validParts(config,text,language){
  if(!config||config.length?.[language]!==text.length||!Array.isArray(config.parts)||!config.parts.length)return false;
  let cursor=0;
  return config.parts.every(p=>{
   if(!p)return false;
   const start=p.start?.[language],end=p.end?.[language];
   const valid=Number.isInteger(start)&&Number.isInteger(end)&&start>=cursor&&end>start&&end<=text.length&&[p.x,p.y,p.width].every(Number.isFinite)&&p.x>=0&&p.y>=0&&p.y<100&&p.width>0&&p.x+p.width<=100&&typeof p.speaker?.[language]==='string'&&(p.target==null||(Array.isArray(p.target)&&p.target.length===2&&p.target.every(n=>Number.isFinite(n)&&n>=0&&n<=100)));
   cursor=end;return valid;
  });
 }
 function schedule(){
  if(disposed||frame||!state?.active)return;
  if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(()=>{frame=0;layout();});
 }
 function intersects(a,b,gap=0){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
 function distance(r,t){return Math.hypot(t[0]-clamp(t[0],r.x,r.x+r.w),t[1]-clamp(t[1],r.y,r.y+r.h));}
 function layout(){
  if(disposed||!state?.active)return;
  const W=picture.clientWidth,H=picture.clientHeight;if(!W||!H)return;
  // Account for contain letterboxing: percentages are relative to the actual artwork.
  const ratio=image?.naturalWidth/image?.naturalHeight||state.config.aspect_ratio?.[0]/state.config.aspect_ratio?.[1]||W/H;
  const w=Math.min(W,H*ratio),h=w/ratio,ox=(W-w)/2,oy=(H-h)/2;
  Object.assign(overlay.style,{left:ox+'px',top:oy+'px',width:w+'px',height:h+'px'});
  const targets=entries.filter(e=>e.part.target).map(e=>[e.part.target[0]*w/100,e.part.target[1]*h/100]);
  const obstacles=[...picture.querySelectorAll('.page-arrow')].filter(el=>el.offsetWidth&&el.offsetHeight).map(el=>({x:el.offsetLeft-ox,y:el.offsetTop-el.offsetHeight/2-oy,w:el.offsetWidth,h:el.offsetHeight}));
  const guard=clamp(w*.025,16,30),pad=7;
  function place(entry,placed,scroll=false,protectAll=true){
   if(!entry.part.target)return null;
   const t=entry.part.target.map((n,i)=>n*(i?h:w)/100),el=entry.bubble;
   el.hidden=false;el.style.visibility='hidden';el.style.maxHeight=scroll?Math.min(h-pad*2,Math.max(78,h*.5))+'px':'';el.classList.toggle('dialogue-scroll',scroll);
   const maxWidth=Math.min(w-pad*2,340),minWidth=Math.min(maxWidth,scroll?Math.max(64,w*.28):150);
   const preferred=clamp(entry.part.width*w/100,minWidth,maxWidth);
   const widths=[preferred,clamp(w*.45,minWidth,maxWidth),maxWidth,minWidth];let best=null;
   for(const width of new Set(widths.map(Math.round))){
    el.style.width=width+'px';const bh=el.offsetHeight;
    if(bh>h-pad*2)continue;
    const xs=[t[0]-width/2,t[0]+guard,t[0]-guard-width,entry.part.x*w/100,pad,w-width-pad];
    const ys=[t[1]-guard-bh,t[1]+guard,t[1]-bh/2,entry.part.y*h/100,pad,h-bh-pad];
    for(const x0 of xs)for(const y0 of ys){
     const r={x:clamp(x0,pad,w-width-pad),y:clamp(y0,pad,h-bh-pad),w:width,h:bh};
     if((protectAll?targets:[t]).some(p=>distance(r,p)<guard)||obstacles.some(o=>intersects(r,o,4))||placed.some(o=>intersects(r,o,8)))continue;
     const end=[clamp(t[0],r.x+8,r.x+r.w-8),clamp(t[1],r.y+8,r.y+r.h-8)];
     // Do not send another character's tail through an existing bubble.
     const blocked=placed.some(o=>Array.from({length:9},(_,i)=>({x:t[0]+(end[0]-t[0])*(i+1)/10,y:t[1]+(end[1]-t[1])*(i+1)/10,w:1,h:1})).some(p=>intersects(p,o,3)));
     if(blocked)continue;
     const score=distance(r,t)+Math.hypot(r.x-entry.part.x*w/100,r.y-entry.part.y*h/100)*.12+Math.abs(width-preferred)*.06;
     if(!best||score<best.score)best={...r,end,target:t,score};
    }
   }
   el.style.visibility='';return best;
  }
  entries.forEach(e=>{e.bubble.hidden=false;});
  let placements=[],sequential=false;
  for(const entry of entries){const r=place(entry,placements);if(!r){sequential=true;break;}placements.push(r);}
  if(sequential){
   placements=[];const entry=entries[selected];
   let r=place(entry,[])||place(entry,[],true)||place(entry,[],true,false);
   // At very small landscape sizes keep every word reachable inside the art.
   if(!r){
    const el=entry.bubble;el.hidden=false;el.classList.add('dialogue-scroll');el.style.width=(w-pad*2)+'px';el.style.maxHeight=(h-pad*2)+'px';
    r={x:pad,y:pad,w:w-pad*2,h:el.offsetHeight,end:[w/2,pad],target:entry.part.target?.map((n,i)=>n*(i?h:w)/100)||null};
   }
   placements=[r];
  }
  entries.forEach(e=>{e.bubble.hidden=true;});overlay.querySelectorAll('svg').forEach(e=>e.remove());
  const shown=sequential?[entries[selected]]:entries;
  shown.forEach((entry,i)=>{
   const r=placements[i];if(!r)return;
   const bubble=entry.bubble;bubble.hidden=false;
   Object.assign(bubble.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',visibility:''});
   if(!r.target)return;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');svg.classList.add('dialogue-tail');
   const line=document.createElementNS('http://www.w3.org/2000/svg','path');
   // Shorten the tip slightly so the tail points to, rather than covers, the mouth.
   const d=Math.hypot(r.target[0]-r.end[0],r.target[1]-r.end[1])||1;
   const tx=r.target[0]+(r.end[0]-r.target[0])*5/d,ty=r.target[1]+(r.end[1]-r.target[1])*5/d;
   const nx=-(r.target[1]-r.end[1])/d*4,ny=(r.target[0]-r.end[0])/d*4;
   line.setAttribute('d',`M${r.end[0]+nx} ${r.end[1]+ny} L${tx} ${ty} L${r.end[0]-nx} ${r.end[1]-ny} Z`);svg.append(line);overlay.prepend(svg);
  });
  scene.classList.toggle('reader-dialogue-sequential',sequential);
  panel.querySelector('.dialogue-navigation').hidden=!sequential||entries.length<2;
  const counter=panel.querySelector('.dialogue-counter');counter.textContent=`${selected+1} / ${entries.length}`;counter.setAttribute('aria-label',`${entries[selected].part.speaker[state.language]}：${entries[selected].words}`);
  panel.querySelector('[data-dialogue=prev]').disabled=selected===0;
  panel.querySelector('[data-dialogue=next]').disabled=selected===entries.length-1;
  // Narration stays outside the artwork. The full original sequence is always available.
  panel.querySelectorAll('.dialogue-narration').forEach((el,i)=>{el.hidden=sequential&&i!==selected;});
  overlay.dataset.mode=sequential?'single':'all';
 }
 function render({config,text,language,visible,enabled}){
  if(disposed)return;
  if(state?.config!==config||state?.text!==text||state?.language!==language)selected=0;
  const active=Boolean(enabled&&!picture.classList.contains('image-failed')&&validParts(config,text,language));
  state={config,text,language,active:active&&visible};
  scene.classList.toggle('reader-dialogue-mode',Boolean(enabled));
  picture.classList.toggle('dialogue-canvas',active);
  transcript.classList.toggle('dialogue-transcript',active);
  overlay.hidden=!active||!visible;panel.hidden=!active||!visible;
  overlay.replaceChildren();panel.replaceChildren();entries=[];
  if(!active)return;
  let cursor=0;
  config.parts.forEach((part,i)=>{
   const words=text.slice(part.start[language],part.end[language]);
   const bubble=document.createElement('div');bubble.className='dialogue-bubble';bubble.dataset.anchored=String(Boolean(part.target));bubble.hidden=true;
   const speaker=document.createElement('span');speaker.className='dialogue-speaker';speaker.textContent=part.speaker[language];
   const p=document.createElement('p');p.lang=language==='zh'?'zh-CN':'en';p.textContent=words;bubble.append(speaker,p);overlay.append(bubble);
   const narration=document.createElement('div');narration.className='dialogue-narration';narration.setAttribute('aria-hidden','true');
   const n=document.createElement('p');n.textContent=text.slice(cursor,part.start[language])+(i===config.parts.length-1?text.slice(part.end[language]):text.slice(part.end[language],config.parts[i+1].start[language]));n.lang=p.lang;narration.append(n);panel.append(narration);
   cursor=i===config.parts.length-1?text.length:config.parts[i+1].start[language];
   entries.push({part,bubble,words});
  });
  const nav=document.createElement('div');nav.className='dialogue-navigation';nav.setAttribute('role','group');nav.setAttribute('aria-label','切换角色对白');nav.hidden=true;
  for(const [action,label] of [['prev','上一句'],['count',''],['next','下一句']]){
   const el=document.createElement(action==='count'?'span':'button');
   if(action==='count'){el.className='dialogue-counter';el.setAttribute('aria-live','polite');}
   else {el.dataset.dialogue=action;el.textContent=label;el.type='button';}
   nav.append(el);
  }
  panel.prepend(nav);
  const full=document.createElement('details');full.className='dialogue-full-text';const summary=document.createElement('summary'),p=document.createElement('p');summary.textContent='完整文字';p.textContent=text;p.lang=language==='zh'?'zh-CN':'en';full.append(summary,p);panel.append(full);
  // Page/image/language changes commit visible speech together; resize remains batched.
  layout();
 }
 function click(e){
  const action=e.target.closest('[data-dialogue]')?.dataset.dialogue;
  if(!action||!entries.length)return;
  selected=clamp(selected+(action==='next'?1:-1),0,entries.length-1);layout();
 }
 panel.addEventListener('click',click);
 const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;observer?.observe(picture);
 globalThis.addEventListener?.('resize',schedule);
 document.fonts?.ready.then(()=>{if(!disposed)schedule();});
 return {render,dispose(){disposed=true;observer?.disconnect();globalThis.removeEventListener?.('resize',schedule);if(frame)cancelAnimationFrame(frame);panel.removeEventListener('click',click);}};
}
